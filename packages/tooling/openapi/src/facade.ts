/**
 * OpenAPI facade: what the executors call (docs/openapi-pipeline-architektur.md).
 *
 *   resolveClient     entry (openapi-clients.json) + client folder → ClientDefinition
 *   generateClient    pipeline, preset client  (generate-api-client):  the adapter's code → types / api / core
 *   generateTesting   pipeline, preset testing (generate-api-testing): spec → msw testing lib
 *   updateSpec        url → normalized committed spec (update-spec)
 *
 * The facade owns placement, split, import rewriting, barrels and the header; an adapter only raw output +
 * classification (SPI: src/adapter.ts).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ClientDefinition, ClientPart } from './adapter';
import {
  adapterIdOf,
  type ClientsConfig,
  CLIENTS_CONFIG_FILE,
  findSpecFile,
  hasTesting,
  layoutOf,
  mockEngineOf,
  readClientsConfig,
  settingsOf,
} from './config';
import { OpenApiError } from './errors';
import { clientPreset } from './pipeline/client-preset';
import { type PipelineInput, runPipeline } from './pipeline/runner';
import { testingPreset } from './pipeline/testing-preset';
import { resolveAdapter, resolveAdapterRegistry } from './registry/registry';
import { parseClientPath } from './settings';

/**
 * ClientDefinition of `clientPath` from openapi-clients.json + the client folder — read at run time by the
 * executors (their options are only `{ client }`, so the entry never enters the project config).
 */
export function resolveClient(workspaceRoot: string, clientPath: string, config: ClientsConfig = readClientsConfig(workspaceRoot)): ClientDefinition {
  const entry = config.clients?.[clientPath];
  if (!entry) throw new OpenApiError(`${CLIENTS_CONFIG_FILE} has no entry "${clientPath}"`, { phase: 'config', client: clientPath });
  const settings = settingsOf(config);
  const location = parseClientPath(clientPath, settings);
  if (!location) {
    throw new OpenApiError(`"${clientPath}" is no client path (${settings.clientFolder}/<name> or <domain>/${settings.clientFolder}/<name>)`, {
      phase: 'config',
      client: clientPath,
    });
  }
  const specFile = findSpecFile((path) => existsSync(join(workspaceRoot, path)), settings, clientPath);
  return {
    name: location.name,
    path: clientPath,
    placement: location.placement,
    spec: { file: specFile, ...(entry.url ? { url: entry.url } : {}) },
    generator: { adapter: adapterIdOf(config, clientPath), options: entry.options ?? {} },
    layout: layoutOf(entry),
    pipeline: entry.pipeline ?? {},
  };
}

export interface GenerateOptions {
  verbose?: boolean;
  log?: (message: string) => void;
}

/** Client code (types / api / core): files per part. */
export async function generateClient(
  client: ClientDefinition,
  workspaceRoot: string,
  options: GenerateOptions = {},
  config: ClientsConfig = readClientsConfig(workspaceRoot),
): Promise<Partial<Record<ClientPart, number>>> {
  const adapter = resolveAdapter(resolveAdapterRegistry(workspaceRoot, config), client.generator.adapter, client.path);
  return runPipeline(clientPreset(adapter, client.layout), pipelineInput(client, workspaceRoot, config, options));
}

/** Testing lib (msw): file count + the spec's base URL. */
export async function generateTesting(
  client: ClientDefinition,
  workspaceRoot: string,
  options: GenerateOptions = {},
  config: ClientsConfig = readClientsConfig(workspaceRoot),
): Promise<{ files: number; baseUrl: string }> {
  if (!hasTesting({ pipeline: client.pipeline })) {
    throw new OpenApiError('pipeline.testing is false: no testing lib', { phase: 'config', client: client.path });
  }
  const preset = testingPreset(mockEngineOf(settingsOf(config), { pipeline: client.pipeline }));
  const written = await runPipeline(preset, pipelineInput(client, workspaceRoot, config, options));
  return { files: written.testing ?? 0, baseUrl: preset.baseUrl ?? '' };
}

const pipelineInput = (client: ClientDefinition, workspaceRoot: string, config: ClientsConfig, options: GenerateOptions): PipelineInput => ({
  client,
  workspaceRoot,
  settings: settingsOf(config),
  verbose: options.verbose,
  log: options.log,
});

/**
 * Normalized spec text: YAML (with a source comment) or JSON, chosen by the file extension, then
 * Prettier with the workspace config — the same result the generators' formatFiles produce, so
 * `update-spec` right after `nx g …:client` reports "unchanged".
 */
export async function serializeSpec(
  document: unknown,
  file: string,
  url: string,
  projectName: string,
  workspaceRoot: string,
): Promise<string> {
  const text = file.endsWith('.json')
    ? `${JSON.stringify(document, null, 2)}\n`
    : [
        `# Source: ${url}`,
        `# Update: nx run ${projectName}:update-spec (overwrites this file, normalized). Committed, the only source for generate-api-client.`,
        stringifyYaml(document, { lineWidth: 0, aliasDuplicateObjects: false }),
      ].join('\n');
  const prettier = await import('prettier').catch(() => undefined);
  if (!prettier) return text;
  const filepath = join(workspaceRoot, file);
  const options = (await prettier.resolveConfig(filepath, { editorconfig: true })) ?? {};
  return prettier.format(text, { ...options, filepath });
}

/**
 * Downloads the spec from spec.url (JSON or YAML) and writes it normalized to spec.file.
 * The file stays the only source for generation (cache input); nothing is generated from the URL.
 */
export async function updateSpec(
  client: ClientDefinition,
  workspaceRoot: string,
  projectName: string,
): Promise<{ changed: boolean }> {
  if (!client.spec.url) {
    throw new OpenApiError(`no url`, { phase: 'update-spec', client: client.path, hint: `${CLIENTS_CONFIG_FILE} → clients → ${client.path} → url` });
  }
  const response = await fetch(client.spec.url);
  if (!response.ok) throw new OpenApiError(`GET ${client.spec.url}: ${response.status}`, { phase: 'update-spec', client: client.path });
  const document: unknown = parseYaml(await response.text());
  const normalized = await serializeSpec(document, client.spec.file, client.spec.url, projectName, workspaceRoot);
  const file = join(workspaceRoot, client.spec.file);
  const before = existsSync(file) ? readFileSync(file, 'utf-8') : undefined;
  if (before !== normalized) writeFileSync(file, normalized);
  return { changed: before !== normalized };
}
