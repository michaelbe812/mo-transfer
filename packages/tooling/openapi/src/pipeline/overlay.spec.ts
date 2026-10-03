import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import type { ClientDefinition } from '../adapter';
import { DEFAULT_SETTINGS, resolveSettings } from '../settings';

const ON = resolveSettings({ features: { overlays: true } });
import { globToRegExp, matchesAny } from './glob';
import { queryJsonPath } from './jsonpath';
import { applyOverlay } from './overlay';
import { prepareSpec } from './spec';

const spec = () => ({
  openapi: '3.0.3',
  info: { title: 'T', version: '1' },
  tags: [{ name: 'a' }, { name: 'b' }],
  paths: {
    '/things': { get: { operationId: 'list', tags: ['a'], 'x-internal': false }, post: { operationId: 'create', 'x-internal': true } },
    '/internal': { get: { operationId: 'secret', 'x-internal': true } },
  },
});

describe('JSONPath subset', () => {
  const doc = spec();
  const values = (path: string) => queryJsonPath(doc, path).map((node) => node.value);

  it('root, names (dot, bracket, quoted, list), wildcard, index, recursive descent', () => {
    expect(values('$')).toEqual([doc]);
    expect(values('$.info.title')).toEqual(['T']);
    expect(values("$.paths['/things'].get.operationId")).toEqual(['list']);
    expect(values('$.paths["/things"]["get","post"].operationId')).toEqual(['list', 'create']);
    expect(values('$.paths.*.get.operationId')).toEqual(['list', 'secret']);
    expect(values('$.tags[*].name')).toEqual(['a', 'b']);
    expect(values('$.tags[0].name')).toEqual(['a']);
    expect(values('$.tags[-1].name')).toEqual(['b']);
    expect(values('$.tags[5]')).toEqual([]);
    expect(values('$.info[0]')).toEqual([]);
    expect(values('$..operationId')).toEqual(['list', 'create', 'secret']);
    expect(values("$..['operationId']")).toHaveLength(3);
    expect(values('$.tags..*')).toEqual([{ name: 'a' }, { name: 'b' }, 'a', 'b']);
    expect(values('$.info.title.x')).toEqual([]);
  });

  it('filters: comparison, existence, bracket path, != with missing property', () => {
    expect(values("$.paths.*[?(@['x-internal'] == true)].operationId")).toEqual(['create', 'secret']);
    expect(values('$.paths.*[?@.operationId != "list"].operationId')).toEqual(['create', 'secret']);
    expect(values('$.paths.*[?(@.tags)].operationId')).toEqual(['list']);
    expect(values('$.paths.*[?(@.tags != 1)].operationId')).toEqual(['list', 'create', 'secret']);
    expect(values("$.tags[?(@.name == 'b')]")).toEqual([{ name: 'b' }]);
    expect(values('$.tags[?(@.name == null)]')).toEqual([]);
    expect(values("$.tags[?(@.name == 'a\\'')]")).toEqual([]);
  });

  it('unsupported syntax is an error, never a silent mismatch', () => {
    expect(() => values('info')).toThrow('JSONPath info: must start with $ at position 0');
    expect(() => values('$info')).toThrow('expected . or [');
    expect(() => values('$.tags[1:2]')).toThrow('expected "]"');
    expect(() => values('$.tags[?(@.a < 1)]')).toThrow('expected ")"');
    expect(() => values("$.tags['a")).toThrow('unterminated string');
    expect(() => values('$.tags[?(@.a == x)]')).toThrow('expected a literal');
    expect(() => values('$.tags[?(x)]')).toThrow('expected "@"');
    expect(() => values('$.tags[!]')).toThrow('unsupported selector');
    expect(() => values('$.1')).toThrow('expected a name');
  });
});

describe('OpenAPI Overlay 1.0', () => {
  it('update merges objects recursively, appends to arrays; remove deletes (arrays from the back)', () => {
    const doc = spec();
    applyOverlay(
      doc,
      {
        overlay: '1.0.0',
        actions: [
          { target: "$.paths['/things'].get", update: { description: 'All things', 'x-internal': { deep: { a: 1 } } } },
          { target: "$.paths['/things'].get", update: { 'x-internal': { deep: { b: 2 } } } },
          { target: '$.tags', update: { name: 'c' } },
          { target: '$.tags', update: [{ name: 'd' }] },
          { target: "$.paths.*[?(@['x-internal'] == true)]", remove: true },
          { target: "$.tags[?(@.name != 'a')]", remove: true },
        ],
      },
      'o.yaml',
    );
    expect(doc.paths['/things'].get).toEqual({ operationId: 'list', tags: ['a'], 'x-internal': { deep: { a: 1, b: 2 } }, description: 'All things' });
    expect(doc.paths['/things']).not.toHaveProperty('post');
    expect(doc.paths['/internal']).toEqual({});
    expect(doc.tags).toEqual([{ name: 'a' }]);
  });

  it('errors name the overlay and the action', () => {
    const apply = (overlay: object) => () => applyOverlay(spec(), overlay, 'o.yaml');
    expect(apply({ overlay: '2.0.0', actions: [{}] })).toThrow('o.yaml: not an OpenAPI Overlay 1.x document');
    expect(apply({ overlay: '1.0.0', actions: [] })).toThrow('o.yaml: no actions');
    expect(apply({ overlay: '1.0.0', actions: [{ update: {} }] })).toThrow('o.yaml → actions[0]: target missing');
    expect(apply({ overlay: '1.0.0', actions: [{ target: '$.nope', update: {} }] })).toThrow('o.yaml → actions[0]: target $.nope selects nothing');
    expect(apply({ overlay: '1.0.0', actions: [{ target: '$.info' }] })).toThrow('neither update nor remove');
    expect(apply({ overlay: '1.0.0', actions: [{ target: '$', remove: true }] })).toThrow('the document root cannot be removed');
    expect(apply({ overlay: '1.0.0', actions: [{ target: '$.info.title', update: { a: 1 } }] })).toThrow('update needs an object or array target');
  });
});

describe('glob', () => {
  it('**, *, ?, {a,b}; cached', () => {
    expect(matchesAny('model/pet.ts', ['model/**'])).toBe(true);
    expect(matchesAny('model/x/pet.ts', ['model/*.ts'])).toBe(false);
    expect(matchesAny('pet.ts', ['**/*.ts'])).toBe(true);
    expect(matchesAny('a/b/pet.ts', ['**/pet.ts'])).toBe(true);
    expect(matchesAny('api.ts', ['ap?.ts'])).toBe(true);
    expect(matchesAny('client.gen.ts', ['{client,sdk}.gen.ts'])).toBe(true);
    expect(matchesAny('core/x.ts', ['{core,client}/*.ts'])).toBe(true);
    expect(matchesAny('types.ts', ['{core,client}/*.ts', 'api/**'])).toBe(false);
    expect(globToRegExp('a*.ts')).toBe(globToRegExp('a*.ts'));
    expect(() => globToRegExp('{a,b')).toThrow('glob {a,b: unclosed {');
  });
});

describe('stage spec', () => {
  let root: string;
  const write = (path: string, content: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const client = (file: string, overlays?: string[]): ClientDefinition => ({
    name: 'x-client',
    path: 'generated/x-client',
    placement: 'shared',
    spec: { file },
    generator: { adapter: 'hey-api', options: {} },
    layout: 'default',
    pipeline: overlays ? { overlays } : {},
  });
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openapi-spec-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('without overlays the committed file; with overlays an effective copy (YAML / JSON)', () => {
    write('libs/generated/x-client/openapi.yaml', 'openapi: 3.0.3\ninfo: { title: T, version: "1" }\npaths: {}\n');
    write('libs/generated/x-client/overlays/title.yaml', 'overlay: 1.0.0\nactions:\n  - target: $.info\n    update: { title: Overlaid }\n');
    const tmp = join(root, 'tmp/openapi/generated/x-client');
    expect(prepareSpec(client('libs/generated/x-client/openapi.yaml'), root, DEFAULT_SETTINGS, tmp)).toBe(
      join(root, 'libs/generated/x-client/openapi.yaml'),
    );
    const effective = prepareSpec(client('libs/generated/x-client/openapi.yaml', ['overlays/title.yaml']), root, ON, tmp);
    expect(effective).toBe(join(tmp, 'spec/openapi.yaml'));
    expect(parseYaml(readFileSync(effective, 'utf-8')).info.title).toBe('Overlaid');

    write('libs/generated/x-client/openapi.json', '{"openapi":"3.0.3","info":{"title":"T","version":"1"},"paths":{}}');
    const json = prepareSpec(client('libs/generated/x-client/openapi.json', ['overlays/title.yaml']), root, ON, tmp);
    expect(JSON.parse(readFileSync(json, 'utf-8')).info.title).toBe('Overlaid');
  });

  it('missing spec / missing overlay', () => {
    const tmp = join(root, 'tmp');
    expect(() => prepareSpec(client('libs/generated/x-client/openapi.yaml'), root, DEFAULT_SETTINGS, tmp)).toThrow(
      'libs/generated/x-client/openapi.yaml missing',
    );
    write('libs/generated/x-client/openapi.yaml', 'openapi: 3.0.3\n');
    expect(() => prepareSpec(client('libs/generated/x-client/openapi.yaml', ['nope.yaml']), root, ON, tmp)).toThrow(
      'overlay libs/generated/x-client/nope.yaml missing',
    );
  });

  it('feature flag off (default): overlays are never applied silently — error with hint', () => {
    write('libs/generated/x-client/openapi.yaml', 'openapi: 3.0.3\n');
    expect(() => prepareSpec(client('libs/generated/x-client/openapi.yaml', ['o.yaml']), root, DEFAULT_SETTINGS, join(root, 'tmp'))).toThrow(
      expect.objectContaining({
        phase: 'spec',
        message: 'pipeline.overlays set (o.yaml), feature flag "overlays" disabled',
        hint: expect.stringContaining('settings.features.overlays: true'),
      }),
    );
  });
});
