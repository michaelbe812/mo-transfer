import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientDefinition } from './adapter';
import { readClientsConfig, transformsOf } from './config';
import { formatError, OpenApiError } from './errors';
import { resolveClient, serializeSpec, updateSpec } from './facade';
import { camelCase, clientRoot, DEFAULT_SETTINGS, generatedHeader, parseClientPath, partAlias, resolveSettings } from './settings';

let dir: string;
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), content);
};
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'openapi-facade-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

describe('resolveClient', () => {
  const config = (clients: object, extra: object = {}) => write('openapi-clients.json', JSON.stringify({ ...extra, clients }));

  it('placement, path, spec file, url, adapter fallback (entry → defaultAdapter → openapi-tools), options, layout, pipeline', () => {
    write('libs/generated/a-client/openapi.yaml', '');
    write('libs/booking/generated/b-client/openapi.json', '');
    config({
      'generated/a-client': { url: 'https://a', options: { x: 1 } },
      'booking/generated/b-client': { adapter: 'hey-api', layout: 'merged-core', pipeline: { testing: false } },
    });
    expect(resolveClient(dir, 'generated/a-client')).toEqual({
      name: 'a-client',
      path: 'generated/a-client',
      placement: 'shared',
      spec: { file: 'libs/generated/a-client/openapi.yaml', url: 'https://a' },
      generator: { adapter: 'openapi-tools', options: { x: 1 } },
      layout: 'default',
      pipeline: {},
    });
    expect(resolveClient(dir, 'booking/generated/b-client')).toEqual({
      name: 'b-client',
      path: 'booking/generated/b-client',
      placement: { domain: 'booking' },
      spec: { file: 'libs/booking/generated/b-client/openapi.json' },
      generator: { adapter: 'hey-api', options: {} },
      layout: 'merged-core',
      pipeline: { testing: false },
    });
    config({ 'generated/a-client': {} }, { defaultAdapter: 'nx-plugin-openapi' });
    expect(resolveClient(dir, 'generated/a-client').generator.adapter).toBe('nx-plugin-openapi');
  });

  it('settings: other libs dir, client folder, spec file names', () => {
    write('packages/clients/api/billing/spec.yml', '');
    config({ 'api/billing': {} }, { settings: { libsDir: 'packages/clients', clientFolder: 'api', specFiles: ['spec.yml'] } });
    expect(resolveClient(dir, 'api/billing')).toMatchObject({ spec: { file: 'packages/clients/api/billing/spec.yml' }, placement: 'shared' });
  });

  it('errors: no file, no entry, no client path, no spec, two specs', () => {
    expect(() => resolveClient(dir, 'generated/x')).toThrow('openapi-clients.json: not readable');
    config({ 'generated/none-client': {}, 'generated/two-client': {}, 'x/y/z/w': {} });
    expect(() => resolveClient(dir, 'generated/missing')).toThrow('openapi-clients.json has no entry "generated/missing"');
    expect(() => resolveClient(dir, 'x/y/z/w')).toThrow('"x/y/z/w" is no client path (generated/<name> or <domain>/generated/<name>)');
    expect(() => resolveClient(dir, 'generated/none-client')).toThrow('libs/generated/none-client needs exactly one spec file (openapi.yaml | openapi.json), found none');
    write('libs/generated/two-client/openapi.yaml', '');
    write('libs/generated/two-client/openapi.json', '');
    expect(() => resolveClient(dir, 'generated/two-client')).toThrow('found openapi.yaml, openapi.json');
    expect(() => readClientsConfig(dir)).not.toThrow();
  });
});

describe('config shapes (H1)', () => {
  it('wrong sections become empty, transforms are validated with their index', () => {
    write('openapi-clients.json', JSON.stringify({ settings: 'x', adapters: [1], clients: 'y' }));
    expect(readClientsConfig(dir)).toEqual({ settings: undefined, adapters: undefined, clients: undefined });
    write('openapi-clients.json', '[]');
    expect(() => readClientsConfig(dir)).toThrow('openapi-clients.json: must be an object');
    expect(transformsOf(null)).toEqual([]);
    expect(transformsOf({ pipeline: { transforms: ['./a.ts', { module: 'b', options: 'x' as never }, { module: 'c', options: { o: 1 } }] } })).toEqual([
      { module: './a.ts', options: {} },
      { module: 'b', options: {} },
      { module: 'c', options: { o: 1 } },
    ]);
    expect(() => transformsOf({ pipeline: { transforms: [{} as never] } })).toThrow('pipeline.transforms[0]: module missing');
    expect(() => transformsOf({ pipeline: { transforms: 'x' as never } })).toThrow('pipeline.transforms: must be an array');
  });
});

describe('settings helpers + errors', () => {
  it('paths, aliases, header (configurable), camelCase, client paths', () => {
    const settings = resolveSettings({ aliasPrefix: '@acme/', header: { banner: '// gen {source} {spec} {unknown}' } as never });
    expect(clientRoot(DEFAULT_SETTINGS, 'generated/a')).toBe('libs/generated/a');
    expect(partAlias(settings, 'booking/generated/a', 'api')).toBe('@acme/booking/generated/a/api');
    expect(generatedHeader(DEFAULT_SETTINGS, 'adapter x', 'libs/a/openapi.yaml')).toBe(
      '/* eslint-disable */\n/* eslint-enable @nx/enforce-module-boundaries, no-restricted-imports */\n// Generated by @mo-transfer/tooling (openapi, adapter x) from libs/a/openapi.yaml. Do not edit, do not commit.\n',
    );
    expect(generatedHeader(settings, 'testing', 's.yaml')).toBe(`${DEFAULT_SETTINGS.header.lint.join('\n')}\n// gen testing s.yaml {unknown}\n`);
    expect(camelCase('pet-client-2')).toBe('petClient2');
    expect(parseClientPath('generated/generated')).toBeUndefined();
    // H2: only kebab-case folders (no `..`, no separators sneaking into project names / paths)
    expect(parseClientPath('generated/Bad_Client')).toBeUndefined();
    expect(parseClientPath('../generated/x-client')).toBeUndefined();
    expect(parseClientPath('generated/generated/x')).toBeUndefined();
    expect(parseClientPath('booking/generated/b')).toEqual({ path: 'booking/generated/b', name: 'b', scope: 'booking', placement: { domain: 'booking' } });
  });

  it('OpenApiError.wrap keeps the inner phase and fills client/adapter/hint; formatError with hint, causes, stack', () => {
    const inner = new OpenApiError('inner', { phase: 'load' });
    const wrapped = OpenApiError.wrap(inner, { phase: 'generate', client: 'c', adapter: 'a', hint: 'h' });
    expect(wrapped).toBe(inner);
    expect(wrapped).toMatchObject({ phase: 'load', client: 'c', adapter: 'a', hint: 'h' });
    const fromString = OpenApiError.wrap('plain', { phase: 'spec' });
    expect(fromString).toMatchObject({ message: 'plain', phase: 'spec', cause: 'plain' });
    const root = new Error('root cause');
    const chain = OpenApiError.wrap(new Error('middle', { cause: root }), { phase: 'generate', client: 'c' });
    const text = formatError(chain);
    expect(text.split('\n')[0]).toBe('[openapi:generate] c: middle');
    expect(text).toContain('caused by: Error: middle');
    expect(text).toContain('caused by: Error: root cause');
    expect(formatError(fromString)).toBe('[openapi:spec]: plain\n  caused by: plain');
    expect(formatError(new OpenApiError('x', { phase: 'config', hint: 'do y' }), true)).toMatch(/^\[openapi:config\]: x\n {2}hint: do y\nOpenApiError: x\n/);
    expect(formatError(new Error('plain error'))).toContain('Error: plain error');
    expect(formatError('text')).toBe('text');
  });
});

describe('serializeSpec + updateSpec', () => {
  const document = { openapi: '3.0.3', info: { title: 'T', version: '1' }, paths: {} };
  const client: ClientDefinition = {
    name: 'n',
    path: 'generated/n',
    placement: 'shared',
    spec: { file: 'libs/generated/n/openapi.yaml', url: 'https://n' },
    generator: { adapter: 'hey-api', options: {} },
    layout: 'default',
    pipeline: {},
  };

  it('YAML with source header / JSON by extension, Prettier without config file = defaults', async () => {
    expect(await serializeSpec(document, 'libs/generated/a/openapi.yaml', 'https://a', 'generated-a', dir)).toBe(
      '# Source: https://a\n# Update: nx run generated-a:update-spec (overwrites this file, normalized). Committed, the only source for generate-api-client.\nopenapi: 3.0.3\ninfo:\n  title: T\n  version: "1"\npaths: {}\n',
    );
    expect(await serializeSpec(document, 'libs/generated/a/openapi.json', 'https://a', 'generated-a', dir)).toBe(
      '{\n  "openapi": "3.0.3",\n  "info": {\n    "title": "T",\n    "version": "1"\n  },\n  "paths": {}\n}\n',
    );
  });

  it('without Prettier the text is returned unformatted', async () => {
    vi.resetModules();
    vi.doMock('prettier', () => {
      throw new Error('not installed');
    });
    const { serializeSpec: withoutPrettier } = await import('./facade.js');
    expect(await withoutPrettier(document, 'x/openapi.json', 'u', 'p', dir)).toBe(`${JSON.stringify(document, null, 2)}\n`);
    vi.doUnmock('prettier');
  });

  it('writes a spec file that does not exist yet (changed); errors without url / on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('openapi: 3.0.3\ninfo: { title: T, version: "1" }\npaths: {}\n')));
    mkdirSync(join(dir, 'libs/generated/n'), { recursive: true });
    expect(await updateSpec(client, dir, 'generated-n')).toEqual({ changed: true });
    expect(readFileSync(join(dir, 'libs/generated/n/openapi.yaml'), 'utf-8')).toContain('# Source: https://n');
    expect(await updateSpec(client, dir, 'generated-n')).toEqual({ changed: false });
    await expect(updateSpec({ ...client, spec: { file: client.spec.file } }, dir, 'p')).rejects.toMatchObject({ phase: 'update-spec', message: 'no url' });
    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 500 })));
    await expect(updateSpec(client, dir, 'p')).rejects.toThrow('GET https://n: 500');
  });
});
