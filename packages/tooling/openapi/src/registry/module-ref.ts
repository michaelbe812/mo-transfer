/**
 * Extension modules (adapters, transforms, scaffolds): where a specifier points to and what makes it a cache
 * input — one implementation for every extension point. Light (no TypeScript): the plugin uses it on every
 * createNodes. Loading: loader.ts.
 *
 *   ./tools/x.ts | ../x | /abs/x.mjs   workspace module: cache input = its folder ({workspaceRoot}/<dir>/**)
 *   @acme/openapi-x[/sub] | pkg         npm package: cache input = externalDependencies [<package>]
 *   builtin:<id>                        built into this package
 */
import { existsSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from 'node:path';

export type ModuleKind = 'builtin' | 'workspace' | 'package';

export interface ModuleRef {
  /** as written in openapi-clients.json */
  specifier: string;
  kind: ModuleKind;
  /** builtin: the id after `builtin:` */
  builtinId?: string;
  /** workspace: absolute file */
  absoluteFile?: string;
  /** workspace: workspace-relative posix path (undefined outside the workspace) */
  file?: string;
  /** package: package name (without subpath) */
  packageName?: string;
}

const BUILTIN_PREFIX = 'builtin:';
const MODULE_EXTENSIONS = ['.ts', '.cts', '.js', '.cjs', '.mjs'];

const toPosix = (path: string): string => path.split(sep).join('/');

/** The file a workspace specifier points to: as is, + an extension, or the folder's index. */
export function findModuleFile(absolute: string): string | undefined {
  if (existsSync(absolute) && statSync(absolute).isFile()) return absolute;
  const withExtension = MODULE_EXTENSIONS.map((extension) => `${absolute}${extension}`).find((file) => existsSync(file));
  if (withExtension) return withExtension;
  return MODULE_EXTENSIONS.map((extension) => join(absolute, `index${extension}`)).find((file) => existsSync(file));
}

export const isWorkspaceSpecifier = (specifier: string): boolean =>
  specifier.startsWith('./') || specifier.startsWith('../') || isAbsolute(specifier);

/** `@scope/name/sub/path` → { name: '@scope/name', subpath: './sub/path' } */
export function splitPackageSpecifier(specifier: string): { name: string; subpath: string } {
  const segments = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  const rest = segments.slice(nameLength).join('/');
  return { name: segments.slice(0, nameLength).join('/'), subpath: rest ? `./${rest}` : '.' };
}

/** Where a specifier points to. Never throws: a missing workspace file has no `absoluteFile` (see moduleProblem). */
export function parseModuleRef(specifier: string, workspaceRoot: string): ModuleRef {
  if (specifier.startsWith(BUILTIN_PREFIX)) {
    return { specifier, kind: 'builtin', builtinId: specifier.slice(BUILTIN_PREFIX.length) };
  }
  if (isWorkspaceSpecifier(specifier)) {
    const absoluteFile = findModuleFile(resolve(workspaceRoot, specifier));
    const inside = absoluteFile && !relative(workspaceRoot, absoluteFile).startsWith('..');
    return {
      specifier,
      kind: 'workspace',
      absoluteFile,
      file: inside ? toPosix(relative(workspaceRoot, absoluteFile)) : undefined,
    };
  }
  return { specifier, kind: 'package', packageName: splitPackageSpecifier(specifier).name };
}

/** Folder of an installed package, searched like Node does (node_modules of the root and its parents). */
export function findPackageDir(workspaceRoot: string, packageName: string): string | undefined {
  let dir = resolve(workspaceRoot);
  for (;;) {
    const candidate = join(dir, 'node_modules', packageName);
    if (existsSync(join(candidate, 'package.json'))) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

/** Why a module cannot be loaded (undefined = fine); `what` names it in the message. */
export function moduleProblem(ref: ModuleRef, workspaceRoot: string, what: string): string | undefined {
  if (ref.kind === 'workspace' && !ref.absoluteFile) return `${what}: ${ref.specifier} not found (relative to the workspace root)`;
  if (ref.kind === 'package' && !findPackageDir(workspaceRoot, ref.packageName as string)) {
    return `${what}: package ${ref.packageName} not installed (pnpm add -D ${ref.packageName})`;
  }
  return undefined;
}

/**
 * Cache inputs that follow a module: the folder of a workspace module (its helpers live next to it — one folder per
 * adapter keeps the cache precise), the package of an npm module. Built-ins are covered by the tooling inputs.
 */
export function moduleCacheInputs(ref: ModuleRef): { files: string[]; packages: string[] } {
  if (ref.kind === 'package') return { files: [], packages: [ref.packageName as string] };
  if (ref.kind === 'workspace' && ref.file) {
    const dir = posix.dirname(ref.file);
    return { files: [dir === '.' ? `{workspaceRoot}/${ref.file}` : `{workspaceRoot}/${dir}/**/*`], packages: [] };
  }
  return { files: [], packages: [] };
}

