import { NodeStream } from '@effect/platform-node';
import { Effect, Layer, Option } from 'effect';
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from 'effect/http';
import { keyOf, policyOf, roleOf } from './auth.ts';
import type { ServerConfig } from './config.ts';
import { CacheStorage, StorageError } from './storage/cache-storage.ts';

/**
 * Nx custom remote cache spec (OpenAPI 1.0.0, https://nx.dev/docs/kb/self-hosted-caching):
 *   GET /v1/cache/{hash}  200 octet-stream | 401 | 403 | 404
 *   PUT /v1/cache/{hash}  200 | 401 | 403 (read-only token) | 409 (exists, never overwritten)
 * Plus GET /health (no auth) for container probes.
 * Reads and writes go to the namespaces of the caller's role (`policyOf`); `x-nx-cache-namespace` on a hit
 * names the namespace that served it.
 */

/** Nx hashes are decimal digits; allow a safe superset, never path separators or dots. */
const VALID_HASH = /^[A-Za-z0-9_-]{1,256}$/;

const plain = (status: number, body: string) => HttpServerResponse.text(body, { status });

const hashParam = Effect.map(HttpRouter.params, (params) => Option.fromNullishOr(params['hash']));

const withStorageErrors =
  (operation: string) =>
  <A, R>(self: Effect.Effect<A, StorageError, R>) =>
    self.pipe(
      Effect.catchTag('StorageError', (error) =>
        Effect.logError(`storage ${operation} failed`, error.cause).pipe(Effect.as(plain(500, 'Storage error'))),
      ),
    );

export const cacheRoutes = (config: ServerConfig) =>
  HttpRouter.use(
    Effect.fn(function* (router) {
      const storage = yield* CacheStorage;

      yield* router.add('GET', '/health', Effect.succeed(plain(200, 'ok')));

      yield* router.add(
        'GET',
        '/v1/cache/:hash',
        Effect.fn(function* (request: HttpServerRequest.HttpServerRequest) {
          const role = roleOf(request.headers['authorization'], config.tokens);
          if (!role) return plain(401, 'Missing or invalid authentication token.');
          const hash = yield* hashParam;
          if (Option.isNone(hash) || !VALID_HASH.test(hash.value)) return plain(400, 'Invalid hash');

          for (const namespace of policyOf(role).read) {
            const entry = yield* storage.get(keyOf(namespace, hash.value));
            if (Option.isNone(entry)) continue;
            const { body, contentLength } = entry.value;
            return HttpServerResponse.stream(
              NodeStream.fromReadable({
                evaluate: () => body,
                onError: (cause) => new StorageError({ operation: 'get-stream', cause }),
              }),
              {
                contentType: 'application/octet-stream',
                contentLength,
                headers: { 'x-nx-cache-namespace': namespace },
              },
            );
          }
          return plain(404, 'The record was not found');
        }, withStorageErrors('get')),
      );

      yield* router.add(
        'PUT',
        '/v1/cache/:hash',
        Effect.fn(function* (request: HttpServerRequest.HttpServerRequest) {
          const role = roleOf(request.headers['authorization'], config.tokens);
          if (!role) return plain(401, 'Missing or invalid authentication token.');
          const { read, write } = policyOf(role);
          if (!write) return plain(403, 'Access forbidden: read-only token cannot write');
          const hash = yield* hashParam;
          if (Option.isNone(hash) || !VALID_HASH.test(hash.value)) return plain(400, 'Invalid hash');

          const contentLength = Number(request.headers['content-length']);
          if (!Number.isSafeInteger(contentLength) || contentLength < 0) return plain(411, 'Content-Length required');
          if (contentLength > config.maxEntryBytes) return plain(413, 'Entry too large');

          // cheap pre-check over everything the caller can read (a dev upload of a trusted hit is pointless), saves
          // streaming the body; the conditional put stays authoritative
          for (const namespace of read) {
            if (yield* storage.exists(keyOf(namespace, hash.value))) {
              return plain(409, 'Cannot override an existing record');
            }
          }

          const body = yield* NodeStream.toReadable(request.stream);
          return yield* storage.put(keyOf(write, hash.value), body, contentLength).pipe(
            Effect.as(plain(200, 'Successfully uploaded the output')),
            Effect.catchTag('EntryAlreadyExists', () =>
              Effect.succeed(plain(409, 'Cannot override an existing record')),
            ),
          );
        }, withStorageErrors('put')),
      );
    }),
  );

/** Routes with their storage — serve with `HttpRouter.serve` or `HttpRouter.toWebHandler`. */
export const appLayer = <E, R>(config: ServerConfig, storage: Layer.Layer<CacheStorage, E, R>) =>
  cacheRoutes(config).pipe(Layer.provide(storage));
