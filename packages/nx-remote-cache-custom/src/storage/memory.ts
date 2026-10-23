import { Effect, Layer, Option } from 'effect';
import { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import { CacheStorage, EntryAlreadyExists, StorageError } from './cache-storage.ts';

/** In-memory backend for tests and local experiments — not for production (unbounded, lost on restart). */
export const layerMemory = Layer.sync(CacheStorage, () => {
  const entries = new Map<string, Buffer>();
  return CacheStorage.of({
    name: 'memory',
    get: (key) =>
      Effect.sync(() =>
        Option.fromNullishOr(entries.get(key)).pipe(
          Option.map((data) => ({ body: Readable.from([data]), contentLength: data.length })),
        ),
      ),
    exists: (key) => Effect.sync(() => entries.has(key)),
    put: Effect.fnUntraced(function* (key, body) {
      if (entries.has(key)) return yield* new EntryAlreadyExists({ key });
      const data = yield* Effect.tryPromise({
        try: () => buffer(body),
        catch: (cause) => new StorageError({ operation: 'put', cause }),
      });
      // re-check after the async read: a concurrent put may have won meanwhile
      if (entries.has(key)) return yield* new EntryAlreadyExists({ key });
      entries.set(key, data);
    }),
  });
});
