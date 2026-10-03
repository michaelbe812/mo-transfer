import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OpenApiError } from '../errors';
import { loadAdapter, loadScaffold, loadTransform } from './load';
import { adapterCacheInputs, BUILTIN_ADAPTERS, resolveAdapter, resolveAdapterRegistry, resolveClientAdapter } from './registry';
import { definitionProblem, satisfiesMinimum, unmetRequirements, validateOptions } from './validate';

let root: string;
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openapi-registry-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const ADAPTER_TS = (id: string) =>
  `export default { apiVersion: 1, id: '${id}', generate() {}, classify() { return { models: [], apis: [], core: [] }; } };\n`;

describe('adapter registry', () => {
  it('built-ins + consumer adapters (workspace, package, built-in alias), $-keys skipped, a consumer id replaces a built-in', () => {
    write('tools/orval/orval.ts', ADAPTER_TS('orval'));
    write('node_modules/@acme/openapi-x/package.json', '{"name":"@acme/openapi-x"}');
    const registry = resolveAdapterRegistry(root, {
      adapters: {
        $comment: { module: 'ignored' },
        orval: { module: './tools/orval/orval.ts', packages: ['orval'] },
        acme: { module: '@acme/openapi-x', runtime: ['acme --version'], options: { a: 1 } },
        nswag: { module: 'builtin:command', runtime: ['nswag version'] },
        'hey-api': { module: './tools/orval/orval.ts' },
      },
    });
    expect(Object.keys(registry.adapters)).toEqual(['openapi-tools', 'hey-api', 'nx-plugin-openapi', 'command', 'orval', 'acme', 'nswag']);
    expect(registry.problems).toEqual({});
    expect(registry.adapters['openapi-tools']).toMatchObject({ custom: false, module: { kind: 'builtin', builtinId: 'openapi-tools' } });
    expect(registry.adapters.acme).toMatchObject({ custom: true, options: { a: 1 }, runtime: ['acme --version'], module: { kind: 'package' } });
    expect(registry.adapters.nswag).toMatchObject({ custom: true, module: { kind: 'builtin', builtinId: 'command' }, runtime: ['nswag version'] });
    expect(registry.adapters['hey-api'].module.kind).toBe('workspace');
    expect(adapterCacheInputs(registry.adapters.orval)).toEqual({ files: ['{workspaceRoot}/tools/orval/**/*'], packages: ['orval'], runtime: [] });
    expect(adapterCacheInputs(registry.adapters.acme)).toEqual({ files: [], packages: ['@acme/openapi-x'], runtime: ['acme --version'] });
    expect(adapterCacheInputs(registry.adapters['openapi-tools'])).toEqual({
      files: BUILTIN_ADAPTERS['openapi-tools'].inputs,
      packages: BUILTIN_ADAPTERS['openapi-tools'].packages,
      runtime: ['java -version 2>&1'],
    });
  });

  it('problems: missing module, uninstalled package, unknown built-in — resolveAdapter throws them, unknown ids too', () => {
    const config = {
      defaultAdapter: 'gone',
      adapters: { gone: { module: './gone.ts' }, ghost: { module: '@acme/ghost' }, alias: { module: 'builtin:nswag' } },
      clients: { 'generated/a': { adapter: 'ghost' }, 'generated/b': {} },
    };
    const registry = resolveAdapterRegistry(root, config);
    expect(registry.problems).toEqual({
      gone: 'adapters.gone: ./gone.ts not found (relative to the workspace root)',
      ghost: 'adapters.ghost: package @acme/ghost not installed (pnpm add -D @acme/ghost)',
      alias: 'adapters.alias: unknown built-in "builtin:nswag" (known: builtin:openapi-tools, builtin:hey-api, builtin:nx-plugin-openapi, builtin:command)',
    });
    expect(() => resolveAdapter(registry, 'swagger')).toThrow('unknown adapter "swagger" (known: openapi-tools');
    expect(() => resolveClientAdapter(root, config, 'generated/a')).toThrow('package @acme/ghost not installed');
    expect(() => resolveClientAdapter(root, config, 'generated/b')).toThrow(OpenApiError);
    expect(resolveClientAdapter(root, {}, 'generated/c').id).toBe('openapi-tools');
  });

  it('loadAdapter: built-ins, workspace TS adapter, apiVersion/id/functions checked, load errors wrapped', async () => {
    write('tools/a/orval.ts', ADAPTER_TS('orval'));
    write('tools/b/wrong-id.ts', ADAPTER_TS('other'));
    write('tools/c/v2.ts', "export default { apiVersion: 2, id: 'v2' };\n");
    write('tools/d/broken.ts', "throw new Error('boom');\n");
    write('tools/e/half.ts', "export default { apiVersion: 1, id: 'half', generate() {} };\n");
    const registry = resolveAdapterRegistry(root, {
      adapters: {
        orval: { module: './tools/a/orval.ts' },
        wrong: { module: './tools/b/wrong-id.ts' },
        v2: { module: './tools/c/v2.ts' },
        broken: { module: './tools/d/broken.ts' },
        half: { module: './tools/e/half.ts' },
        nswag: { module: 'builtin:command' },
        gone: { module: './gone.ts' },
      },
    });
    expect((await loadAdapter(registry.adapters['hey-api'], root)).id).toBe('hey-api');
    expect((await loadAdapter(registry.adapters.nswag, root)).id).toBe('command');
    expect((await loadAdapter(registry.adapters.orval, root)).id).toBe('orval');
    await expect(loadAdapter(registry.adapters.wrong, root)).rejects.toThrow('adapter wrong: declares id "other", registered as "wrong" (they must match)');
    await expect(loadAdapter(registry.adapters.v2, root)).rejects.toThrow('adapter v2: apiVersion 2 not supported (this package implements 1)');
    await expect(loadAdapter(registry.adapters.half, root)).rejects.toThrow('adapter half: classify missing (not a function)');
    await expect(loadAdapter(registry.adapters.gone, root, 'generated/x')).rejects.toMatchObject({ phase: 'load', client: 'generated/x', adapter: 'gone' });
    const broken = await loadAdapter(registry.adapters.broken, root).catch((error: OpenApiError) => error);
    expect(broken).toMatchObject({ phase: 'load', message: 'adapter broken: ./tools/d/broken.ts could not be loaded' });
    expect(((broken as OpenApiError).cause as Error).message).toBe('boom');
    const unknownBuiltin = { ...registry.adapters.nswag, module: { specifier: 'builtin:x', kind: 'builtin' as const, builtinId: 'x' } };
    await expect(loadAdapter(unknownBuiltin, root)).rejects.toThrow('unknown built-in adapter "x"');
  });

  it('loadTransform / loadScaffold check their SPI shape', async () => {
    write('t/ok.ts', "export default { apiVersion: 1, id: 'ok', transform: (files: unknown[]) => files };\n");
    write('t/bad.ts', "export default { apiVersion: 1, id: 'bad' };\n");
    write('s/ok.ts', "export default { apiVersion: 1, id: 's', writeLib() {} };\n");
    write('s/bad.ts', "export default { apiVersion: 1, id: 's' };\n");
    expect((await loadTransform('./t/ok.ts', root)).id).toBe('ok');
    await expect(loadTransform('./t/bad.ts', root, 'generated/x')).rejects.toThrow('transform ./t/bad.ts: transform missing');
    expect((await loadScaffold('./s/ok.ts', root)).id).toBe('s');
    await expect(loadScaffold('./s/bad.ts', root)).rejects.toThrow('scaffold ./s/bad.ts: writeLib missing');
  });
});

describe('validation', () => {
  it('options against the schema subset: types, enum, required, unknown keys, items, additionalProperties schema, anyOf', () => {
    const schema = {
      type: 'object' as const,
      properties: {
        command: { type: 'string' as const },
        args: { type: 'array' as const, items: { type: 'string' as const } },
        mode: { enum: ['a', 'b'] },
        count: { type: 'number' as const },
        level: { type: 'integer' as const },
        nested: { type: 'object' as const, additionalProperties: { type: ['string', 'boolean'] as ('string' | 'boolean')[] } },
        either: { anyOf: [{ type: 'string' as const }, { type: 'null' as const }] },
      },
      required: ['command'],
      additionalProperties: false,
    };
    expect(validateOptions(schema, { command: 'x', args: ['a'], mode: 'a', count: 1, level: 2, nested: { a: true }, either: null })).toEqual([]);
    expect(
      validateOptions(schema, { args: ['a', 1], mode: 'c', count: 'x', level: 1.5, nested: { a: 1 }, either: 3, extra: true }),
    ).toEqual([
      'options.command: required',
      'options.args[1]: expected string, got integer',
      'options.mode: must be one of "a", "b"',
      'options.count: expected number, got string',
      'options.level: expected integer, got number',
      'options.nested.a: expected string | boolean, got integer',
      'options.either: matches none of the allowed shapes',
      'options.extra: unknown option',
    ]);
    expect(validateOptions({ type: 'object' }, [])).toEqual(['options: expected object, got array']);
  });

  it('requirements: packages from the workspace root, minimum Node version', () => {
    write('node_modules/here/package.json', '{}');
    expect(unmetRequirements(undefined, root)).toEqual([]);
    expect(unmetRequirements({ packages: ['here', 'missing'], node: '>=99' }, root, 'v22.16.0')).toEqual([
      'package missing not installed (pnpm add -D missing)',
      'Node >=99 required, running v22.16.0',
    ]);
    expect(satisfiesMinimum('v22.16.0', '>=22.10')).toBe(true);
    expect(satisfiesMinimum('v22.9.1', '>=22.10')).toBe(false);
    expect(satisfiesMinimum('v22.10.0', '>=22.10.0')).toBe(true);
    expect(satisfiesMinimum('v23.0.0', '>=22.18')).toBe(true);
  });

  it('definitionProblem: no object, missing id', () => {
    expect(definitionProblem(undefined, 'x', undefined, [])).toBe('x: exports no definition (export default defineX({ … }))');
    expect(definitionProblem({ apiVersion: 1 }, 'x', undefined, [])).toBe('x: id missing');
    expect(definitionProblem({ apiVersion: 1, id: 'a', run: () => 1 }, 'x', 'a', ['run'])).toBeUndefined();
  });
});
