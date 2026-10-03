import { formatFiles, type GeneratorCallback, logger, readNxJson, type Tree, updateNxJson } from '@nx/devkit';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { addClientEntry, readClientsJson } from '../../clients';
import { type ClientEntry, clientPartsOf, DEFAULT_ADAPTER, type Layout, settingsOf } from '../../config';
import { targetNamesOf, type OpenApiPluginOptions } from '../../plugin/openapi-clients';
import { clientPartConfig, clientProjectJson, DEFAULT_TARGET_NAMES, PACKAGE_NAME, type TargetNames } from '../../project-config';
import { resolveAdapterRegistry } from '../../registry/registry';
import { camelCase, clientRoot, fillTemplate, parseClientPath, PART_LAYERS, projectNameFor, TESTING_PART } from '../../settings';
import { assertKebabCase, writeJsonFile } from '../../tree-helpers';
import { resolveScaffold } from './scaffold';

export interface ClientGeneratorSchema {
  /** folder name, e.g. `pet-client` */
  name: string;
  /** owning domain (<libsDir>/<domain>/<clientFolder>/<name>); omitted = shared */
  domain?: string;
  /** spec: a file (workspace-relative or absolute, .yaml/.yml/.json) or an http(s) URL (downloaded once) */
  spec: string;
  /** source for update-spec; default: `spec` when it is a URL */
  url?: string;
  /** adapter id (built-in or openapi-clients.json → adapters); default: defaultAdapter */
  adapter?: string;
  /** `merged-core`: core goes into the api lib (no core lib) */
  layout?: Layout;
  /** false: no testing lib (pipeline.testing: false) */
  testing?: boolean;
  skipFormat?: boolean;
}

const isUrl = (value: string): boolean => /^https?:\/\//.test(value);

/** Committed spec file name + content: a URL is normalized to YAML (as update-spec does), a file is kept as is. */
async function loadSpec(tree: Tree, spec: string, url: string | undefined, projectName: string) {
  let text: string;
  let format: 'yaml' | 'json';
  if (isUrl(spec)) {
    const response = await fetch(spec);
    if (!response.ok) throw new Error(`GET ${spec}: ${response.status}`);
    text = await response.text();
    format = 'yaml';
  } else {
    // workspace-relative (read through the tree) or anywhere on disk
    text = tree.exists(spec)
      ? (tree.read(spec, 'utf-8') ?? '')
      : readFileSync(isAbsolute(spec) ? spec : join(tree.root, spec), 'utf-8');
    format = /\.json$/i.test(spec) ? 'json' : 'yaml';
  }
  let document: { openapi?: string; paths?: Record<string, unknown> };
  try {
    document = parseYaml(text);
  } catch (error) {
    throw new Error(`${spec}: no valid YAML/JSON (${(error as Error).message})`);
  }
  if (!/^3\./.test(String(document?.openapi ?? '')) || !Object.keys(document.paths ?? {}).length) {
    throw new Error(`${spec}: not an OpenAPI 3.x spec with at least one path`);
  }
  if (!isUrl(spec)) return { file: `openapi.${format}`, content: text.endsWith('\n') ? text : `${text}\n` };
  const header = [
    `# Source: ${url ?? spec}`,
    `# Update: nx run ${projectName}:update-spec (overwrites this file, normalized). Committed, the only source for generate-api-client.`,
  ];
  return {
    file: 'openapi.yaml',
    content: [...header, stringifyYaml(document, { lineWidth: 0, aliasDuplicateObjects: false })].join('\n'),
  };
}

/** Target names from the plugin's options in nx.json (testing lib dependsOn must match the inferred target). */
function targetNamesFromNxJson(tree: Tree): TargetNames {
  const plugin = (readNxJson(tree)?.plugins ?? []).find(
    (entry) => (typeof entry === 'string' ? entry : entry.plugin) === `${PACKAGE_NAME}/plugin`,
  );
  const options = typeof plugin === 'object' ? (plugin.options as OpenApiPluginOptions | undefined) : undefined;
  return { ...DEFAULT_TARGET_NAMES, ...targetNamesOf(options) };
}

/**
 * Renamed targets (plugin options) must reach the lib targets: `^generate-api-client` / `^generate-api-testing` in the
 * targetDefaults' dependsOn become the configured names. The plugin cannot do it (createNodes never edits nx.json).
 */
export function syncTargetDefaults(tree: Tree, names: TargetNames): void {
  if (names.client === DEFAULT_TARGET_NAMES.client && names.testing === DEFAULT_TARGET_NAMES.testing) return;
  const nxJson = readNxJson(tree);
  if (!nxJson?.targetDefaults) return;
  const rename: Record<string, string> = {
    [`^${DEFAULT_TARGET_NAMES.client}`]: `^${names.client}`,
    [`^${DEFAULT_TARGET_NAMES.testing}`]: `^${names.testing}`,
  };
  let changed = false;
  // a target default is one object or (Nx 23) a list of them
  const defaults = Object.values(nxJson.targetDefaults).flatMap((value) => (Array.isArray(value) ? value : [value])) as { dependsOn?: unknown }[];
  for (const target of defaults) {
    if (!Array.isArray(target.dependsOn)) continue;
    const dependsOn = [...new Set(target.dependsOn.map((entry: unknown) => (typeof entry === 'string' && rename[entry]) || entry))];
    if (JSON.stringify(dependsOn) !== JSON.stringify(target.dependsOn)) {
      target.dependsOn = dependsOn;
      changed = true;
    }
  }
  if (changed) updateNxJson(tree, nxJson);
}

/**
 * New OpenAPI client: spec file, the part libs (src/index.ts + their config files via the scaffold; the code is
 * generated into src/generated by generate-api-client / generate-api-testing), the client project.json
 * (name + tags; the plugin infers the targets from the entry), entry in openapi-clients.json.
 */
export async function clientGenerator(tree: Tree, options: ClientGeneratorSchema): Promise<GeneratorCallback> {
  const config = readClientsJson(tree);
  const settings = settingsOf(config);
  const scaffold = await resolveScaffold(tree, settings);
  assertKebabCase(options.name, 'Client');
  if (options.name === settings.clientFolder) throw new Error(`"${settings.clientFolder}" is reserved.`);
  const domain = options.domain && options.domain !== settings.sharedScope ? options.domain : undefined;
  if (domain) {
    assertKebabCase(domain, 'Domain');
    scaffold.validateDomain?.(tree, domain);
  }
  const clientPath = domain ? `${domain}/${settings.clientFolder}/${options.name}` : `${settings.clientFolder}/${options.name}`;
  const root = clientRoot(settings, clientPath);
  const client = parseClientPath(clientPath, settings);
  if (!client) throw new Error(`${root}: not a client path`);
  if (tree.exists(root)) throw new Error(`${root} exists already`);
  if (config.clients?.[clientPath]) throw new Error(`openapi-clients.json has an entry "${clientPath}" already`);
  const known = resolveAdapterRegistry(tree.root, config).adapters;
  if (options.adapter && !known[options.adapter]) {
    throw new Error(`Unknown adapter "${options.adapter}" — known: ${Object.keys(known).join(', ')} (consumer adapters: openapi-clients.json → adapters)`);
  }

  const projectName = projectNameFor(clientPath);
  const url = options.url ?? (isUrl(options.spec) ? options.spec : undefined);
  const spec = await loadSpec(tree, options.spec, url, projectName);
  const defaultAdapter = config.defaultAdapter ?? DEFAULT_ADAPTER;
  const entry: ClientEntry = {
    ...(url ? { url } : {}),
    ...(options.adapter && options.adapter !== defaultAdapter ? { adapter: options.adapter } : {}),
    ...(options.layout === 'merged-core' ? { layout: 'merged-core' as const } : {}),
    ...(options.testing === false ? { pipeline: { testing: false as const } } : {}),
  };
  const parts = clientPartsOf(entry);
  tree.write(`${root}/${spec.file}`, spec.content);
  for (const part of parts) tree.write(`${root}/${part}/src/index.ts`, `export * from './${settings.outputDir}';\n`);
  addClientEntry(tree, clientPath, entry);
  writeJsonFile(tree, `${root}/project.json`, clientProjectJson(clientPath, settings));
  const exists = (path: string): boolean => tree.exists(path);
  const targetNames = targetNamesFromNxJson(tree);
  syncTargetDefaults(tree, targetNames);
  for (const part of parts) {
    const { implicitDependencies, targets } = clientPartConfig(exists, clientPath, part, { settings, targetNames });
    scaffold.writeLib(tree, {
      libPath: `${clientPath}/${part}`,
      clientPath,
      part,
      tags: settings.partTags.map((tag) => fillTemplate(tag, { scope: client.scope, layer: PART_LAYERS[part] })),
      implicitDependencies,
      targets: targets ?? {},
      buildable: part !== TESTING_PART,
    });
  }

  if (!options.skipFormat) await formatFiles(tree);
  const alias = `${settings.aliasPrefix}${clientPath}`;
  const prefix = camelCase(options.name);
  return () => {
    logger.info(
      `Client ${projectName}: ${root}/{${spec.file},project.json,${parts.join(',')}}, paths in tsconfig.base.json, entry in openapi-clients.json.`,
    );
    logger.info(`Generate: nx run-many -t ${targetNames.client} ${targetNames.testing} (build/lint/test/typecheck do it on their own).`);
    logger.info(
      `Use: ${alias}/api (services) + /types in the ${domain ?? settings.sharedScope} data-access layer${parts.includes(TESTING_PART) ? `, specs: ${alias}/testing (${prefix}Handlers, ${prefix}Http)` : ''}.`,
    );
  };
}

export default clientGenerator;
