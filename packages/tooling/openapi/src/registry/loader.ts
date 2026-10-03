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

async function dynamicImport(specifier: string): Promise<unknown> {
  try {
    return await functionImport(specifier);
  } catch (error) {
    // Vitest runs modules in a vm context without an import callback: there the module's own import() works
    if ((error as NodeJS.ErrnoException).code !== 'ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING') throw error;
    return import(specifier);
  }
}

type Loader = (module: { _compile(code: string, file: string): void }, file: string) => void;
const TS_EXTENSIONS = ['.ts', '.cts'];

const insideAny = (file: string, roots: readonly string[]): boolean =>
  roots.some((root) => file === root || file.startsWith(`${root}${sep}`));

/** TypeScript transpileModule → CommonJS (no type check: that is typecheck's job). */
const transpile: Loader = (module, file) => {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf-8'), {
    fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, inlineSourceMap: true },
  });
  module._compile(outputText, file);
};

/**
 * Runs `load` with a require hook for .ts/.cts below `roots` (the folder of the module being loaded): those are
 * transpiled by TypeScript — also below node_modules, where Node's own type stripping (≥ 22.18) refuses. Every
 * other .ts goes to the previous handler (Nx' swc hook, Node's type stripping); without one, it is transpiled, too.
 * The previous handlers are restored afterwards: a module must import its .ts helpers statically (top level) — a
 * lazy require() of further .ts files at run time is not supported (the same rule Nx sets for this package).
 */
function withTsRequireHook<T>(roots: readonly string[], load: () => T): T {
  const extensions = (nodeRequire('node:module') as { _extensions: Record<string, Loader | undefined> })._extensions;
  const saved = TS_EXTENSIONS.map((extension) => [extension, extensions[extension]] as const);
  for (const [extension, previous] of saved) {
    extensions[extension] = (module, file) => (previous && !insideAny(file, roots) ? previous(module, file) : transpile(module, file));
  }
  try {
    return load();
  } finally {
    for (const [extension, previous] of saved) {
      if (previous) extensions[extension] = previous;
      else delete extensions[extension];
    }
  }
}

/** A module may have changed since the last load in this process (tests, watch): its whole folder loads fresh. */
function clearRequireCache(root: string): void {
  for (const key of Object.keys(nodeRequire.cache)) if (insideAny(key, [root])) delete nodeRequire.cache[key];
}

async function loadFile(file: string, format: ModuleFormat, root: string): Promise<unknown> {
  if (format === 'esm') return dynamicImport(pathToFileURL(file).href);
  clearRequireCache(root);
  try {
    return format === 'ts' ? withTsRequireHook([root], () => nodeRequire(file)) : nodeRequire(file);
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
    const file = realpathSync(ref.absoluteFile);
    return loadFile(file, formatOf(file, nearestPackageType(file)), dirname(file));
  }
  if (ref.kind === 'package') {
    const { file, format } = resolvePackageEntry(workspaceRoot, ref.specifier);
    const real = realpathSync(file);
    const packageDir = realpathSync(findPackageDir(workspaceRoot, splitPackageSpecifier(ref.specifier).name) as string);
    return loadFile(real, format, packageDir);
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
