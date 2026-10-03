/**
 * Nx plugin (createNodesV2, nx.json → plugins): infers `generate-api-client` + `update-spec` of every client project from
 * openapi-clients.json (docs/nx-umsetzung.md → "OpenAPI-Clients"). The client project.json keeps name + tags.
 *
 *   openapi-clients.json   entry "generated/pet-client" → targets of the project at libs/generated/pet-client
 *                          (clientTargets in project-config.ts: spec, json-field input, adapter inputs)
 *
 * Only adds targets to existing projects (no project.json → no node: a project without a name would break the
 * graph). A broken entry (unknown adapter, no/two specs, bad path) or an unreadable file never breaks the graph:
 * a warning, the entry gets no `generate-api-client`, `tooling-verify:verify` reports it.
 * Hashing is unchanged against an explicit project.json: Nx hashes the merged ProjectConfiguration, and the
 * options hold only `client` — the entry itself stays a json input of `generate-api-client`.
 */
import { type CreateNodesV2, createNodesFromFiles, logger } from '@nx/devkit';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CLIENTS_CONFIG_FILE, LIBS_DIR } from '@mo-transfer/tooling-conventions';
import { type ClientsConfig, clientTargets, type TargetJson, updateSpecTarget } from '../project-config';

type ClientNodes = { projects?: Record<string, { targets: Record<string, TargetJson> }> };

/** Targets per client root (libs/<client path>) for one openapi-clients.json. */
export function inferClientNodes(workspaceRoot: string, configFile: string): ClientNodes {
  const exists = (path: string): boolean => existsSync(join(workspaceRoot, path));
  let config: ClientsConfig;
  try {
    config = JSON.parse(readFileSync(join(workspaceRoot, configFile), 'utf-8'));
  } catch (error) {
    logger.warn(`${configFile}: not readable, no OpenAPI client targets (${(error as Error).message})`);
    return {};
  }
  const projects: Record<string, { targets: Record<string, TargetJson> }> = {};
  for (const clientPath of Object.keys(config.clients ?? {})) {
    const root = `${LIBS_DIR}/${clientPath}`;
    if (!exists(`${root}/project.json`)) continue;
    try {
      projects[root] = { targets: clientTargets(exists, clientPath, config) };
    } catch (error) {
      logger.warn(`${(error as Error).message} — no generate-api-client target (tooling-verify:verify reports it)`);
      projects[root] = { targets: { 'update-spec': updateSpecTarget(clientPath) } };
    }
  }
  return { projects };
}

/** Only the root file: the client paths in it are relative to the workspace root. */
export const createNodesV2: CreateNodesV2 = [
  CLIENTS_CONFIG_FILE,
  (configFiles, options, context) =>
    createNodesFromFiles(
      (configFile) => inferClientNodes(context.workspaceRoot, configFile),
      configFiles,
      options,
      context,
    ),
];
