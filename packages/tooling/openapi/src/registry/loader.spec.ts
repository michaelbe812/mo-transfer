/**
 * The one module loader of all extension points: workspace .ts (own require hook — Nx' swc hook is gone at run
 * time), .js/.cjs (CommonJS), .mjs and type:module .js (real dynamic import), npm packages incl. ESM-only ones
 * (exports read by hand), and the cache inputs that follow a module.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadModule, pickDefinition, resolvePackageEntry, resolvePackageExports } from './loader';
import { findPackageDir, moduleCacheInputs, moduleProblem, parseModuleRef, splitPackageSpecifier } from './module-ref';

let root: string;
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const load = async (specifier: string) => pickDefinition(await loadModule(parseModuleRef(specifier, root), root)) as Record<string, unknown>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openapi-loader-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('module refs', () => {
  it('workspace paths (file, extensionless, folder index, outside), packages (scoped, subpath), built-ins', () => {
    write('tools/a/adapter.ts', '');
    write('tools/b/index.mjs', '');
    write('root-adapter.cjs', '');
    expect(parseModuleRef('./tools/a/adapter.ts', root)).toEqual({
      specifier: './tools/a/adapter.ts',
      kind: 'workspace',
      absoluteFile: join(root, 'tools/a/adapter.ts'),
      file: 'tools/a/adapter.ts',
    });
    expect(parseModuleRef('./tools/a/adapter', root).file).toBe('tools/a/adapter.ts');
    expect(parseModuleRef('./tools/b', root).file).toBe('tools/b/index.mjs');
    expect(parseModuleRef(join(root, 'root-adapter.cjs'), root).file).toBe('root-adapter.cjs');
    expect(parseModuleRef('../elsewhere.ts', join(root, 'tools/a')).file).toBeUndefined();
    expect(parseModuleRef('./missing.ts', root)).toEqual({ specifier: './missing.ts', kind: 'workspace', absoluteFile: undefined, file: undefined });
    expect(parseModuleRef('@acme/x/sub', root)).toEqual({ specifier: '@acme/x/sub', kind: 'package', packageName: '@acme/x' });
    expect(parseModuleRef('builtin:command', root)).toEqual({ specifier: 'builtin:command', kind: 'builtin', builtinId: 'command' });
    expect(splitPackageSpecifier('pkg')).toEqual({ name: 'pkg', subpath: '.' });
    expect(splitPackageSpecifier('pkg/a/b')).toEqual({ name: 'pkg', subpath: './a/b' });
  });

  it('cache inputs: the module folder (or the file in the root), the package; problems name the module', () => {
    write('tools/a/adapter.ts', '');
    write('root-adapter.ts', '');
    expect(moduleCacheInputs(parseModuleRef('./tools/a/adapter.ts', root))).toEqual({ files: ['{workspaceRoot}/tools/a/**/*'], packages: [] });
    expect(moduleCacheInputs(parseModuleRef('./root-adapter.ts', root))).toEqual({ files: ['{workspaceRoot}/root-adapter.ts'], packages: [] });
    expect(moduleCacheInputs(parseModuleRef('@acme/x/sub', root))).toEqual({ files: [], packages: ['@acme/x'] });
    expect(moduleCacheInputs(parseModuleRef('builtin:command', root))).toEqual({ files: [], packages: [] });
    expect(moduleProblem(parseModuleRef('./nope.ts', root), root, 'adapter x')).toBe('adapter x: ./nope.ts not found (relative to the workspace root)');
    expect(moduleProblem(parseModuleRef('@acme/none', root), root, 'adapter x')).toBe('adapter x: package @acme/none not installed (pnpm add -D @acme/none)');
    expect(moduleProblem(parseModuleRef('./tools/a/adapter.ts', root), root, 'adapter x')).toBeUndefined();
    write('node_modules/@acme/here/package.json', '{}');
    expect(findPackageDir(join(root, 'deep/below'), '@acme/here')).toBe(join(root, 'node_modules/@acme/here'));
    expect(moduleProblem(parseModuleRef('@acme/here', root), root, 'x')).toBeUndefined();
  });
});

describe('loading', () => {
  it('workspace .ts with a relative .ts helper (own require hook), fresh after a change', async () => {
    write('tools/ts/adapter.ts', "import { id } from './helper';\nconst x: number = 1;\nexport default { apiVersion: 1, id, x };\n");
    write('tools/ts/helper.ts', "export const id: string = 'ts-adapter';\n");
    expect(await load('./tools/ts/adapter.ts')).toEqual({ apiVersion: 1, id: 'ts-adapter', x: 1 });
    write('tools/ts/adapter.ts', "export default { apiVersion: 1, id: 'changed' };\n");
    expect((await load('./tools/ts/adapter.ts')).id).toBe('changed');
  });

  it('CommonJS (.cjs, .js), ESM (.mjs, .js in a type:module folder, ESM with top-level await)', async () => {
    write('a.cjs', "module.exports = { apiVersion: 1, id: 'cjs' };\n");
    write('b.js', "exports.default = { apiVersion: 1, id: 'js' };\n");
    write('c.mjs', "export default { apiVersion: 1, id: 'mjs' };\n");
    write('esm/package.json', '{"type":"module"}');
    write('esm/d.js', "export default { apiVersion: 1, id: 'esm-js' };\n");
    write('tla/e.js', "await Promise.resolve();\nexport default { apiVersion: 1, id: 'tla' };\n");
    expect((await load('./a.cjs')).id).toBe('cjs');
    expect((await load('./b.js')).id).toBe('js');
    expect((await load('./c.mjs')).id).toBe('mjs');
    expect((await load('./esm/d.js')).id).toBe('esm-js');
    expect((await load('./tla/e.js')).id).toBe('tla');
  });

  it('npm packages: ESM-only exports (import condition), subpath patterns, CommonJS main, .ts entry', async () => {
    write(
      'node_modules/@acme/esm-adapter/package.json',
      JSON.stringify({ name: '@acme/esm-adapter', type: 'module', exports: { '.': { import: './index.js' }, './sub/*': { import: './sub/*.js' } } }),
    );
    write('node_modules/@acme/esm-adapter/index.js', "export default { apiVersion: 1, id: 'esm-only' };\n");
    write('node_modules/@acme/esm-adapter/sub/x.js', "export default { apiVersion: 1, id: 'sub-x' };\n");
    write('node_modules/cjs-adapter/package.json', JSON.stringify({ name: 'cjs-adapter', main: 'lib.js' }));
    write('node_modules/cjs-adapter/lib.js', "module.exports = { apiVersion: 1, id: 'cjs-main' };\n");
    write('node_modules/plain-adapter/package.json', JSON.stringify({ name: 'plain-adapter' }));
    write('node_modules/plain-adapter/index.js', "module.exports = { apiVersion: 1, id: 'plain' };\n");
    write('node_modules/plain-adapter/extra.js', "module.exports = { apiVersion: 1, id: 'plain-extra' };\n");
    write('node_modules/ts-adapter/package.json', JSON.stringify({ name: 'ts-adapter', exports: './src/index.ts' }));
    write('node_modules/ts-adapter/src/index.ts', "export default { apiVersion: 1 as const, id: 'ts-package' };\n");
    expect((await load('@acme/esm-adapter')).id).toBe('esm-only');
    expect((await load('@acme/esm-adapter/sub/x')).id).toBe('sub-x');
    expect((await load('cjs-adapter')).id).toBe('cjs-main');
    expect((await load('plain-adapter')).id).toBe('plain');
    expect((await load('plain-adapter/extra')).id).toBe('plain-extra');
    expect((await load('ts-adapter')).id).toBe('ts-package');
    expect(() => resolvePackageEntry(root, '@acme/esm-adapter/missing')).toThrow('package @acme/esm-adapter: "./missing" not exported');
    expect(() => resolvePackageEntry(root, '@acme/none')).toThrow('package @acme/none not installed');
    await expect(loadModule(parseModuleRef('builtin:command', root), root)).rejects.toThrow('built-in modules are not loaded from disk');
    await expect(loadModule(parseModuleRef('./nope.ts', root), root)).rejects.toThrow('./nope.ts not found');
  });

  it('a module that throws while loading: the error surfaces', async () => {
    write('broken.cjs', "throw new Error('boom');\n");
    await expect(load('./broken.cjs')).rejects.toThrow('boom');
  });

  it('exports resolution: string, arrays, nested + unknown conditions, null, patterns', () => {
    expect(resolvePackageExports('./a.js', '.')).toBe('./a.js');
    expect(resolvePackageExports({ '.': [{ browser: './b.js' }, './n.js'] }, '.')).toBe('./n.js');
    expect(resolvePackageExports({ node: { require: './r.cjs' }, default: './d.js' }, '.')).toBe('./r.cjs');
    expect(resolvePackageExports({ '.': null }, '.')).toBeUndefined();
    expect(resolvePackageExports({ '.': [null] }, '.')).toBeUndefined();
    expect(resolvePackageExports({ './x/*.js': './dist/x/*.js', './y': './y.js' }, './x/a.js')).toBe('./dist/x/a.js');
    expect(resolvePackageExports({ './x/*': './x/*.js' }, './other')).toBeUndefined();
  });

  it('pickDefinition: default export, module.exports, ESM-wrapped CommonJS, no definition', () => {
    const definition = { apiVersion: 1 };
    expect(pickDefinition(definition)).toBe(definition);
    expect(pickDefinition({ default: definition })).toBe(definition);
    expect(pickDefinition({ default: { default: definition } })).toBe(definition);
    expect(pickDefinition({ other: 1 })).toEqual({ other: 1 });
    expect(pickDefinition(undefined)).toBeUndefined();
  });

  it('the hook leaves .ts below node_modules to a previous handler (e.g. Nx\' swc hook)', async () => {
    vi.resetModules();
    const extensions = (createRequire(__filename)('node:module') as { _extensions: Record<string, unknown> })._extensions;
    const saved = extensions['.ts'];
    const previous = vi.fn((module: { _compile(code: string, file: string): void }, file: string) =>
      module._compile("module.exports = { apiVersion: 1, id: 'by-previous' };", file),
    );
    extensions['.ts'] = previous;
    try {
      const fresh = await import('./loader.js');
      fresh.ensureTsRequireHook();
      fresh.ensureTsRequireHook();
      write('node_modules/prev/package.json', JSON.stringify({ name: 'prev', main: 'index.ts' }));
      write('node_modules/prev/index.ts', 'this is not even TypeScript');
      expect(pickDefinition(await fresh.loadModule(parseModuleRef('prev', root), root))).toEqual({ apiVersion: 1, id: 'by-previous' });
      expect(previous).toHaveBeenCalledTimes(1);
    } finally {
      extensions['.ts'] = saved;
    }
  });
});
