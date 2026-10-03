/**
 * Nx plugin (nx.json → plugins): infers the generate targets of every client from openapi-clients.json
 * (docs/openapi-pipeline-architektur.md). Client project.json files keep name + tags, testing libs their config.
 *
 *   createNodes          entry "generated/pet-client" → generate-api-client + update-spec at libs/generated/pet-client,
 *                        generate-api-testing at libs/generated/pet-client/testing (unless pipeline.testing: false);
 *                        project metadata `openapi` (adapter, layout, parts, problem) — verify reads it from the graph
 *   createDependencies   client → npm:<package> of consumer adapters/transforms (affected after a lockfile change)
 *
 * Options (all optional): { clientTargetName, testingTargetName, updateSpecTargetName } — defaults
 * generate-api-client / generate-api-testing / update-spec. The generator reads them, too (testing lib dependsOn).
 *
 * Only adds targets to existing projects (no project.json → no node: a project without a name would break the
 * graph). A broken entry (unknown adapter, missing module, no/two specs, bad path) or an unreadable file never
 * breaks the graph: a warning, the client gets no generate target, verify reports the problem.
 * Never imports adapter code; reads the files fresh on every call (the registry has no memo).
 */
import {
  type CreateDependencies,
  type CreateNodes,
  createNodesFromFiles,
  DependencyType,
  logger,
  type RawProjectGraphDependency,
} from '@nx/devkit';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { adapterIdOf, CLIENTS_CONFIG_FILE, type ClientsConfig, readClientsConfig, settingsOf, transformsOf } from '../config';
import {
  type ClientMetadata,
  createInferenceContext,
  type InferenceContext,
  inferClientTargets,
  updateSpecTarget,
  type TargetJson,
  type TargetNames,
} from '../project-config';
import { parseModuleRef } from '../registry/module-ref';
import { resolveAdapterRegistry } from '../registry/registry';
import { clientRoot } from '../settings';

export interface OpenApiPluginOptions {
  clientTargetName?: string;
  testingTargetName?: string;
  updateSpecTargetName?: string;
}

export const targetNamesOf = (options: OpenApiPluginOptions | undefined): Partial<TargetNames> => ({
  ...(options?.clientTargetName ? { client: options.clientTargetName } : {}),
  ...(options?.testingTargetName ? { testing: options.testingTargetName } : {}),
  ...(options?.updateSpecTargetName ? { updateSpec: options.updateSpecTargetName } : {}),
});

type ProjectNode = { targets: Record<string, TargetJson>; metadata?: { openapi: ClientMetadata } };

/** Projects (root → targets, metadata) of one openapi-clients.json. */
export function inferClientNodes(workspaceRoot: string, options?: OpenApiPluginOptions): { projects?: Record<string, ProjectNode> } {
  let context: InferenceContext;
  try {
    const config = readClientsConfig(workspaceRoot);
    context = createInferenceContext(workspaceRoot, config, (path) => existsSync(join(workspaceRoot, path)), targetNamesOf(options));
  } catch (error) {
    logger.warn(`${(error as Error).message} — no OpenAPI client targets`);
    return {};
  }
  const projects: Record<string, ProjectNode> = {};
  for (const clientPath of Object.keys(context.config.clients ?? {})) {
    const root = clientRoot(context.settings, clientPath);
    if (!context.exists(`${root}/project.json`)) continue;
    const { targets, metadata } = safeInfer(context, clientPath);
    if (metadata.problem) {
      logger.warn(`${CLIENTS_CONFIG_FILE} → "${clientPath}": ${metadata.problem} — no ${context.targetNames.client} target (verify reports it)`);
    }
    if (metadata.missingPackages) {
      logger.warn(`${CLIENTS_CONFIG_FILE} → "${clientPath}": not installed: ${metadata.missingPackages.join(', ')} — left out of the cache inputs (install them or drop them from the config)`);
    }
    if (metadata.disabledFeatures) {
      logger.warn(`${CLIENTS_CONFIG_FILE} → "${clientPath}": uses ${metadata.disabledFeatures.join(', ')} with the feature flag off — ${context.targetNames.client} will fail (settings.features)`);
    }
    for (const [projectRoot, projectTargets] of Object.entries(targets)) {
      projects[projectRoot] = projectRoot === root ? { targets: projectTargets, metadata: { openapi: metadata } } : { targets: projectTargets };
    }
  }
  return { projects };
}

/** inferClientTargets that never throws: an unexpected error becomes the client's problem (update-spec only). */
function safeInfer(context: InferenceContext, clientPath: string): ReturnType<typeof inferClientTargets> {
  try {
    return inferClientTargets(context, clientPath);
  } catch (error) {
    return {
      targets: { [clientRoot(context.settings, clientPath)]: { [context.targetNames.updateSpec]: updateSpecTarget(clientPath) } },
      metadata: { adapter: '', layout: 'default', testing: false, parts: [], problem: (error as Error).message },
    };
  }
}

/** Only the root file: the client paths in it are relative to the workspace root. */
export const createNodes: CreateNodes<OpenApiPluginOptions> = [
  CLIENTS_CONFIG_FILE,
  (configFiles, options, context) =>
    createNodesFromFiles(
      (_configFile, pluginOptions) => inferClientNodes(context.workspaceRoot, pluginOptions),
      configFiles,
      options,
      context,
    ),
];

/**
 * client project → npm:<package> of its consumer adapter (package module + `packages`) and transform packages:
 * a lockfile change of such a package reaches the client in `nx affected`. Only existing external nodes.
 */
export const createDependencies: CreateDependencies<OpenApiPluginOptions> = (_options, context) => {
  try {
    return clientDependencies(context);
  } catch (error) {
    // never break the graph: the edges are an affected optimisation, createNodes reports the problem
    logger.warn(`${CLIENTS_CONFIG_FILE}: no OpenAPI dependencies (${(error as Error).message})`);
    return [];
  }
};

function clientDependencies(context: Parameters<CreateDependencies<OpenApiPluginOptions>>[1]): RawProjectGraphDependency[] {
  const config: ClientsConfig = readClientsConfig(context.workspaceRoot);
  const settings = settingsOf(config);
  const registry = resolveAdapterRegistry(context.workspaceRoot, config);
  const dependencies: RawProjectGraphDependency[] = [];
  for (const [clientPath, entry] of Object.entries(config.clients ?? {})) {
    const root = clientRoot(settings, clientPath);
    const project = Object.entries(context.projects).find(([, config]) => config.root === root);
    if (!project) continue;
    const source = project[1].name ?? project[0];
    const adapter = registry.adapters[adapterIdOf(config, clientPath)];
    const packages = new Set<string>(adapter?.custom ? [...(adapter.module.packageName ? [adapter.module.packageName] : []), ...adapter.packages] : []);
    let transforms: { module: string }[] = [];
    try {
      transforms = transformsOf(entry);
    } catch {
      // malformed transforms: reported by createNodes (metadata problem)
    }
    for (const transform of transforms) {
      const ref = parseModuleRef(transform.module, context.workspaceRoot);
      if (ref.packageName) packages.add(ref.packageName);
    }
    for (const name of [...packages].sort()) {
      const target = `npm:${name}`;
      if (context.externalNodes?.[target]) dependencies.push({ source, target, type: DependencyType.implicit });
    }
  }
  return dependencies;
}
