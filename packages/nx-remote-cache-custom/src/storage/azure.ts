import { DefaultAzureCredential } from '@azure/identity';
import { BlobServiceClient, RestError, StorageSharedKeyCredential } from '@azure/storage-blob';
import { Effect, Layer, Option, Redacted } from 'effect';
import type { Readable } from 'node:stream';
import { CacheStorage, EntryAlreadyExists, StorageError } from './cache-storage.ts';

/** How to authenticate against the storage account. */
export type AzureAuth =
  | { readonly _tag: 'ConnectionString'; readonly connectionString: Redacted.Redacted }
  | { readonly _tag: 'SharedKey'; readonly accountName: string; readonly accountKey: Redacted.Redacted }
  /** Managed identity / workload identity / az login via DefaultAzureCredential (needs "Storage Blob Data Contributor"). */
  | { readonly _tag: 'DefaultCredential' };

export interface AzureStorageConfig {
  readonly auth: AzureAuth;
  /** Blob service URL, e.g. `https://<account>.blob.core.windows.net`; required unless a connection string is used. */
  readonly accountUrl: Option.Option<string>;
  readonly container: string;
  readonly keyPrefix: string;
  /** Create the container on startup if it is missing (local/dev). */
  readonly createContainer: boolean;
}

const statusOf = (error: unknown) => (error instanceof RestError ? error.statusCode : undefined);
/** Conditional create (`If-None-Match: *`) lost: 409 BlobAlreadyExists or 412 ConditionNotMet. */
const isConditionFailed = (error: unknown) => statusOf(error) === 409 || statusOf(error) === 412;

/** Upload in 8 MiB blocks, 4 in parallel; the conditional commit of the block list makes the write atomic. */
const UPLOAD_BLOCK_SIZE = 8 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 4;

const serviceClientOf = (config: AzureStorageConfig) => {
  const accountUrl = Option.getOrUndefined(config.accountUrl);
  switch (config.auth._tag) {
    case 'ConnectionString':
      return BlobServiceClient.fromConnectionString(Redacted.value(config.auth.connectionString));
    case 'SharedKey': {
      const url = accountUrl ?? `https://${config.auth.accountName}.blob.core.windows.net`;
      return new BlobServiceClient(
        url,
        new StorageSharedKeyCredential(config.auth.accountName, Redacted.value(config.auth.accountKey)),
      );
    }
    case 'DefaultCredential':
      if (!accountUrl) throw new Error('AZURE_STORAGE_ACCOUNT_URL is required for DefaultAzureCredential');
      return new BlobServiceClient(accountUrl, new DefaultAzureCredential());
  }
};

export const layerAzure = (config: AzureStorageConfig) =>
  Layer.effect(
    CacheStorage,
    Effect.gen(function* () {
      const container = yield* Effect.try({
        try: () => serviceClientOf(config).getContainerClient(config.container),
        catch: (cause) => new StorageError({ operation: 'connect', cause }),
      });
      const call = <A>(operation: string, run: (abortSignal: AbortSignal) => Promise<A>) =>
        Effect.tryPromise({ try: run, catch: (cause) => new StorageError({ operation, cause }) });
      const blobOf = (key: string) => container.getBlockBlobClient(`${config.keyPrefix}${key}`);

      // fail fast on wrong account/credentials/container instead of on the first cache request
      if (config.createContainer) {
        yield* call('create-container', (abortSignal) => container.createIfNotExists({ abortSignal })).pipe(
          Effect.tap(({ succeeded }) =>
            succeeded ? Effect.logInfo(`created container ${config.container}`) : Effect.void,
          ),
        );
      } else {
        const exists = yield* call('container-exists', (abortSignal) => container.exists({ abortSignal }));
        if (!exists) {
          return yield* new StorageError({
            operation: 'container-exists',
            cause: new Error(`container ${config.container} does not exist`),
          });
        }
      }

      return CacheStorage.of({
        name: `azure:${container.accountName}/${config.container}`,
        get: (key) =>
          call('get', (abortSignal) => blobOf(key).download(0, undefined, { abortSignal })).pipe(
            Effect.map((response) =>
              Option.some({
                body: response.readableStreamBody as Readable,
                contentLength: response.contentLength,
              }),
            ),
            Effect.catchIf(
              (error) => statusOf(error.cause) === 404,
              () => Effect.succeedNone,
            ),
          ),
        exists: (key) => call('exists', (abortSignal) => blobOf(key).exists({ abortSignal })),
        put: (key, body) =>
          call('put', (abortSignal) =>
            blobOf(key).uploadStream(body, UPLOAD_BLOCK_SIZE, UPLOAD_CONCURRENCY, {
              abortSignal,
              conditions: { ifNoneMatch: '*' },
              blobHTTPHeaders: { blobContentType: 'application/octet-stream' },
            }),
          ).pipe(
            Effect.asVoid,
            Effect.catchIf(
              (error) => isConditionFailed(error.cause),
              () => Effect.fail(new EntryAlreadyExists({ key })),
            ),
          ),
      });
    }),
  );
