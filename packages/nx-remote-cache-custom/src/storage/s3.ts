import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { Effect, Layer, Option, Redacted } from 'effect';
import type { Readable } from 'node:stream';
import { CacheStorage, EntryAlreadyExists, StorageError } from './cache-storage.ts';

/** S3 or an S3-compatible store (MinIO, Ceph, …). */
export interface S3StorageConfig {
  readonly bucket: string;
  readonly region: string;
  /** Custom endpoint, e.g. `http://minio:9000`; unset → AWS. */
  readonly endpoint: Option.Option<string>;
  /** Path-style URLs (`<endpoint>/<bucket>/<key>`), required by MinIO. */
  readonly forcePathStyle: boolean;
  /** Static credentials; unset → default AWS credential chain (env, IRSA, instance profile …). */
  readonly credentials: Option.Option<{ readonly accessKeyId: string; readonly secretAccessKey: Redacted.Redacted }>;
  readonly keyPrefix: string;
  /** Create the bucket on startup if it is missing (local/dev). */
  readonly createBucket: boolean;
}

const statusOf = (error: unknown) => (error instanceof S3ServiceException ? error.$metadata.httpStatusCode : undefined);
const isNotFound = (error: unknown) =>
  statusOf(error) === 404 || (error instanceof S3ServiceException && ['NoSuchKey', 'NotFound'].includes(error.name));
/** Conditional create (`If-None-Match: *`) lost: 412 if the object exists, 409 if a concurrent write is in flight. */
const isConditionFailed = (error: unknown) => statusOf(error) === 412 || statusOf(error) === 409;

export const layerS3 = (config: S3StorageConfig) =>
  Layer.effect(
    CacheStorage,
    Effect.gen(function* () {
      const client = yield* Effect.acquireRelease(
        Effect.sync(
          () =>
            new S3Client({
              region: config.region,
              endpoint: Option.getOrUndefined(config.endpoint),
              forcePathStyle: config.forcePathStyle,
              credentials: Option.getOrUndefined(
                Option.map(config.credentials, ({ accessKeyId, secretAccessKey }) => ({
                  accessKeyId,
                  secretAccessKey: Redacted.value(secretAccessKey),
                })),
              ),
              // Default checksums stream the body as aws-chunked with trailers; not every S3-compatible store
              // supports that. Content-Length + TLS are enough for cache artifacts.
              requestChecksumCalculation: 'WHEN_REQUIRED',
              responseChecksumValidation: 'WHEN_REQUIRED',
            }),
        ),
        (client) => Effect.sync(() => client.destroy()),
      );

      const send = <A>(operation: string, run: (signal: AbortSignal) => Promise<A>) =>
        Effect.tryPromise({ try: run, catch: (cause) => new StorageError({ operation, cause }) });
      const objectKey = (key: string) => `${config.keyPrefix}${key}`;

      // fail fast on wrong endpoint/credentials/bucket instead of on the first cache request
      yield* send('head-bucket', (abortSignal) =>
        client.send(new HeadBucketCommand({ Bucket: config.bucket }), { abortSignal }),
      ).pipe(
        Effect.catchIf(
          (error) => config.createBucket && isNotFound(error.cause),
          () =>
            send('create-bucket', (abortSignal) =>
              client.send(new CreateBucketCommand({ Bucket: config.bucket }), { abortSignal }),
            ).pipe(Effect.tap(() => Effect.logInfo(`created bucket ${config.bucket}`))),
        ),
      );

      return CacheStorage.of({
        name: `s3:${config.bucket}`,
        get: (key) =>
          send('get', (abortSignal) =>
            client.send(new GetObjectCommand({ Bucket: config.bucket, Key: objectKey(key) }), { abortSignal }),
          ).pipe(
            Effect.map((output) => Option.some({ body: output.Body as Readable, contentLength: output.ContentLength })),
            Effect.catchIf(
              (error) => isNotFound(error.cause),
              () => Effect.succeedNone,
            ),
          ),
        exists: (key) =>
          send('head', (abortSignal) =>
            client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey(key) }), { abortSignal }),
          ).pipe(
            Effect.as(true),
            Effect.catchIf(
              (error) => isNotFound(error.cause),
              () => Effect.succeed(false),
            ),
          ),
        put: (key, body, contentLength) =>
          send('put', (abortSignal) =>
            client.send(
              new PutObjectCommand({
                Bucket: config.bucket,
                Key: objectKey(key),
                Body: body,
                ContentLength: contentLength,
                ContentType: 'application/octet-stream',
                IfNoneMatch: '*',
              }),
              { abortSignal },
            ),
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
