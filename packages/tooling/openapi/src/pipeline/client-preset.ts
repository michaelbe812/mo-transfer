/**
 * Preset `client` (target generate-api-client): the entry's adapter (registry) generates, its classification
 * splits into types / api / core (core merged into api with layout merged-core), one barrel per part.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AdapterContext, AdapterDefinition, Classification, ClientPart, Part, PipelineFile } from '../adapter';
import { listTsFiles } from '../adapters/files';
import { codePartsOf, type Layout } from '../config';
import { OpenApiError } from '../errors';
import { loadAdapter } from '../registry/load';
import type { ResolvedAdapter } from '../registry/registry';
import { unmetRequirements, validateOptions } from '../registry/validate';
import { runProcess } from './run-process';
import type { ClassifiedFiles, PipelineContext, PipelinePreset } from './runner';

/** raw output of a folder: every .ts file, relative posix path → content */
export function readRawFiles(dir: string): Map<string, string> {
  return new Map(listTsFiles(dir).map((file) => [file, readFileSync(join(dir, file), 'utf-8')]));
}

const CATEGORIES = [
  ['models', 'types'],
  ['apis', 'api'],
  ['core', 'core'],
] as const satisfies readonly (readonly [keyof Omit<Classification, 'entries'>, Part])[];

/** Classification → files with their part + barrel entries (merged-core: core files and entries go to api). */
export function classifyFiles(raw: ReadonlyMap<string, string>, classification: Classification, layout: Layout): ClassifiedFiles {
  const partOfCategory = (part: Part): Part => (layout === 'merged-core' && part === 'core' ? 'api' : part);
  const partOf = new Map<string, Part>();
  const filesOf: Record<Part, string[]> = { types: [], api: [], core: [] };
  for (const [category, part] of CATEGORIES) {
    for (const file of classification[category] ?? []) {
      if (partOf.has(file)) throw new Error(`${file}: classified in several categories`);
      if (file === 'index.ts') throw new Error(`${file}: root index.ts is reserved (the facade writes the barrel)`);
      if (!raw.has(file)) throw new Error(`${file}: classified, but no .ts file of the raw output`);
      partOf.set(file, partOfCategory(part));
      filesOf[part].push(file);
    }
  }
  const files: PipelineFile[] = [...partOf.keys()].sort().map((path) => ({
    path,
    part: partOf.get(path) as ClientPart,
    content: raw.get(path) as string,
  }));
  // order of the adapter's entries is kept (first wins on duplicate names, see barrel.ts); a merged part takes
  // every file of a category without declared entries
  const declared = classification.entries ?? {};
  const entries: Partial<Record<ClientPart, string[]>> = {};
  for (const part of codePartsOf({ layout })) {
    const categories = CATEGORIES.map(([, category]) => category).filter((category) => partOfCategory(category) === part);
    if (!categories.some((category) => declared[category])) continue;
    entries[part] = categories.flatMap((category) => declared[category] ?? [...filesOf[category]].sort());
  }
  return { files, entries };
}

/** Adapter context: options merged + run/log bound to the pipeline. */
function adapterContext(context: PipelineContext, options: Record<string, unknown>): AdapterContext {
  return {
    specFile: context.specFile,
    outDir: context.rawDir,
    options,
    workspaceRoot: context.workspaceRoot,
    client: context.client,
    verbose: context.verbose,
    log: context.log,
    run: (command, args, runOptions) => runProcess(context.workspaceRoot, command, args, { ...runOptions, verbose: context.verbose }),
  };
}

export function clientPreset(adapter: ResolvedAdapter, layout: Layout): PipelinePreset {
  let definition: AdapterDefinition | undefined;
  let adapterCtx: AdapterContext | undefined;
  return {
    id: 'client',
    adapter: adapter.id,
    source: `adapter ${adapter.id}`,
    parts: codePartsOf({ layout }),
    rawDirName: 'raw',
    barrel: true,
    async generate(context) {
      const { client, workspaceRoot } = context;
      definition = await loadAdapter(adapter, workspaceRoot, client.path);
      const options = { ...definition.defaults, ...adapter.options, ...client.generator.options };
      const errors = definition.optionsSchema ? validateOptions(definition.optionsSchema, options) : [];
      if (errors.length) {
        throw new OpenApiError(`invalid options\n  ${errors.join('\n  ')}`, {
          phase: 'options',
          hint: `openapi-clients.json → clients → ${client.path} → options (merged over the adapter defaults)`,
        });
      }
      const unmet = unmetRequirements(definition.requires, workspaceRoot);
      if (unmet.length) throw new OpenApiError(unmet.join('; '), { phase: 'requires' });
      adapterCtx = adapterContext(context, options);
      await definition.generate(adapterCtx);
      return readRawFiles(context.rawDir);
    },
    async classify(context, raw) {
      const classification = await (definition as AdapterDefinition).classify(adapterCtx as AdapterContext);
      return classifyFiles(raw, classification, context.client.layout);
    },
  };
}
