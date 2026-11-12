import { Layer, Redacted } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { afterAll, describe, expect, it } from 'vitest';
import type { ServerConfig } from './config.ts';
import { CacheMetrics, outcomeOf } from './metrics.ts';
import { appLayer } from './routes.ts';
import { layerMemory } from './storage/memory.ts';

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  tokens: { ci: [Redacted.make('ci-token')], dev: [Redacted.make('dev-token')], readOnly: [Redacted.make('ro-token')] },
  maxEntryBytes: 1024,
  metricsToken: Redacted.make('scrape-token'),
};

const metrics = new CacheMetrics();
const { handler, dispose } = HttpRouter.toWebHandler(
  appLayer(config, layerMemory, metrics).pipe(Layer.provide(HttpServer.layerServices)),
);
afterAll(() => dispose());

const url = (path: string) => `http://cache.test${path}`;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const get = (hash: string, token: string) => handler(new Request(url(`/v1/cache/${hash}`), { headers: auth(token) }));
const put = (hash: string, text: string, token: string) => {
  const body = new TextEncoder().encode(text);
  return handler(
    new Request(url(`/v1/cache/${hash}`), {
      method: 'PUT',
      body,
      headers: { ...auth(token), 'content-length': String(body.length) },
    }),
  );
};
const scrape = async () => (await handler(new Request(url('/metrics'), { headers: auth('scrape-token') }))).text();

describe('cache metrics', () => {
  it('maps status codes to outcomes', () => {
    expect(outcomeOf('get', 200)).toBe('hit');
    expect(outcomeOf('get', 404)).toBe('miss');
    expect(outcomeOf('put', 200)).toBe('stored');
    expect(outcomeOf('put', 409)).toBe('exists');
    expect(outcomeOf('put', 403)).toBe('forbidden');
    expect(outcomeOf('put', 411)).toBe('invalid');
    expect(outcomeOf('get', 500)).toBe('error');
  });

  it('protects /metrics with the metrics token', async () => {
    expect((await handler(new Request(url('/metrics')))).status).toBe(401);
    expect((await handler(new Request(url('/metrics'), { headers: auth('ci-token') }))).status).toBe(401);
    expect((await handler(new Request(url('/metrics'), { headers: auth('scrape-token') }))).status).toBe(200);
  });

  it('counts hits, misses, stores, conflicts and bytes with role and namespace', async () => {
    expect((await get('2001', 'ro-token')).status).toBe(404);
    expect((await put('2001', 'artifact', 'ci-token')).status).toBe(200);
    expect((await put('2001', 'artifact', 'ci-token')).status).toBe(409);
    const hit = await get('2001', 'dev-token');
    expect(hit.status).toBe(200);
    await hit.text();
    expect((await put('2002', 'x', 'ro-token')).status).toBe(403);
    expect((await get('2001', 'nope')).status).toBe(401);

    const count = (labels: Record<string, string>) => metrics.requests.get(labels);
    expect(count({ operation: 'get', outcome: 'miss', role: 'read-only', namespace: 'none' })).toBe(1);
    expect(count({ operation: 'put', outcome: 'stored', role: 'ci', namespace: 'trusted' })).toBe(1);
    expect(count({ operation: 'put', outcome: 'exists', role: 'ci', namespace: 'none' })).toBe(1);
    expect(count({ operation: 'get', outcome: 'hit', role: 'dev', namespace: 'trusted' })).toBe(1);
    expect(count({ operation: 'put', outcome: 'forbidden', role: 'read-only', namespace: 'none' })).toBe(1);
    expect(count({ operation: 'get', outcome: 'unauthorized', role: 'none', namespace: 'none' })).toBe(1);
    expect(metrics.bytes.get({ operation: 'put', namespace: 'trusted' })).toBe(8);
    expect(metrics.bytes.get({ operation: 'get', namespace: 'trusted' })).toBe(8);

    const text = await scrape();
    expect(text).toContain('# TYPE nx_cache_requests_total counter');
    expect(text).toContain('nx_cache_requests_total{operation="get",outcome="hit",role="dev",namespace="trusted"} 1');
    expect(text).toMatch(/nx_cache_request_duration_seconds_bucket\{operation="get",outcome="hit",le="\+Inf"\} 1/);
    expect(text).toContain('nx_cache_bytes_total{operation="put",namespace="trusted"} 8');
    expect(text).toContain('nx_cache_entry_bytes_bucket{operation="get",le="1024"} 1');
    expect(text).toMatch(/process_uptime_seconds \d/);
  });
});
