/**
 * Nx config of the generated OpenAPI clients: what the plugin infers (targets + cache inputs) and what the client
 * generator writes into project.json files (docs/openapi-pipeline-architektur.md).
 *
 *   <libsDir>/<client path>/openapi.yaml|json   committed spec — the only source of generation
 *   <libsDir>/<client path>/project.json        client project: name + tags (no targets, no code, no alias)
 *   inferred (plugin, inferClientTargets):
 *     client project   generate-api-client   executor generate, cached, outputs <part>/src/generated
 *                      update-spec           executor update-spec, fails without `url`, not cached
 *     testing lib      generate-api-testing  executor generate-testing, cached (unless pipeline.testing: false)
 *   <libsDir>/<client path>/<part>/project.json ordinary lib config (scaffold) + implicitDependencies
 *                                               part → client (→ sibling parts below)
 *
 * The entry stays in openapi-clients.json and is a `json` input (fields) of the targets, never their options:
 * Nx hashes the ProjectConfiguration of every dependency into `^default`/`^production`, target options there
 * would invalidate every dependent on any entry change. The options hold only `client`.
 * Adapter-dependent inputs follow the entry's adapter (registry) — derived, so they cannot drift.
 */
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import {
  adapterIdOf,
  type ClientEntry,
  CLIENTS_CONFIG_FILE,
  type ClientsConfig,
  clientPartsOf,
  codePartsOf,
  disabledFeaturesOf,
  findSpecFile,
  hasTesting,
  mockEngineOf,
  transformsOf,
  overlayFiles,
  settingsOf,
} from './config';
import { findPackageDir, moduleCacheInputs, moduleProblem, parseModuleRef } from './registry/module-ref';
import { adapterCacheInputs, type AdapterRegistry, resolveAdapter, resolveAdapterRegistry } from './registry/registry';
import {
  type ClientPart,
  clientRoot,
  DEFAULT_SETTINGS,
  fillTemplate,
  type MockEngine,
  type OpenApiSettings,
  parseClientPath,
  projectNameFor,
  TESTING_PART,
} from './settings';

export type { ClientEntry, ClientsConfig } from './config';

/** A target as written into project.json / inferred by the plugin. */
export type TargetJson = Record<string, unknown>;

/** Checks for files relative to the workspace root (fs or an Nx Tree). */
export type Exists = (path: string) => boolean;

/** Target names (plugin options in nx.json: `clientTargetName`, `testingTargetName`, `updateSpecTargetName`). */
export interface TargetNames {
  client: string;
  testing: string;
  updateSpec: string;
}
export const DEFAULT_TARGET_NAMES: TargetNames = {
  client: 'generate-api-client',
  testing: 'generate-api-testing',
  updateSpec: 'update-spec',
};
/** Target of the client project (inferred): adapter code of types/api/core. */
export const CLIENT_GENERATE_TARGET = DEFAULT_TARGET_NAMES.client;
/** Target of the client's testing lib (inferred): openapi-typescript + msw. */
export const TESTING_GENERATE_TARGET = DEFAULT_TARGET_NAMES.testing;
/** dependsOn of every lib target: the generated code of all dependencies (both target kinds). */
export const GENERATED_DEPENDS_ON = [`^${CLIENT_GENERATE_TARGET}`, `^${TESTING_GENERATE_TARGET}`];

/** Root of this package (src/.. — the same in the sources and in the built dist). */
const PACKAGE_ROOT = resolve(__dirname, '..');
export const PACKAGE_NAME = (JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf-8')) as { name: string }).name;

/** Executors of this package (executors.json). */
export const OPENAPI_EXECUTORS = {
  generate: `${PACKAGE_NAME}:generate`,
  generateTesting: `${PACKAGE_NAME}:generate-testing`,
  updateSpec: `${PACKAGE_NAME}:update-spec`,
};
/** npm packages of the testing preset (cache inputs of generate-api-testing): orval only in its (deprecated) mode */
const TESTING_PACKAGES: Record<MockEngine, string[]> = {
  'schema-faker': ['openapi-typescript', 'yaml'],
  orval: ['openapi-typescript', 'orval', 'yaml'],
};
/** source files every generate target runs (relative to src/); the client target adds the built-in adapters */
const PIPELINE_SOURCES = [
  'pipeline/**/*',
  'registry/**/*',
  'executors/**/*',
  // the plugin + project-config shape the inferred targets: a change must reach `nx affected` (no tooling fallback in CI)
  'plugin/**/*',
  'adapter.ts',
  'config.ts',
  'errors.ts',
  'facade.ts',
  'settings.ts',
  'project-config.ts',
];

/** realpath, or the resolved path of a folder that does not exist (a virtual Tree root) */
const realpath = (path: string): string => {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
};

/** This package's folder relative to the workspace root (posix), undefined outside or below node_modules. */
function packageFolderIn(workspaceRoot: string): string | undefined {
  const packageRoot = realpath(PACKAGE_ROOT);
  const fromRoot = relative(realpath(workspaceRoot), packageRoot);
  if (packageRoot.split(sep).includes('node_modules') || fromRoot.startsWith('..') || isAbsolute(fromRoot)) return undefined;
  return fromRoot.split(sep).join('/');
}

/** How the tooling itself enters the hash (settings.toolingInputs, `auto` decided by where this package lives). */
export function toolingMode(settings: OpenApiSettings, workspaceRoot: string): 'source' | 'package' | 'none' {
  if (settings.toolingInputs !== 'auto') return settings.toolingInputs;
  if (realpath(PACKAGE_ROOT).split(sep).includes('node_modules')) return 'package';
  return packageFolderIn(workspaceRoot) === undefined ? 'none' : 'source';
}

/** `$schema` of a new openapi-clients.json: the package's schema, in the workspace or below node_modules. */
export function schemaPathFor(workspaceRoot: string): string {
  const folder = packageFolderIn(workspaceRoot);
  return `./${folder ?? `node_modules/${PACKAGE_NAME}`}/openapi-clients.schema.json`;
}

interface ToolingInputs {
  files: string[];
  packages: string[];
}

function toolingInputs(settings: OpenApiSettings, workspaceRoot: string, extraSources: string[]): ToolingInputs {
  const mode = toolingMode(settings, workspaceRoot);
  if (mode === 'package') return { files: [], packages: [PACKAGE_NAME, 'typescript', 'yaml'] };
  if (mode === 'none') return { files: [], packages: ['typescript', 'yaml'] };
  const src = `${packageFolderIn(workspaceRoot) ?? '.'}/src`;
  return {
    files: [
      ...[...PIPELINE_SOURCES, ...extraSources].map((source) => `{workspaceRoot}/${src}/${source}`),
      // specs never run in a generate target (hash only: `nx affected` ignores negations)
      `!{workspaceRoot}/${src}/**/*.spec.ts`,
    ],
    packages: ['typescript', 'yaml'],
  };
}

/** Everything the plugin needs per createNodes call — built fresh each time (no memo across calls). */
export interface InferenceContext {
  workspaceRoot: string;
  config: ClientsConfig;
  settings: OpenApiSettings;
  registry: AdapterRegistry;
  exists: Exists;
  targetNames: TargetNames;
}

export function createInferenceContext(
  workspaceRoot: string,
  config: ClientsConfig,
  exists: Exists,
  targetNames: Partial<TargetNames> = {},
): InferenceContext {
  return {
    workspaceRoot,
    config,
    settings: settingsOf(config),
    registry: resolveAdapterRegistry(workspaceRoot, config),
    exists,
    targetNames: { ...DEFAULT_TARGET_NAMES, ...targetNames },
  };
}

/** Cache inputs of the transform hooks + prettier (pipeline.format). */
function pipelineInputs(entry: ClientEntry | undefined, workspaceRoot: string): { files: string[]; packages: string[] } {
  const files: string[] = [];
  const packages: string[] = [];
  for (const transform of transformsOf(entry)) {
    const ref = parseModuleRef(transform.module, workspaceRoot);
    const problem = moduleProblem(ref, workspaceRoot, 'pipeline.transforms');
    if (problem && ref.absoluteFile) throw new Error(problem);
    const inputs = moduleCacheInputs(ref);
    files.push(...inputs.files);
    packages.push(...inputs.packages);
  }
  if (entry?.pipeline?.format) {
    files.push('{workspaceRoot}/.prettierrc*', '{workspaceRoot}/.editorconfig');
    packages.push('prettier');
  }
  return { files, packages };
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

/** Packages the root package.json declares (they are in the lockfile → Nx external nodes). */
function declaredPackages(workspaceRoot: string): Set<string> {
  try {
    const manifest = JSON.parse(readFileSync(join(workspaceRoot, 'package.json'), 'utf-8')) as Record<string, Record<string, string> | undefined>;
    return new Set(['dependencies', 'devDependencies', 'optionalDependencies'].flatMap((key) => Object.keys(manifest[key] ?? {})));
  } catch {
    return new Set();
  }
}

/**
 * Only declared (root package.json → lockfile → Nx external node) AND installed packages become externalDependencies:
 * Nx' hasher fails the task for an unknown one ("externalDependency … could not be found"). The rest is collected
 * in `missing` (metadata + warning, verify).
 */
function installedOnly(workspaceRoot: string, packages: string[], missing?: Set<string>): string[] {
  const declared = declaredPackages(workspaceRoot);
  return unique(packages).filter((name) => {
    if (declared.has(name) && findPackageDir(workspaceRoot, name)) return true;
    missing?.add(name);
    return false;
  });
}

/** `generate-api-client` of the client project: pipeline (client preset) + the entry's adapter. */
export function generateTarget(context: InferenceContext, clientPath: string, specFile: string, missing?: Set<string>): TargetJson {
  const { config, settings, workspaceRoot } = context;
  const entry = config.clients?.[clientPath];
  const adapter = resolveAdapter(context.registry, adapterIdOf(config, clientPath), clientPath);
  const adapterInputs = adapterCacheInputs(adapter);
  const pipeline = pipelineInputs(entry, workspaceRoot);
  const tooling = toolingInputs(settings, workspaceRoot, ['adapters/**/*']);
  return {
    executor: OPENAPI_EXECUTORS.generate,
    cache: true,
    inputs: [
      `{workspaceRoot}/${specFile}`,
      ...overlayFiles(settings, clientPath, entry?.pipeline?.overlays).map((file) => `{workspaceRoot}/${file}`),
      // this client's entry only (+ the default adapter it may fall back to, settings, its consumer adapter)
      {
        json: `{workspaceRoot}/${CLIENTS_CONFIG_FILE}`,
        fields: [
          'defaultAdapter',
          'settings',
          ...(adapter.custom ? [`adapters.${adapter.id}`] : []),
          `clients.${clientPath}`,
        ],
      },
      // which parts are committed — the parts are projects of their own
      ...codePartsOf(entry).map((part) => `{workspaceRoot}/${clientRoot(settings, clientPath)}/${part}/src/index.ts`),
      ...tooling.files,
      ...adapterInputs.files,
      ...pipeline.files,
      { externalDependencies: installedOnly(workspaceRoot, [...adapterInputs.packages, ...pipeline.packages, ...tooling.packages], missing) },
      ...adapterInputs.runtime.map((runtime) => ({ runtime })),
    ],
    outputs: codePartsOf(entry).map((part) => `{projectRoot}/${part}/src/${settings.outputDir}`),
    options: { client: clientPath },
    metadata: { description: `OpenAPI client code (adapter ${adapter.id}) → ${codePartsOf(entry).join(', ')}` },
  };
}

/** `update-spec` of the client project — always there (fails without url): adding a url changes no project config. */
export function updateSpecTarget(clientPath: string): TargetJson {
  return {
    executor: OPENAPI_EXECUTORS.updateSpec,
    cache: false,
    // reads the url from the file at run time; not cached, so this input only feeds `nx affected`:
    // an edited openapi-clients.json affects every client (the cache of the generate targets stays per entry)
    inputs: [`{workspaceRoot}/${CLIENTS_CONFIG_FILE}`],
    options: { client: clientPath },
  };
}

/**
 * `generate-api-testing` of a client's testing lib: pipeline (testing preset) → openapi-typescript + orval mocks +
 * openapi-msw. Independent of the adapter — a switch keeps its cache.
 */
export function generateTestingTarget(context: InferenceContext, clientPath: string, specFile: string, missing?: Set<string>): TargetJson {
  const { config, settings, workspaceRoot } = context;
  const entry = config.clients?.[clientPath];
  const pipeline = pipelineInputs(entry, workspaceRoot);
  // the testing preset reads the raw output with adapters/files.ts
  const tooling = toolingInputs(settings, workspaceRoot, ['adapters/files.ts']);
  return {
    executor: OPENAPI_EXECUTORS.generateTesting,
    cache: true,
    inputs: [
      `{workspaceRoot}/${specFile}`,
      ...overlayFiles(settings, clientPath, entry?.pipeline?.overlays).map((file) => `{workspaceRoot}/${file}`),
      { json: `{workspaceRoot}/${CLIENTS_CONFIG_FILE}`, fields: ['settings', `clients.${clientPath}.pipeline`] },
      ...tooling.files,
      ...pipeline.files,
      {
        externalDependencies: installedOnly(workspaceRoot, [...TESTING_PACKAGES[mockEngineOf(settings, entry)], ...pipeline.packages, ...tooling.packages], missing),
      },
    ],
    outputs: [`{projectRoot}/src/${settings.outputDir}`],
    options: { client: clientPath },
    metadata: { description: `OpenAPI testing lib (openapi-typescript, ${mockEngineOf(settings, entry)} msw mocks, openapi-msw)` },
  };
}

/** Throws unless `clientPath` is <clientFolder>/<client> or <domain>/<clientFolder>/<client>. */
function assertClientPath(clientPath: string, settings: OpenApiSettings) {
  const client = parseClientPath(clientPath, settings);
  if (!client) {
    throw new Error(
      `${CLIENTS_CONFIG_FILE} → "${clientPath}": not a client path (${settings.clientFolder}/<client> or <domain>/${settings.clientFolder}/<client>)`,
    );
  }
  return client;
}

/** project.json of the client project: name + tags, the targets are inferred. */
export function clientProjectJson(clientPath: string, settings: OpenApiSettings = DEFAULT_SETTINGS): Record<string, unknown> {
  const client = assertClientPath(clientPath, settings);
  const root = clientRoot(settings, clientPath);
  return {
    name: projectNameFor(clientPath),
    $schema: `${'../'.repeat(root.split('/').length)}node_modules/nx/schemas/project-schema.json`,
    projectType: 'library',
    tags: settings.clientTags.map((tag) => fillTemplate(tag, { scope: client.scope })),
  };
}

export interface InferredClientNodes {
  /** project root → targets */
  projects: Record<string, Record<string, TargetJson>>;
  /** client path → metadata the plugin attaches (verify reads it from the graph) */
  metadata: Record<string, ClientMetadata>;
}

/** What verify reads from the graph instead of re-implementing the registry (project metadata `openapi`). */
export interface ClientMetadata {
  adapter: string;
  adapterSource?: 'builtin' | 'workspace' | 'package';
  layout: string;
  testing: boolean;
  /** mocks engine of the testing lib (absent without testing lib or for an unknown engine) */
  mocks?: MockEngine;
  parts: ClientPart[];
  problem?: string;
  /** declared packages (adapter, transforms, prettier, testing) that are not installed: left out of the cache inputs */
  missingPackages?: string[];
  /** experimental features the entry uses with their flag off (generate fails, verify reports) */
  disabledFeatures?: string[];
}

/**
 * Targets of the client project (+ its testing lib), inferred from its entry by the plugin. A broken entry
 * (bad path, missing/duplicate spec, unknown or unusable adapter) gets only `update-spec` + the problem.
 */
export function inferClientTargets(context: InferenceContext, clientPath: string): { targets: Record<string, Record<string, TargetJson>>; metadata: ClientMetadata } {
  const { config, settings, targetNames, exists } = context;
  const entry = config.clients?.[clientPath];
  const root = clientRoot(settings, clientPath);
  const metadata: ClientMetadata = {
    adapter: adapterIdOf(config, clientPath),
    adapterSource: context.registry.adapters[adapterIdOf(config, clientPath)]?.module.kind,
    layout: entry?.layout ?? 'default',
    testing: hasTesting(entry),
    parts: clientPartsOf(entry),
  };
  if (metadata.testing) {
    try {
      metadata.mocks = mockEngineOf(settings, entry);
    } catch (error) {
      metadata.problem = (error as Error).message;
    }
  }
  const disabled = disabledFeaturesOf(settings, entry);
  if (disabled.length) metadata.disabledFeatures = disabled;
  const targets: Record<string, Record<string, TargetJson>> = { [root]: { [targetNames.updateSpec]: updateSpecTarget(clientPath) } };
  try {
    assertClientPath(clientPath, settings);
    const specFile = findSpecFile(exists, settings, clientPath);
    const missing = new Set<string>();
    targets[root][targetNames.client] = generateTarget(context, clientPath, specFile, missing);
    const testingRoot = `${root}/${TESTING_PART}`;
    if (hasTesting(entry) && exists(`${testingRoot}/project.json`)) {
      targets[testingRoot] = { [targetNames.testing]: generateTestingTarget(context, clientPath, specFile, missing) };
    }
    if (missing.size) metadata.missingPackages = [...missing];
  } catch (error) {
    metadata.problem = (error as Error).message;
  }
  return { targets, metadata };
}

/**
 * implicitDependencies of a part lib: its client (`^generate-api-client`, affected — the generated code is
 * gitignored, so Nx sees no import edges) and the existing parts below it (build order).
 */
export function clientPartEdges(exists: Exists, client: { path: string; part: string }, settings: OpenApiSettings = DEFAULT_SETTINGS): string[] {
  const below: Record<string, string[]> = { types: [], core: ['types'], api: ['types', 'core'], testing: [] };
  const siblings = (below[client.part] ?? [])
    .filter((part) => exists(`${clientRoot(settings, client.path)}/${part}/src/index.ts`))
    .map((part) => projectNameFor(`${client.path}/${part}`));
  return [projectNameFor(client.path), ...siblings];
}

/**
 * Lib config of a client part (what the scaffold writes besides its convention files): edges; the testing lib
 * generates its own code before lint/typecheck. No peerDependencies: the generated code is gitignored.
 */
export function clientPartConfig(
  exists: Exists,
  clientPath: string,
  part: string,
  options: { settings?: OpenApiSettings; targetNames?: TargetNames } = {},
): { implicitDependencies: string[]; peerDependencies: Record<string, string>; targets?: Record<string, TargetJson> } {
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const names = options.targetNames ?? DEFAULT_TARGET_NAMES;
  const implicitDependencies = clientPartEdges(exists, { path: clientPath, part }, settings);
  if (part !== TESTING_PART) return { implicitDependencies, peerDependencies: {} };
  const dependsOn = [names.testing, `^${names.client}`, `^${names.testing}`];
  return { implicitDependencies, peerDependencies: {}, targets: { lint: { dependsOn }, typecheck: { dependsOn } } };
}
