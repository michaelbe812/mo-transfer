import { Effect, Exit, type Layer, ManagedRuntime, Option, Redacted } from 'effect';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { afterAll, describe, expect, it } from 'vitest';
import { layerAzure } from './azure.ts';
import { CacheStorage, type StorageError } from './cache-storage.ts';
import { layerMemory } from './memory.ts';
import { layerS3 } from './s3.ts';

/**
 * The same contract for every backend. MinIO and Azure(ite) run only when configured, e.g. against
 * `docker/compose.yml`:
 *   NX_CACHE_IT_S3_ENDPOINT=http://localhost:9000
 *   NX_CACHE_IT_AZURE_CONNECTION_STRING='DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;…'
 */
const env = process.env;
const backends: ReadonlyArray<{ name: string; layer: Layer.Layer<CacheStorage, StorageError> | undefined }> = [
  { name: 'memory', layer: layerMemory },
  {
    name: 's3/minio',
    layer: env['NX_CACHE_IT_S3_ENDPOINT']
      ? layerS3({
          bucket: env['NX_CACHE_IT_S3_BUCKET'] ?? 'nx-cache-it',
          region: 'us-east-1',
          endpoint: Option.some(env['NX_CACHE_IT_S3_ENDPOINT']),
          forcePathStyle: true,
          credentials: Option.some({
            accessKeyId: env['NX_CACHE_IT_S3_ACCESS_KEY_ID'] ?? 'minioadmin',
            secretAccessKey: Redacted.make(env['NX_CACHE_IT_S3_SECRET_ACCESS_KEY'] ?? 'minioadmin'),
          }),
          keyPrefix: 'contract-test/',
          createBucket: true,
        })
      : undefined,
  },
  {
    name: 'azure',
    layer: env['NX_CACHE_IT_AZURE_CONNECTION_STRING']
      ? layerAzure({
          auth: {
            _tag: 'ConnectionString',
            connectionString: Redacted.make(env['NX_CACHE_IT_AZURE_CONNECTION_STRING']),
          },
          accountUrl: Option.none(),
          container: env['NX_CACHE_IT_AZURE_CONTAINER'] ?? 'nx-cache-it',
          keyPrefix: 'contract-test/',
          createContainer: true,
        })
      : undefined,
  },
];

const uniqueHash = () => `${Date.now()}${randomBytes(4).readUInt32BE()}`;

for (const { name, layer } of backends) {
  describe.skipIf(!layer)(`CacheStorage contract: ${name}`, () => {
    const runtime = ManagedRuntime.make(layer ?? layerMemory);
    afterAll(() => runtime.dispose());
    const run = <A, E>(effect: Effect.Effect<A, E, CacheStorage>) => runtime.runPromise(effect);
    const runExit = <A, E>(effect: Effect.Effect<A, E, CacheStorage>) => runtime.runPromiseExit(effect);

    const put = (hash: string, data: Buffer) =>
      CacheStorage.use((storage) => storage.put(hash, Readable.from([data]), data.length));
    const read = (hash: string) =>
      CacheStorage.use((storage) => storage.get(hash)).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(undefined),
            onSome: (entry) => Effect.promise(() => buffer(entry.body)),
          }),
        ),
      );
    const exists = (hash: string) => CacheStorage.use((storage) => storage.exists(hash));

    it('reports a miss for an unknown hash', async () => {
      const hash = uniqueHash();
      expect(await run(read(hash))).toBeUndefined();
      expect(await run(exists(hash))).toBe(false);
    });

    it('round-trips an entry', async () => {
      const hash = uniqueHash();
      const data = randomBytes(64 * 1024);
      await run(put(hash, data));
      expect(await run(exists(hash))).toBe(true);
      expect((await run(read(hash)))?.equals(data)).toBe(true);
    });

    it('round-trips an entry larger than one upload block', async () => {
      const hash = uniqueHash();
      const data = randomBytes(20 * 1024 * 1024);
      await run(put(hash, data));
      expect((await run(read(hash)))?.equals(data)).toBe(true);
    });

    it('rejects a second write of the same hash and keeps the first', async () => {
      const hash = uniqueHash();
      const first = randomBytes(1024);
      await run(put(hash, first));
      const exit = await runExit(put(hash, randomBytes(1024)));
      expect(Exit.isFailure(exit) && JSON.stringify(exit.cause)).toContain('EntryAlreadyExists');
      expect((await run(read(hash)))?.equals(first)).toBe(true);
    });

    it('lets exactly one of concurrent writers win', async () => {
      const hash = uniqueHash();
      const candidates = [randomBytes(256 * 1024), randomBytes(256 * 1024), randomBytes(256 * 1024)];
      const exits = await Promise.all(candidates.map((data) => runExit(put(hash, data))));
      expect(exits.filter(Exit.isSuccess)).toHaveLength(1);
      const stored = await run(read(hash));
      expect(candidates[exits.findIndex(Exit.isSuccess)].equals(stored ?? Buffer.alloc(0))).toBe(true);
    });
  });
}
