/**
 * Loads extension modules (module-ref.ts says where they are).
 *
 * Nx loads this package's .ts sources through a require hook it removes right after loading (and swc turns
 * `import()` into `require()`), so a .ts module loaded at run time would reach Node untranspiled. Workspace .ts
 * modules therefore go through an own require hook (TypeScript transpileModule → CommonJS), .mjs and ESM packages
 * through a real dynamic import (a Function-created `import()` that no transpiler rewrites), CommonJS through
 * require. ESM-only packages (exports with an `import` condition only) are resolved by reading their package.json
 * `exports` — require.resolve would not find them.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import { findModuleFile, findPackageDir, type ModuleRef, splitPackageSpecifier } from './module-ref';

const nodeRequire = createRequire(__filename);

type ExportsTarget = string | null | ExportsTarget[] | { [condition: string]: ExportsTarget };
const CONDITIONS = new Set(['node', 'require', 'import', 'default']);

function resolveExportsTarget(target: ExportsTarget, replacement?: string): string | undefined {
  if (typeof target === 'string') return replacement === undefined ? target : target.replaceAll('*', replacement);
  if (Array.isArray(target)) {
    for (const candidate of target) {
      const resolved = resolveExportsTarget(candidate, replacement);
      if (resolved) return resolved;
    }
    return undefined;
  }
  if (target && typeof target === 'object') {
    // object order decides (Node semantics): the first condition this loader supports wins
    for (const [condition, value] of Object.entries(target)) {
      if (!CONDITIONS.has(condition)) continue;
      const resolved = resolveExportsTarget(value, replacement);
      if (resolved) return resolved;
    }
  }
  return undefined;
}

/** package.json `exports` → the file of a subpath ('.' | './x'), incl. `./*` patterns. */
export function resolvePackageExports(exports: ExportsTarget, subpath: string): string | undefined {
  const isSubpathMap =
    exports !== null && typeof exports === 'object' && !Array.isArray(exports) && Object.keys(exports).some((key) => key.startsWith('.'));
  const map = (isSubpathMap ? exports : { '.': exports }) as Record<string, ExportsTarget>;
  if (subpath in map) return resolveExportsTarget(map[subpath]);
  for (const [pattern, target] of Object.entries(map)) {
    const star = pattern.indexOf('*');
    if (star < 0) continue;
    const [prefix, suffix] = [pattern.slice(0, star), pattern.slice(star + 1)];
    if (subpath.startsWith(prefix) && subpath.endsWith(suffix) && subpath.length >= pattern.length - 1) {
      return resolveExportsTarget(target, subpath.slice(prefix.length, subpath.length - suffix.length));
    }
  }
  return undefined;
}

export type ModuleFormat = 'esm' | 'cjs' | 'ts';

/** Entry file of a package specifier + how to load it. */
export function resolvePackageEntry(workspaceRoot: string, specifier: string): { file: string; format: ModuleFormat } {
  const { name, subpath } = splitPackageSpecifier(specifier);
  const dir = findPackageDir(workspaceRoot, name);
  if (!dir) throw new Error(`package ${name} not installed in ${workspaceRoot}`);
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) as {
    exports?: ExportsTarget;
    main?: string;
    type?: string;
  };
  const target =
    manifest.exports === undefined
      ? subpath === '.'
        ? (manifest.main ?? 'index.js')
        : subpath
      : resolvePackageExports(manifest.exports, subpath);
  if (!target) throw new Error(`package ${name}: "${subpath}" not exported (exports conditions node/require/import/default)`);
  const file = findModuleFile(join(dir, target)) ?? join(dir, target);
  return { file, format: formatOf(file, manifest.type) };
}

function formatOf(file: string, packageType: string | undefined): ModuleFormat {
  if (/\.c?ts$/.test(file)) return 'ts';
  if (file.endsWith('.mjs')) return 'esm';
  if (file.endsWith('.cjs')) return 'cjs';
  return packageType === 'module' ? 'esm' : 'cjs';
}

/** `type` of the nearest package.json above a file (decides .js = ESM or CommonJS). */
function nearestPackageType(file: string): string | undefined {
  let dir = dirname(file);
  for (;;) {
    const manifest = join(dir, 'package.json');
    if (existsSync(manifest)) return (JSON.parse(readFileSync(manifest, 'utf-8')) as { type?: string }).type;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

type Import = (specifier: string) => Promise<unknown>;
/** A real `import()`: created at run time, so neither swc (Nx) nor tsc turns it into `require()`. */
const functionImport = new Function('specifier', 'return import(specifier)') as Import;
/**
 * Inside a vm context without an import callback (Vitest runs modules like that) a Function-created import()
 * fails; there Node's main-context loader is borrowed explicitly (experimental API, so only as fallback).
 */
const vmImport = (): Import => {
  const vm = nodeRequire('node:vm') as {
    compileFunction(code: string, params: string[], options: object): Import;
    constants: { USE_MAIN_CONTEXT_DEFAULT_LOADER: symbol };
  };
  return vm.compileFunction('return import(specifier)', ['specifier'], {
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
  });
};

async function dynamicImport(specifier: string): Promise<unknown> {
  try {
    return await functionImport(specifier);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING') throw error;
    return vmImport()(specifier);
  }
}

let tsHookInstalled = false;

/**
 * require hook for .ts/.cts outside node_modules: TypeScript transpileModule → CommonJS. Installed once and kept
 * (the modules it loads may require further .ts files lazily); it only handles files the previous handler
 * would not (Node has none for .ts), never touches .js. Type errors are not reported here (that is typecheck's job).
 */
export function ensureTsRequireHook(): void {
  if (tsHookInstalled) return;
  tsHookInstalled = true;
  type Loader = (module: { _compile(code: string, file: string): void }, file: string) => void;
  const extensions = (nodeRequire('node:module') as { _extensions: Record<string, Loader> })._extensions;
  for (const extension of ['.ts', '.cts']) {
    const previous = extensions[extension];
    extensions[extension] = (module, file) => {
      if (previous && file.split(sep).includes('node_modules')) return previous(module, file);
      const { outputText } = ts.transpileModule(readFileSync(file, 'utf-8'), {
        fileName: file,
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          esModuleInterop: true,
          inlineSourceMap: true,
        },
      });
      module._compile(outputText, file);
    };
  }
}

async function loadFile(file: string, format: ModuleFormat): Promise<unknown> {
  if (format === 'esm') return dynamicImport(pathToFileURL(file).href);
  if (format === 'ts') ensureTsRequireHook();
  // a workspace module may have changed since the last load in this process (tests, watch): load it fresh
  delete nodeRequire.cache[realpathSync(file)];
  try {
    return nodeRequire(file);
  } catch (error) {
    // .js that is ESM after all, or ESM with top-level await (require(esm) refuses it)
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ERR_REQUIRE_ESM' || code === 'ERR_REQUIRE_ASYNC_MODULE') return dynamicImport(pathToFileURL(file).href);
    throw error;
  }
}

/** Loads a workspace or package module (built-ins are resolved by their extension point). */
export async function loadModule(ref: ModuleRef, workspaceRoot: string): Promise<unknown> {
  if (ref.kind === 'workspace') {
    if (!ref.absoluteFile) throw new Error(`${ref.specifier} not found`);
    const file = ref.absoluteFile;
    return loadFile(file, formatOf(file, nearestPackageType(file)));
  }
  if (ref.kind === 'package') {
    const { file, format } = resolvePackageEntry(workspaceRoot, ref.specifier);
    return loadFile(file, format);
  }
  throw new Error(`${ref.specifier}: built-in modules are not loaded from disk`);
}

/** The definition a module exports: `export default defineX(…)`, `module.exports = …`, ESM-wrapped CommonJS. */
export function pickDefinition(loaded: unknown): unknown {
  let candidate = loaded;
  for (let depth = 0; depth < 3; depth++) {
    if (candidate && typeof candidate === 'object' && 'apiVersion' in candidate) return candidate;
    candidate = (candidate as { default?: unknown } | undefined)?.default;
  }
  return loaded;
}
