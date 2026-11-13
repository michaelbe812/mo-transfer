import { NodeStream } from '@effect/platform-node';
import { Effect, Layer, Option } from 'effect';
import { HttpRouter, type HttpServerRequest, HttpServerResponse } from 'effect/http';
import { callerOf, hasBearer, keyOf, policyOf } from './auth.ts';
import type { ServerConfig } from './config.ts';
import { CacheMetrics, type Operation } from './metrics.ts';
import { CacheStorage, StorageError } from './storage/cache-storage.ts';

/**
 * Nx custom remote cache spec (OpenAPI 1.0.0, https://nx.dev/docs/kb/self-hosted-caching):
 *   GET /v1/cache/{hash}  200 octet-stream | 401 | 403 | 404
 *   PUT /v1/cache/{hash}  200 | 401 | 403 (read-only token) | 409 (exists, never overwritten)
 * Plus GET /health (no auth) for container probes and GET /metrics (Prometheus, optional NX_CACHE_METRICS_TOKEN).
 * Reads and writes go to the namespaces of the caller's role (`policyOf`); `x-nx-cache-namespace` on a hit
 * names the namespace that served it.
 *
 * The same routes also answer under `/r/{repo}/…`: Nx keeps a path in NX_SELF_HOSTED_REMOTE_CACHE_SERVER, so
 * `http://cache:3100/r/my-repo` attributes requests to a repo in the metrics. Storage keys don't contain the repo:
 * hashes are content-addressed, so worktrees and repos sharing inputs still share hits.
 */

/** Nx hashes are decimal digits; allow a safe superset, never path separators or dots. */
const VALID_HASH = /^[A-Za-z0-9_-]{1,256}$/;
/** Repo names (metrics label only): directory-name-like, bounded. */
const VALID_REPO = /^[A-Za-z0-9._-]{1,100}$/;

const plain = (status: number, body: string) => HttpServerResponse.text(body, { status });

const hashParam = Effect.map(HttpRouter.params, (params) => Option.fromNullishOr(params['hash']));

/** `none` without the prefix, undefined when the prefix is present but invalid (→ 400). */
const repoParam = Effect.map(HttpRouter.params, (params) => {
  const repo = params['repo'];
  if (repo === undefined) return 'none';
  return VALID_REPO.test(repo) ? repo : undefined;
});

const withStorageErrors =
  (operation: string) =>
  <A, R>(self: Effect.Effect<A, StorageError, R>) =>
    self.pipe(
      Effect.catchTag('StorageError', (error) =>
        Effect.logError(`storage ${operation} failed`, error.cause).pipe(Effect.as(plain(500, 'Storage error'))),
      ),
    );

/** Records outcome, role, namespace, client, repo and duration of every cache request, whatever branch answered. */
const instrumented =
  (metrics: CacheMetrics, operation: Operation, config: ServerConfig) =>
  <E, R>(
    handler: (
      request: HttpServerRequest.HttpServerRequest,
    ) => Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>,
  ) =>
  (request: HttpServerRequest.HttpServerRequest) =>
    Effect.gen(function* () {
      const started = performance.now();
      const repo = yield* repoParam;
      const response = yield* handler(request);
      const caller = callerOf(request.headers['authorization'], config.tokens);
      const namespace =
        operation === 'get' ? response.headers['x-nx-cache-namespace'] : caller && policyOf(caller.role).write;
      metrics.recordRequest({
        operation,
        status: response.status,
        role: caller?.role,
        namespace: response.status === 200 ? namespace : undefined,
        // labels only for authenticated callers: anonymous requests must not be able to create series
        client: caller?.client,
        repo: caller ? repo : undefined,
        seconds: (performance.now() - started) / 1000,
      });
      return response;
    });

export const cacheRoutes = (config: ServerConfig, metrics = new CacheMetrics()) =>
  HttpRouter.use(
    Effect.fn(function* (router) {
      const storage = yield* CacheStorage;

      const getEntry = instrumented(
        metrics,
        'get',
        config,
      )(
        Effect.fn(function* (request: HttpServerRequest.HttpServerRequest) {
          const caller = callerOf(request.headers['authorization'], config.tokens);
          if (!caller) return plain(401, 'Missing or invalid authentication token.');
          const hash = yield* hashParam;
          const repo = yield* repoParam;
          if (Option.isNone(hash) || !VALID_HASH.test(hash.value) || !repo) return plain(400, 'Invalid hash or repo');

          for (const namespace of policyOf(caller.role).read) {
            const entry = yield* storage.get(keyOf(namespace, hash.value));
            if (Option.isNone(entry)) continue;
            const { body, contentLength } = entry.value;
            if (contentLength !== undefined) {
              metrics.recordBytes({ operation: 'get', namespace, bytes: contentLength, client: caller.client, repo });
            }
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

      const putEntry = instrumented(
        metrics,
        'put',
        config,
      )(
        Effect.fn(function* (request: HttpServerRequest.HttpServerRequest) {
          const caller = callerOf(request.headers['authorization'], config.tokens);
          if (!caller) return plain(401, 'Missing or invalid authentication token.');
          const { read, write } = policyOf(caller.role);
          if (!write) return plain(403, 'Access forbidden: read-only token cannot write');
          const hash = yield* hashParam;
          const repo = yield* repoParam;
          if (Option.isNone(hash) || !VALID_HASH.test(hash.value) || !repo) return plain(400, 'Invalid hash or repo');

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
            Effect.tap(() =>
              Effect.sync(() =>
                metrics.recordBytes({
                  operation: 'put',
                  namespace: write,
                  bytes: contentLength,
                  client: caller.client,
                  repo,
                }),
              ),
            ),
            Effect.as(plain(200, 'Successfully uploaded the output')),
            Effect.catchTag('EntryAlreadyExists', () =>
              Effect.succeed(plain(409, 'Cannot override an existing record')),
            ),
          );
        }, withStorageErrors('put')),
      );

      yield* router.add('GET', '/health', Effect.succeed(plain(200, 'ok')));

      yield* router.add('GET', '/metrics', (request: HttpServerRequest.HttpServerRequest) =>
        Effect.sync(() =>
          config.metricsToken && !hasBearer(request.headers['authorization'], [config.metricsToken])
            ? plain(401, 'Missing or invalid metrics token.')
            : HttpServerResponse.text(metrics.render(), { contentType: 'text/plain; version=0.0.4; charset=utf-8' }),
        ),
      );

      yield* router.add('GET', '/v1/cache/:hash', getEntry);
      yield* router.add('PUT', '/v1/cache/:hash', putEntry);
      yield* router.add('GET', '/r/:repo/v1/cache/:hash', getEntry);
      yield* router.add('PUT', '/r/:repo/v1/cache/:hash', putEntry);
    }),
  );

/** Routes with their storage — serve with `HttpRouter.serve` or `HttpRouter.toWebHandler`. */
export const appLayer = <E, R>(
  config: ServerConfig,
  storage: Layer.Layer<CacheStorage, E, R>,
  metrics = new CacheMetrics(),
) => cacheRoutes(config, metrics).pipe(Layer.provide(storage));
