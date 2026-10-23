import { Config, Effect, Layer, Option, Redacted } from 'effect';
import { type AzureAuth, layerAzure } from './storage/azure.ts';
import { layerMemory } from './storage/memory.ts';
import { layerS3 } from './storage/s3.ts';

/** Access tokens per role (see `Role` in auth.ts). */
export interface AccessTokens {
  readonly ci: ReadonlyArray<Redacted.Redacted>;
  readonly dev: ReadonlyArray<Redacted.Redacted>;
  readonly readOnly: ReadonlyArray<Redacted.Redacted>;
}

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  readonly tokens: AccessTokens;
  /** Upper bound for one task output; larger uploads are rejected with 413. */
  readonly maxEntryBytes: number;
}

/** Comma-separated list of secrets → one Redacted per token (several tokens allow rotation without downtime). */
const tokenList = (name: string) =>
  Config.Redacted(name).pipe(
    Config.option,
    Config.map((value) =>
      Option.match(value, {
        onNone: () => [],
        onSome: (secret) =>
          Redacted.value(secret)
            .split(',')
            .map((token) => token.trim())
            .filter((token) => token.length > 0)
            .map((token) => Redacted.make(token)),
      }),
    ),
  );

export const serverConfig = Effect.gen(function* () {
  const tokens: AccessTokens = {
    ci: yield* tokenList('NX_CACHE_CI_TOKENS'),
    dev: yield* tokenList('NX_CACHE_DEV_TOKENS'),
    readOnly: yield* tokenList('NX_CACHE_READ_ONLY_TOKENS'),
  };
  if (Object.values(tokens).every((list) => list.length === 0)) {
    return yield* Effect.die(new Error('set NX_CACHE_CI_TOKENS, NX_CACHE_DEV_TOKENS and/or NX_CACHE_READ_ONLY_TOKENS'));
  }
  return {
    port: yield* Config.Port('PORT').pipe(Config.withDefault(3000)),
    host: yield* Config.String('HOST').pipe(Config.withDefault('0.0.0.0')),
    tokens,
    maxEntryBytes: yield* Config.Int('NX_CACHE_MAX_ENTRY_BYTES').pipe(Config.withDefault(2 * 1024 ** 3)),
  } satisfies ServerConfig;
});

const optionalString = (name: string) => Config.option(Config.NonEmptyString(name));

const s3Layer = Effect.gen(function* () {
  const endpoint = yield* optionalString('S3_ENDPOINT');
  const accessKeyId = yield* optionalString('S3_ACCESS_KEY_ID');
  const secretAccessKey = yield* Config.option(Config.Redacted('S3_SECRET_ACCESS_KEY'));
  return layerS3({
    bucket: yield* Config.NonEmptyString('S3_BUCKET'),
    region: yield* Config.String('S3_REGION').pipe(Config.withDefault('us-east-1')),
    endpoint,
    // MinIO and most S3-compatible stores need path-style; AWS does not
    forcePathStyle: yield* Config.Boolean('S3_FORCE_PATH_STYLE').pipe(Config.withDefault(Option.isSome(endpoint))),
    credentials: Option.zipWith(accessKeyId, secretAccessKey, (id, secret) => ({
      accessKeyId: id,
      secretAccessKey: secret,
    })),
    keyPrefix: yield* Config.String('STORAGE_KEY_PREFIX').pipe(Config.withDefault('')),
    createBucket: yield* Config.Boolean('STORAGE_CREATE_BUCKET').pipe(Config.withDefault(false)),
  });
});

const azureLayer = Effect.gen(function* () {
  const connectionString = yield* Config.option(Config.Redacted('AZURE_STORAGE_CONNECTION_STRING'));
  const accountName = yield* optionalString('AZURE_STORAGE_ACCOUNT_NAME');
  const accountKey = yield* Config.option(Config.Redacted('AZURE_STORAGE_ACCOUNT_KEY'));
  // precedence: connection string → account name + key → DefaultAzureCredential (managed identity)
  const auth: AzureAuth = Option.isSome(connectionString)
    ? { _tag: 'ConnectionString', connectionString: connectionString.value }
    : Option.isSome(accountName) && Option.isSome(accountKey)
      ? { _tag: 'SharedKey', accountName: accountName.value, accountKey: accountKey.value }
      : { _tag: 'DefaultCredential' };
  return layerAzure({
    auth,
    accountUrl: yield* optionalString('AZURE_STORAGE_ACCOUNT_URL'),
    container: yield* Config.NonEmptyString('AZURE_STORAGE_CONTAINER'),
    keyPrefix: yield* Config.String('STORAGE_KEY_PREFIX').pipe(Config.withDefault('')),
    createContainer: yield* Config.Boolean('STORAGE_CREATE_BUCKET').pipe(Config.withDefault(false)),
  });
});

/** Storage backend chosen by `STORAGE_PROVIDER` (`minio` is an alias of `s3`). */
export const storageLayerFromConfig = Layer.unwrap(
  Effect.gen(function* () {
    const provider = yield* Config.Literals(['s3', 'minio', 'azure', 'memory'], 'STORAGE_PROVIDER');
    switch (provider) {
      case 's3':
      case 'minio':
        return yield* s3Layer;
      case 'azure':
        return yield* azureLayer;
      case 'memory':
        return layerMemory;
    }
  }),
);
