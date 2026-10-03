/**
 * Loads extensions through the one module loader (modules.ts) and checks their SPI shape: adapters (registry),
 * transform hooks (pipeline.transforms), lib scaffolds (settings.scaffold).
 */
import type { AdapterDefinition, LibScaffold, TransformDefinition } from '../adapter';
import { BUILTIN_ADAPTER_MODULES } from '../adapters/index';
import { OpenApiError } from '../errors';
import { loadModule, pickDefinition } from './loader';
import { type ModuleRef, moduleProblem, parseModuleRef } from './module-ref';
import type { ResolvedAdapter } from './registry';
import { definitionProblem } from './validate';

async function loadDefinition(ref: ModuleRef, workspaceRoot: string, what: string, phaseDetails: { client?: string; adapter?: string }) {
  const problem = moduleProblem(ref, workspaceRoot, what);
  if (problem) throw new OpenApiError(problem, { phase: 'load', ...phaseDetails });
  try {
    return pickDefinition(await loadModule(ref, workspaceRoot));
  } catch (error) {
    throw new OpenApiError(`${what}: ${ref.specifier} could not be loaded`, {
      phase: 'load',
      ...phaseDetails,
      cause: error,
      hint: 'workspace modules: .ts (transpiled, no type check), .js/.cjs (CommonJS) or .mjs (ESM); packages: exports with a node/require/import/default condition',
    });
  }
}

/** The adapter of a registry entry, its SPI shape checked (apiVersion, id = registered id, generate/classify). */
export async function loadAdapter(adapter: ResolvedAdapter, workspaceRoot: string, client?: string): Promise<AdapterDefinition> {
  const details = { client, adapter: adapter.id };
  const builtinId = adapter.module.builtinId;
  const definition =
    adapter.module.kind === 'builtin'
      ? BUILTIN_ADAPTER_MODULES[builtinId as string]
      : await loadDefinition(adapter.module, workspaceRoot, `adapter ${adapter.id}`, details);
  if (!definition) throw new OpenApiError(`unknown built-in adapter "${builtinId}"`, { phase: 'load', ...details });
  // an alias of a built-in (adapters.nswag → builtin:command) keeps the built-in's id
  const expectedId = adapter.module.kind === 'builtin' ? builtinId : adapter.id;
  const problem = definitionProblem(definition, `adapter ${adapter.id}`, expectedId, ['generate', 'classify']);
  if (problem) throw new OpenApiError(problem, { phase: 'load', ...details, hint: 'export default defineAdapter({ apiVersion: 1, id, generate, classify })' });
  return definition as AdapterDefinition;
}

export async function loadTransform(specifier: string, workspaceRoot: string, client?: string): Promise<TransformDefinition> {
  const definition = await loadDefinition(parseModuleRef(specifier, workspaceRoot), workspaceRoot, `transform ${specifier}`, { client });
  const problem = definitionProblem(definition, `transform ${specifier}`, undefined, ['transform']);
  if (problem) {
    throw new OpenApiError(problem, { phase: 'load', client, hint: 'export default defineTransform({ apiVersion: 1, id, transform })' });
  }
  return definition as TransformDefinition;
}

export async function loadScaffold(specifier: string, workspaceRoot: string): Promise<LibScaffold> {
  const definition = await loadDefinition(parseModuleRef(specifier, workspaceRoot), workspaceRoot, `scaffold ${specifier}`, {});
  const problem = definitionProblem(definition, `scaffold ${specifier}`, undefined, ['writeLib']);
  if (problem) throw new OpenApiError(problem, { phase: 'scaffold', hint: 'export default defineScaffold({ apiVersion: 1, id, writeLib })' });
  return definition as LibScaffold;
}
