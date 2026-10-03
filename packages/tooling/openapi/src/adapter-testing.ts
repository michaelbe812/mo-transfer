/**
 * Contract test for adapters (export `./adapter-testing`): runs an adapter through the real pipeline stages
 * (generate → classify → split → barrel) against a spec in a temp folder — no libs, no Nx — and throws a
 * descriptive error for every contract violation. Framework-agnostic:
 *
 *   import { runAdapterContract } from '@mo-transfer/tooling-openapi/adapter-testing';
 *   it('fulfils the adapter contract', async () => {
 *     const report = await runAdapterContract(adapter, { specFile: 'specs/things.yaml' });
 *     expect(report.parts.api.length).toBeGreaterThan(0);
 *   });
 *
 * Checks: apiVersion + id, options valid against optionsSchema, requirements met, at least one file, every
 * classified file is a .ts file of the output and in one category only, no root index.ts, no import of a
 * dropped/unknown file, declared entries exist, every barrel builds.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { AdapterContext, AdapterDefinition, ClientDefinition, ClientPart, Layout } from './adapter';
import { codePartsOf } from './config';
import { OpenApiError } from './errors';
import { buildBarrel } from './pipeline/barrel';
import { classifyFiles, readRawFiles } from './pipeline/client-preset';
import { runProcess } from './pipeline/run-process';
import { splitIntoParts } from './pipeline/split';
import { definitionProblem, unmetRequirements, validateOptions } from './registry/validate';

export interface AdapterContractInput {
  /** spec file (absolute or relative to `workspaceRoot`) */
  specFile: string;
  /** default: process.cwd() — generators resolve their packages from here */
  workspaceRoot?: string;
  /** client options (over the adapter defaults) */
  options?: Record<string, unknown>;
  layout?: Layout;
  /** keep the temp folder (debugging); default: removed */
  keepOutput?: boolean;
}

export interface AdapterContractReport {
  /** files per part (relative paths, sorted) */
  parts: Partial<Record<ClientPart, string[]>>;
  /** generated barrel per part */
  barrels: Partial<Record<ClientPart, string>>;
  /** the raw output folder (removed unless keepOutput) */
  outDir: string;
}

const fail = (adapter: string | undefined, message: string, cause?: unknown): never => {
  throw new OpenApiError(`adapter contract: ${message}`, { phase: 'classify', adapter, cause });
};

export async function runAdapterContract<TOptions>(adapter: AdapterDefinition<TOptions>, input: AdapterContractInput): Promise<AdapterContractReport> {
  const definition = adapter as unknown as AdapterDefinition;
  const problem = definitionProblem(definition, 'adapter', undefined, ['generate', 'classify']);
  if (problem) fail(undefined, problem);
  const workspaceRoot = resolve(input.workspaceRoot ?? process.cwd());
  const layout = input.layout ?? 'default';
  const options = { ...definition.defaults, ...input.options };
  const invalid = definition.optionsSchema ? validateOptions(definition.optionsSchema, options) : [];
  if (invalid.length) fail(definition.id, `invalid options: ${invalid.join('; ')}`);
  const unmet = unmetRequirements(definition.requires, workspaceRoot);
  if (unmet.length) fail(definition.id, unmet.join('; '));

  const specFile = isAbsolute(input.specFile) ? input.specFile : join(workspaceRoot, input.specFile);
  const outDir = mkdtempSync(join(tmpdir(), `openapi-contract-${definition.id}-`));
  const client: ClientDefinition = {
    name: 'contract-client',
    path: 'generated/contract-client',
    placement: 'shared',
    spec: { file: relative(workspaceRoot, specFile) },
    generator: { adapter: definition.id, options },
    layout,
    pipeline: {},
  };
  const context: AdapterContext = {
    specFile,
    outDir,
    options,
    workspaceRoot,
    client,
    verbose: false,
    log: () => undefined,
    run: (command, args, runOptions) => runProcess(workspaceRoot, command, args, runOptions),
  };
  try {
    await definition.generate(context);
    const raw = readRawFiles(outDir);
    if (!raw.size) fail(definition.id, 'generate wrote no .ts file into ctx.outDir');
    const classified = classifyFiles(raw, await definition.classify(context), layout);
    if (!classified.files.length) fail(definition.id, 'classify put no file into models/apis/core');
    const parts = codePartsOf({ layout });
    const aliases = Object.fromEntries(parts.map((part) => [part, `@contract/${part}`]));
    const split = splitIntoParts({ files: classified.files, knownFiles: [...raw.keys()], aliases });
    const contents = new Map(classified.files.map((file) => [file.path, file.content]));
    const report: AdapterContractReport = { parts: {}, barrels: {}, outDir };
    for (const part of parts) {
      const own = split.filter((file) => file.part === part).map((file) => file.path);
      const entries = classified.entries[part] ?? own;
      const unknown = entries.filter((entry) => !own.includes(entry));
      if (unknown.length) fail(definition.id, `entries.${part}: ${unknown.join(', ')} not in this part`);
      report.parts[part] = own;
      report.barrels[part] = buildBarrel(outDir, contents, entries);
    }
    return report;
  } catch (error) {
    throw error instanceof OpenApiError ? error : new OpenApiError(`adapter contract: ${(error as Error).message}`, { phase: 'classify', adapter: definition.id, cause: error });
  } finally {
    if (!input.keepOutput) rmSync(outDir, { recursive: true, force: true });
  }
}
