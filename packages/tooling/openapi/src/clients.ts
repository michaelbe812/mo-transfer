/**
 * openapi-clients.json on the Nx Tree: read/write entries, keep them in step with moved/removed libs
 * (used by the client generator and by move/rename/remove generators of a workspace, e.g. @mo-transfer/tooling-workspace).
 */
import type { Tree } from '@nx/devkit';
import { CLIENTS_CONFIG_FILE, type ClientEntry, type ClientsConfig, DEFAULT_ADAPTER, settingsOf } from './config';
import { schemaPathFor } from './project-config';
import { camelCase, clientRoot, fillTemplate, parseClientPath, projectNameFor } from './settings';
import { forEachSourceFile, offsetFromRoot, readJsonFile, replacePaths, writeJsonFile } from './tree-helpers';

export type { ClientEntry, ClientsConfig } from './config';

/** What moved (paths below libsDir): a lib, a client or a whole slice. */
export interface Moved {
  from: string;
  to: string;
}

/** openapi-clients.json in the tree (defaults if missing). */
export function readClientsJson(tree: Tree): ClientsConfig {
  if (!tree.exists(CLIENTS_CONFIG_FILE)) {
    return { $schema: schemaPathFor(tree.root), defaultAdapter: DEFAULT_ADAPTER, clients: {} };
  }
  return JSON.parse(tree.read(CLIENTS_CONFIG_FILE, 'utf-8') ?? '{}') as ClientsConfig;
}

/** 2 spaces + newline (Prettier-stable, formatFiles keeps it), key order kept. */
export function writeClientsJson(tree: Tree, config: ClientsConfig): void {
  tree.write(CLIENTS_CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
}

export function addClientEntry(tree: Tree, clientPath: string, entry: ClientEntry): void {
  const config = readClientsJson(tree);
  writeClientsJson(tree, { ...config, clients: { ...config.clients, [clientPath]: entry } });
}

/**
 * Keeps openapi-clients.json in step with a moved/removed lib path: every client at or below `from`
 * is renamed to `to` (move) or dropped (`to` undefined, remove). A path inside a client (one part) leaves
 * the entry alone (layout, pipeline and overlays move with it: overlays are relative to the client folder).
 * Returns the affected [from, to] client paths.
 */
export function updateClientEntries(tree: Tree, from: string, to?: string): [string, string | undefined][] {
  if (!tree.exists(CLIENTS_CONFIG_FILE)) return [];
  const config = readClientsJson(tree);
  const changed: [string, string | undefined][] = [];
  const clients = Object.fromEntries(
    Object.entries(config.clients ?? {}).flatMap(([clientPath, entry]) => {
      if (clientPath !== from && !clientPath.startsWith(`${from}/`)) return [[clientPath, entry]];
      const target = to === undefined ? undefined : `${to}${clientPath.slice(from.length)}`;
      changed.push([clientPath, target]);
      return target === undefined ? [] : [[target, entry]];
    }),
  );
  if (changed.length) writeClientsJson(tree, { ...config, clients });
  return changed;
}

/**
 * The client project.json (<libsDir>/<client>/project.json, not a lib) after the client moved from `from` to `to`:
 * name, $schema offset, tags (its targets are inferred from the moved entry; paths in leftover explicit
 * targets are rewritten, too). `moved` = what was moved (the client, or the slice it lives in). Returns the new name.
 */
export function relocateClientProject(tree: Tree, from: string, to: string, moved: Moved = { from, to }): string {
  const settings = settingsOf(readClientsJson(tree));
  const file = `${clientRoot(settings, to)}/project.json`;
  const client = parseClientPath(to, settings);
  const name = projectNameFor(to);
  if (!tree.exists(file) || !client) return name;
  const project = replacePaths(readJsonFile(tree, file), moved.from, moved.to, settings.libsDir) as Record<string, unknown>;
  writeJsonFile(tree, file, {
    ...project,
    name,
    $schema: `${offsetFromRoot(clientRoot(settings, to))}node_modules/nx/schemas/project-schema.json`,
    tags: settings.clientTags.map((tag) => fillTemplate(tag, { scope: client.scope })),
  });
  return name;
}

/**
 * A renamed client renames its generated testing exports (`<client>Http`, `<client>Handlers`,
 * `<client>BaseUrl`): rewrite their usages in apps/ and the libs. Returns the changed files.
 */
export function renameClientExports(tree: Tree, fromClientPath: string, toClientPath: string): string[] {
  const settings = settingsOf(readClientsJson(tree));
  const from = parseClientPath(fromClientPath, settings);
  const to = parseClientPath(toClientPath, settings);
  if (!from || !to || from.name === to.name) return [];
  const pattern = new RegExp(`\\b${camelCase(from.name)}(Http|Handlers|BaseUrl)\\b`, 'g');
  const changed: string[] = [];
  forEachSourceFile(tree, ['apps', settings.libsDir], (file, content) => {
    const updated = content.replace(pattern, `${camelCase(to.name)}$1`);
    if (updated !== content) {
      tree.write(file, updated);
      changed.push(file);
    }
  });
  return changed;
}
