import { Layer, Redacted } from 'effect';
import { HttpRouter, HttpServer } from 'effect/http';
import { afterAll, describe, expect, it } from 'vitest';
import type { ServerConfig } from './config.ts';
import { appLayer } from './routes.ts';
import { layerMemory } from './storage/memory.ts';

const config: ServerConfig = {
  port: 0,
  host: '127.0.0.1',
  tokens: {
    ci: [Redacted.make('ci-token')],
    dev: [Redacted.make('dev-token')],
    readOnly: [Redacted.make('ro-token')],
  },
  maxEntryBytes: 1024,
};

const { handler, dispose } = HttpRouter.toWebHandler(
  appLayer(config, layerMemory).pipe(Layer.provide(HttpServer.layerServices)),
);
afterAll(() => dispose());

const url = (hash: string) => `http://cache.test/v1/cache/${hash}`;
const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const get = (hash: string, token?: string) => handler(new Request(url(hash), { headers: token ? auth(token) : {} }));
const put = (hash: string, body: Uint8Array, token?: string) =>
  handler(
    new Request(url(hash), {
      method: 'PUT',
      body,
      headers: { ...(token ? auth(token) : {}), 'content-length': String(body.length) },
    }),
  );

const bytes = (text: string) => new TextEncoder().encode(text);

describe('nx custom remote cache spec', () => {
  it('serves /health without auth', async () => {
    const response = await handler(new Request('http://cache.test/health'));
    expect(response.status).toBe(200);
  });

  it('rejects requests without a valid token with 401', async () => {
    expect((await get('1001')).status).toBe(401);
    expect((await get('1001', 'wrong')).status).toBe(401);
    expect((await put('1001', bytes('x'))).status).toBe(401);
  });

  it('answers 404 for a missing entry', async () => {
    expect((await get('1002', 'ro-token')).status).toBe(404);
  });

  it('stores with a ci token and serves the bytes to a read-only token', async () => {
    expect((await put('1003', bytes('artifact'), 'ci-token')).status).toBe(200);
    const response = await get('1003', 'ro-token');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(await response.text()).toBe('artifact');
  });

  it('forbids writes with a read-only token (403) — PRs cannot poison the cache', async () => {
    expect((await put('1004', bytes('poison'), 'ro-token')).status).toBe(403);
    expect((await get('1004', 'ro-token')).status).toBe(404);
  });

  it('never overwrites an existing entry (409)', async () => {
    expect((await put('1005', bytes('first'), 'ci-token')).status).toBe(200);
    expect((await put('1005', bytes('second'), 'ci-token')).status).toBe(409);
    expect(await (await get('1005', 'ci-token')).text()).toBe('first');
  });

  it('lets exactly one of two concurrent writers win', async () => {
    const statuses = await Promise.all([put('1006', bytes('a'), 'ci-token'), put('1006', bytes('b'), 'ci-token')]).then(
      (responses) => responses.map((response) => response.status).sort(),
    );
    expect(statuses).toEqual([200, 409]);
  });

  it('rejects hashes that could escape the key namespace (400)', async () => {
    expect((await get('..%2F..%2Fetc', 'ro-token')).status).toBe(400);
    expect((await put('a.b', bytes('x'), 'ci-token')).status).toBe(400);
  });

  it('rejects entries above the size limit (413)', async () => {
    expect((await put('1007', new Uint8Array(2048), 'ci-token')).status).toBe(413);
  });
});

describe('namespaces: developers write to dev, ci never reads it', () => {
  it('serves a dev upload to developers only', async () => {
    expect((await put('2001', bytes('laptop build'), 'dev-token')).status).toBe(200);
    const devHit = await get('2001', 'dev-token');
    expect(devHit.status).toBe(200);
    expect(devHit.headers.get('x-nx-cache-namespace')).toBe('dev');
    expect(await devHit.text()).toBe('laptop build');
    expect((await get('2001', 'ci-token')).status).toBe(404);
    expect((await get('2001', 'ro-token')).status).toBe(404);
  });

  it('serves trusted entries to developers', async () => {
    expect((await put('2002', bytes('ci build'), 'ci-token')).status).toBe(200);
    const hit = await get('2002', 'dev-token');
    expect(hit.headers.get('x-nx-cache-namespace')).toBe('trusted');
    expect(await hit.text()).toBe('ci build');
  });

  it('skips a dev upload of a hash that is already trusted (409)', async () => {
    expect((await put('2003', bytes('ci build'), 'ci-token')).status).toBe(200);
    expect((await put('2003', bytes('laptop build'), 'dev-token')).status).toBe(409);
  });

  it('lets ci store a hash that only exists in dev — ci builds its own artifact', async () => {
    expect((await put('2004', bytes('laptop build'), 'dev-token')).status).toBe(200);
    expect((await put('2004', bytes('ci build'), 'ci-token')).status).toBe(200);
    expect(await (await get('2004', 'ci-token')).text()).toBe('ci build');
    // developers keep their own copy first — same hash, same inputs
    expect((await get('2004', 'dev-token')).headers.get('x-nx-cache-namespace')).toBe('dev');
  });
});
