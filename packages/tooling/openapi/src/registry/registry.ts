/**
 * THE adapter registry: built-in adapters + openapi-clients.json → `adapters` (a consumer id replaces a built-in
 * one). Synchronous, declarative, never imports adapter code — used by the plugin (cache inputs, graph metadata
 * verify reads), the client generator (known id), the facade (what to load) and the contract test helper.
 * Re-read on every call (no memo): createNodes always sees the current file.
 */
import { type ClientsConfig, adapterIdOf } from '../config';
import { OpenApiError } from '../errors';
import { type ModuleRef, moduleCacheInputs, moduleProblem, parseModuleRef } from './module-ref';

export interface AdapterMetadata {
  /** npm packages whose version is a cache input (= adapter version) */
  packages: string[];
  /** further workspace files as input, e.g. openapitools.json (jar version) */
  inputs: string[];
  /** runtime inputs, e.g. `java -version 2>&1` */
  runtime: string[];
}

/** Built-in adapters (module: src/adapters/index.ts) and the cache inputs their output depends on. */
export const BUILTIN_ADAPTERS: Record<string, AdapterMetadata> = {
  'openapi-tools': {
    packages: ['@openapitools/openapi-generator-cli'],
    inputs: ['{workspaceRoot}/openapitools.json'],
    runtime: ['java -version 2>&1'],
  },
  'hey-api': { packages: ['@hey-api/openapi-ts'], inputs: [], runtime: [] },
  'nx-plugin-openapi': {
    packages: [
      '@nx-plugin-openapi/core',
      '@nx-plugin-openapi/plugin-openapi',
      '@nx-plugin-openapi/plugin-hey-api',
      '@openapitools/openapi-generator-cli',
      '@hey-api/openapi-ts',
    ],
    inputs: ['{workspaceRoot}/openapitools.json'],
    runtime: ['java -version 2>&1'],
  },
  // the tool it runs is the consumer's: its version via the registration's `runtime` (e.g. `nswag version`)
  command: { packages: [], inputs: [], runtime: [] },
};

export interface ResolvedAdapter extends AdapterMetadata {
  id: string;
  module: ModuleRef;
  /** registration options (between the module defaults and the entry's options) */
  options: Record<string, unknown>;
  /** registered in openapi-clients.json (`adapters`), not a plain built-in */
  custom: boolean;
}

export interface AdapterRegistry {
  adapters: Record<string, ResolvedAdapter>;
  /** id → why it is unusable (module missing, unknown built-in): the plugin warns, verify reports */
  problems: Record<string, string>;
}

const builtin = (id: string, module = `builtin:${id}`): ModuleRef => ({ specifier: module, kind: 'builtin', builtinId: id });

export function resolveAdapterRegistry(workspaceRoot: string, config: ClientsConfig): AdapterRegistry {
  const adapters: Record<string, ResolvedAdapter> = {};
  const problems: Record<string, string> = {};
  for (const [id, metadata] of Object.entries(BUILTIN_ADAPTERS)) {
    adapters[id] = { id, module: builtin(id), ...metadata, options: {}, custom: false };
  }
  for (const [id, registration] of Object.entries(config.adapters ?? {})) {
    if (id.startsWith('$')) continue;
    const module = parseModuleRef(registration.module, workspaceRoot);
    const base = module.kind === 'builtin' ? BUILTIN_ADAPTERS[module.builtinId as string] : undefined;
    const problem =
      module.kind === 'builtin'
        ? base
          ? undefined
          : `adapters.${id}: unknown built-in "${registration.module}" (known: ${Object.keys(BUILTIN_ADAPTERS).map((key) => `builtin:${key}`).join(', ')})`
        : moduleProblem(module, workspaceRoot, `adapters.${id}`);
    if (problem) problems[id] = problem;
    adapters[id] = {
      id,
      module,
      packages: [...(base?.packages ?? []), ...(registration.packages ?? [])],
      inputs: [...(base?.inputs ?? []), ...(registration.inputs ?? [])],
      runtime: [...(base?.runtime ?? []), ...(registration.runtime ?? [])],
      options: registration.options ?? {},
      custom: true,
    };
  }
  return { adapters, problems };
}

/** The adapter of an id; throws (phase registry) for an unknown or unusable one. */
export function resolveAdapter(registry: AdapterRegistry, id: string, client?: string): ResolvedAdapter {
  const adapter = registry.adapters[id];
  if (!adapter) {
    throw new OpenApiError(`unknown adapter "${id}" (known: ${Object.keys(registry.adapters).join(', ')})`, {
      phase: 'registry',
      client,
      adapter: id,
      hint: 'register it in openapi-clients.json → adapters: { "<id>": { "module": "./tools/<id>.ts" } }',
    });
  }
  if (registry.problems[id]) {
    throw new OpenApiError(registry.problems[id], { phase: 'registry', client, adapter: id });
  }
  return adapter;
}

/** Adapter of a client entry (its own, the default, openapi-tools), resolved. */
export function resolveClientAdapter(workspaceRoot: string, config: ClientsConfig, clientPath: string): ResolvedAdapter {
  return resolveAdapter(resolveAdapterRegistry(workspaceRoot, config), adapterIdOf(config, clientPath), clientPath);
}

/** Cache inputs of an adapter: its metadata + its module (folder or package). */
export function adapterCacheInputs(adapter: ResolvedAdapter): { files: string[]; packages: string[]; runtime: string[] } {
  const module = moduleCacheInputs(adapter.module);
  return {
    files: [...module.files, ...adapter.inputs],
    packages: [...new Set([...module.packages, ...adapter.packages])],
    runtime: adapter.runtime,
  };
}
