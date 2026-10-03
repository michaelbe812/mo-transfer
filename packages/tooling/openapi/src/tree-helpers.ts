/**
 * Small Nx Tree helpers of the generator and the clients helpers (own copy: the package has no workspace
 * dependency — settings decide the folders).
 */
import type { Tree } from '@nx/devkit';
import { KEBAB_CASE } from './settings';

export const readJsonFile = <T = Record<string, unknown>>(tree: Tree, path: string): T =>
  JSON.parse(tree.read(path, 'utf-8') as string) as T;

/** 2 spaces + newline; formatFiles (prettier) normalizes the layout afterwards. */
export const writeJsonFile = (tree: Tree, path: string, json: unknown): void =>
  tree.write(path, `${JSON.stringify(json, null, 2)}\n`);

/** `../` per folder of `dir` (workspace-relative) */
export const offsetFromRoot = (dir: string): string => '../'.repeat(dir.split('/').filter(Boolean).length);

export function assertKebabCase(value: string, what: string): void {
  if (!KEBAB_CASE.test(value)) throw new Error(`${what} "${value}" must be kebab-case (e.g. "check-booking").`);
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every string that names a moved client path: `<libsDir>/<from>…` (inputs, outputs), `<from>…` (the `client`
 * option) and `clients.<from>…` (json input fields of openapi-clients.json).
 */
export function replacePaths(value: unknown, from: string, to: string, libsDir: string): unknown {
  if (typeof value === 'string') {
    const below = (text: string, prefix: string): boolean => text === `${prefix}${from}` || text.startsWith(`${prefix}${from}/`);
    const inLibs = value.replace(new RegExp(`(^|/)${escapeRegExp(libsDir)}/${escapeRegExp(from)}(?=$|/)`, 'g'), `$1${libsDir}/${to}`);
    if (below(inLibs, '')) return `${to}${inLibs.slice(from.length)}`;
    if (below(inLibs, 'clients.')) return `clients.${to}${inLibs.slice(`clients.${from}`.length)}`;
    return inLibs;
  }
  if (Array.isArray(value)) return value.map((item) => replacePaths(item, from, to, libsDir));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replacePaths(item, from, to, libsDir)]));
  }
  return value;
}

/** Source files below the given folders (where alias imports live), node_modules/dist/tmp skipped. */
export function forEachSourceFile(tree: Tree, roots: string[], callback: (path: string, content: string) => void): void {
  const visit = (dir: string): void => {
    if (!tree.exists(dir)) return;
    for (const child of tree.children(dir)) {
      const path = `${dir}/${child}`;
      if (tree.isFile(path)) {
        if (/\.(ts|mts|cts|js|mjs|cjs|html)$/.test(child)) callback(path, tree.read(path, 'utf-8') as string);
      } else if (!['node_modules', 'dist', 'tmp'].includes(child)) {
        visit(path);
      }
    }
  };
  roots.forEach(visit);
}
