/**
 * openapi-clients.json (workspace root): one entry per client, consumer adapters, workspace settings.
 *
 *   { "defaultAdapter": "openapi-tools",
 *     "settings": { … },                                         src/settings.ts
 *     "adapters": { "orval": { "module": "./tools/orval.ts", "packages": ["orval"] } },   src/registry
 *     "clients": { "generated/pet-client": { "url": "…", "adapter": "hey-api", "options": {…},
 *                  "layout": "merged-core", "pipeline": { "overlays": [], "transforms": [], "format": false, "testing": "msw" } } } }
 *
 * Read fresh on every call (no memo): executors, plugin (every createNodes), generator and verify see the file as it is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenApiError } from './errors';
import {
  type ClientLocation,
  type ClientPart,
  clientRoot,
  isRecord,
  isSafeRelativePath,
  MOCK_ENGINES,
  type MockEngine,
  type OpenApiSettings,
  parseClientPath,
  type Part,
  PARTS,
  resolveSettings,
  TESTING_PART,
} from './settings';

export const CLIENTS_CONFIG_FILE = 'openapi-clients.json';
export const DEFAULT_ADAPTER = 'openapi-tools';

/** Only variant besides the default (types, api, core): core merged into api (both data-access). */
export type Layout = 'default' | 'merged-core';

/** A transform hook: module specifier (workspace path or package) or with options. */
export type TransformEntry = string | { module: string; options?: Record<string, unknown> };

export interface PipelineConfig {
  /** OpenAPI Overlay 1.0 files, relative to the client folder, applied in order before generate (committed, cache inputs) */
  overlays?: string[];
  /** code hooks on the classified files before split (both presets), see docs: trade-off flexibility vs. determinism */
  transforms?: TransformEntry[];
  /** prettier (workspace config) on every generated file, default false */
  format?: boolean;
  /**
   * testing lib: `msw` / `{ mocks }` (mocks engine, default settings.testing.mocks = none; `schema-faker` opt-in, `orval` deprecated)
   * or none (`false`: the client generator skips it, no generate-api-testing)
   */
  testing?: 'msw' | false | { mocks?: MockEngine };
}

export interface ClientEntry {
  /** adapter id (built-in or `adapters` key), default: `defaultAdapter` */
  adapter?: string;
  /** source for update-spec; generate-api-client always reads the committed spec file */
  url?: string;
  /** adapter options, merged over the adapter's defaults (+ the registration's `options`) */
  options?: Record<string, unknown>;
  layout?: Layout;
  pipeline?: PipelineConfig;
}

/** Consumer adapter: where its code lives + declarative metadata (the plugin never imports adapter code). */
export interface AdapterRegistrationJson {
  /** workspace path (`./tools/x.ts`), package specifier (`@acme/openapi-x`) or built-in (`builtin:command`) */
  module: string;
  /** npm packages whose version is a cache input */
  packages?: string[];
  /** further workspace files/globs as cache inputs (`{workspaceRoot}/…`) */
  inputs?: string[];
  /** runtime cache inputs, e.g. `java -version 2>&1` */
  runtime?: string[];
  /** adapter options for every client of this registration (between the module defaults and the entry's options) */
  options?: Record<string, unknown>;
}

export interface ClientsConfig {
  $schema?: string;
  defaultAdapter?: string;
  settings?: Partial<OpenApiSettings>;
  adapters?: Record<string, AdapterRegistrationJson>;
  /** key = client path below libsDir, e.g. `generated/pet-client`, `booking/generated/booking-client` */
  clients?: Record<string, ClientEntry>;
}

/** openapi-clients.json of a workspace (fs). Throws a config error with the file name. */
export function readClientsConfig(workspaceRoot: string): ClientsConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(workspaceRoot, CLIENTS_CONFIG_FILE), 'utf-8'));
  } catch (error) {
    throw new OpenApiError(`${CLIENTS_CONFIG_FILE}: not readable (${(error as Error).message})`, {
      phase: 'config',
      cause: error,
      hint: `create ${CLIENTS_CONFIG_FILE} in the workspace root: { "clients": {} }`,
    });
  }
  // a hand-edited file may have any shape: wrong sections become empty, never a crash downstream
  if (!isRecord(parsed)) throw new OpenApiError(`${CLIENTS_CONFIG_FILE}: must be an object`, { phase: 'config' });
  const config = parsed as ClientsConfig;
  return {
    ...config,
    settings: isRecord(config.settings) ? config.settings : undefined,
    adapters: isRecord(config.adapters) ? config.adapters : undefined,
    clients: isRecord(config.clients) ? config.clients : undefined,
  };
}

/** Location of a client path; throws (config) unless it is <clientFolder>/<name> or <domain>/<clientFolder>/<name>. */
export function clientLocationOf(clientPath: string, settings: OpenApiSettings): ClientLocation {
  const location = parseClientPath(clientPath, settings);
  if (!location) {
    throw new OpenApiError(
      `${CLIENTS_CONFIG_FILE} → "${clientPath}": not a client path (${settings.clientFolder}/<name> or <domain>/${settings.clientFolder}/<name>)`,
      { phase: 'config', client: clientPath },
    );
  }
  return location;
}

export const settingsOf = (config: ClientsConfig): OpenApiSettings => resolveSettings(config.settings);
export const layoutOf = (entry: ClientEntry | undefined): Layout => entry?.layout ?? 'default';
export const hasTesting = (entry: ClientEntry | undefined): boolean => entry?.pipeline?.testing !== false;

/** Mocks engine of a client's testing lib: its own (`pipeline.testing.mocks`), else the workspace default. */
export function mockEngineOf(settings: OpenApiSettings, entry: ClientEntry | undefined): MockEngine {
  const testing = entry?.pipeline?.testing;
  const engine = (typeof testing === 'object' ? testing.mocks : undefined) ?? settings.testing.mocks;
  if (!MOCK_ENGINES.includes(engine)) {
    throw new OpenApiError(`unknown mocks engine "${engine}" (${MOCK_ENGINES.join(' | ')})`, {
      phase: 'config',
      hint: 'openapi-clients.json → settings.testing.mocks / clients → <path> → pipeline.testing.mocks',
    });
  }
  return engine;
}

/** Code parts the adapter output is split into: types, api (+ core unless merged into api). */
export const codePartsOf = (entry: ClientEntry | undefined): Part[] =>
  layoutOf(entry) === 'merged-core' ? PARTS.filter((part) => part !== 'core') : [...PARTS];

/** Every lib of a client: code parts + testing (unless `pipeline.testing: false`). */
export const clientPartsOf = (entry: ClientEntry | undefined): ClientPart[] => [
  ...codePartsOf(entry),
  ...(hasTesting(entry) ? [TESTING_PART as ClientPart] : []),
];

/** Adapter id of an entry: its own, else the file's default, else openapi-tools. */
export const adapterIdOf = (config: ClientsConfig, clientPath: string): string =>
  config.clients?.[clientPath]?.adapter ?? config.defaultAdapter ?? DEFAULT_ADAPTER;

/** Transform hooks of an entry → [{ module, options }]; throws (config) for a malformed list or entry. */
export function transformsOf(entry: ClientEntry | null | undefined): { module: string; options: Record<string, unknown> }[] {
  const transforms: unknown = entry?.pipeline?.transforms ?? [];
  if (!Array.isArray(transforms)) throw new OpenApiError('pipeline.transforms: must be an array', { phase: 'config' });
  return transforms.map((item: unknown, index) => {
    if (typeof item === 'string') return { module: item, options: {} };
    if (!isRecord(item) || typeof item.module !== 'string') {
      throw new OpenApiError(`pipeline.transforms[${index}]: module missing`, { phase: 'config' });
    }
    return { module: item.module, options: isRecord(item.options) ? item.options : {} };
  });
}

/**
 * Workspace-relative overlay files of a client (cache inputs of both generate targets) — only with the feature
 * flag settings.features.overlays; disabled, they are no input (the target fails, see disabledFeaturesOf).
 */
export function overlayFiles(settings: OpenApiSettings, clientPath: string, overlays: readonly string[] = []): string[] {
  if (!settings.features.overlays) return [];
  return overlays.map((overlay) => {
    if (!isSafeRelativePath(overlay)) throw new OpenApiError(`pipeline.overlays: "${overlay}" must be relative to the client folder, without ..`, { phase: 'config' });
    return `${clientRoot(settings, clientPath)}/${overlay}`;
  });
}

export const OVERLAYS_DISABLED_HINT =
  'experimental feature flag "overlays" disabled: set openapi-clients.json → settings.features.overlays: true, or remove pipeline.overlays';

/** Features an entry uses although their flag is off (plugin metadata → verify, generate fails). */
export const disabledFeaturesOf = (settings: OpenApiSettings, entry: ClientEntry | undefined): string[] =>
  entry?.pipeline?.overlays?.length && !settings.features.overlays ? ['overlays'] : [];

/** The committed spec of a client folder: exactly one of settings.specFiles (workspace-relative). */
export function findSpecFile(exists: (path: string) => boolean, settings: OpenApiSettings, clientPath: string): string {
  const root = clientRoot(settings, clientPath);
  const found = settings.specFiles.filter((file) => exists(`${root}/${file}`));
  if (found.length !== 1) {
    throw new OpenApiError(
      `${root} needs exactly one spec file (${settings.specFiles.join(' | ')}), found ${found.length ? found.join(', ') : 'none'}`,
      { phase: 'config', client: clientPath, hint: 'new client: nx g @mo-transfer/tooling-openapi:client <name> --spec=<file|url>' },
    );
  }
  return `${root}/${found[0]}`;
}
