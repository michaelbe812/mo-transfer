/**
 * The generation pipeline: fixed stages, one runner for both presets (client = generate-api-client,
 * testing = generate-api-testing).
 *
 *   spec (overlays) → generate → classify → transform[] → split → barrel → finalize[] (format, header) → write
 *
 * Every stage gets a typed context and works on an in-memory file list, sorted by path; only `generate` (the
 * generator writes its raw output to tmp/) and `write` touch the disk. An error carries its stage (phase),
 * client and adapter (errors.ts). Deterministic: same spec + entry + tooling → byte-identical files.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import type { ClientDefinition, ClientPart, PipelineFile } from '../adapter';
import { OpenApiError, type OpenApiPhase } from '../errors';
import { generatedHeader, type OpenApiSettings, partAlias, partRoot } from '../settings';
import { buildBarrel } from './barrel';
import { prepareSpec } from './spec';
import { splitIntoParts } from './split';
import { applyTransforms } from './transform';

export interface PipelineContext {
  client: ClientDefinition;
  workspaceRoot: string;
  settings: OpenApiSettings;
  verbose: boolean;
  log(message: string): void;
  /** tmp/openapi/<client path> */
  tmpDir: string;
  /** the spec after the overlays (stage spec) */
  specFile: string;
  /** emptied before generate: the generator's raw output */
  rawDir: string;
}

export interface ClassifiedFiles {
  files: PipelineFile[];
  /** barrel entries per part; a part without = every file of the part */
  entries: Partial<Record<ClientPart, string[]>>;
}

/** What differs between client and testing generation; everything else is the runner's. */
export interface PipelinePreset {
  id: 'client' | 'testing';
  /** adapter id (client) for errors */
  adapter?: string;
  /** `{source}` of the header banner */
  source: string;
  /** libs the output is split into */
  parts: ClientPart[];
  /** folder name below tmpDir */
  rawDirName: string;
  /** barrel per part from its entries; false: the generator ships its own index.ts */
  barrel: boolean;
  /** stage generate: raw output, relative path → content (.ts files) */
  generate(context: PipelineContext): Promise<ReadonlyMap<string, string>>;
  /** stage classify: files with their part */
  classify(context: PipelineContext, raw: ReadonlyMap<string, string>): Promise<ClassifiedFiles>;
}

export interface PipelineInput {
  client: ClientDefinition;
  workspaceRoot: string;
  settings: OpenApiSettings;
  verbose?: boolean;
  log?: (message: string) => void;
}

const byPath = (a: { path: string }, b: { path: string }): number => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

/** Files per part written: files of the part (without the facade's barrel). */
export async function runPipeline(preset: PipelinePreset, input: PipelineInput): Promise<Partial<Record<ClientPart, number>>> {
  const { client, workspaceRoot, settings } = input;
  const verbose = input.verbose ?? false;
  const log = input.log ?? ((message: string) => verbose && console.log(message));
  const stage = async <T>(phase: OpenApiPhase, run: () => T | Promise<T>): Promise<T> => {
    try {
      if (verbose) log(`[openapi:${phase}] ${client.path}`);
      return await run();
    } catch (error) {
      throw OpenApiError.wrap(error, { phase, client: client.path, adapter: preset.adapter });
    }
  };
  const tmpDir = join(workspaceRoot, 'tmp/openapi', client.path);
  const rawDir = join(tmpDir, preset.rawDirName);

  // per preset: client and testing generation of one client may run in parallel
  const specFile = await stage('spec', () => prepareSpec(client, workspaceRoot, settings, join(tmpDir, preset.id)));
  const context: PipelineContext = { client, workspaceRoot, settings, verbose, log, tmpDir, specFile, rawDir };
  const raw = await stage('generate', () => {
    rmSync(rawDir, { recursive: true, force: true });
    mkdirSync(rawDir, { recursive: true });
    return preset.generate(context);
  });
  const classified = await stage('classify', () => preset.classify(context, raw));
  const transformed = await stage('transform', () =>
    applyTransforms({
      files: classified.files,
      transforms: client.pipeline.transforms ?? [],
      parts: preset.parts,
      context: { preset: preset.id, client, workspaceRoot, specFile, log },
    }),
  );
  const aliases = Object.fromEntries(preset.parts.map((part) => [part, partAlias(settings, client.path, part)]));
  const split = await stage('split', () => splitIntoParts({ files: transformed, knownFiles: [...raw.keys()], aliases }));
  const barrels = await stage('barrel', () => (preset.barrel ? buildBarrels(preset.parts, transformed, classified.entries, rawDir) : {}));
  const output = await stage('finalize', () => finalize(split, barrels, context, preset));
  return stage('write', () => writeParts(output, preset, context, split));
}

/** One barrel per part with files: its entries (declared, else every file) from the in-memory files. */
function buildBarrels(
  parts: readonly ClientPart[],
  files: readonly PipelineFile[],
  declared: Partial<Record<ClientPart, string[]>>,
  rawDir: string,
): Partial<Record<ClientPart, string>> {
  const contents = new Map(files.map((file) => [file.path, file.content]));
  const barrels: Partial<Record<ClientPart, string>> = {};
  for (const part of parts) {
    const own = files.filter((file) => file.part === part).map((file) => file.path).sort();
    const entries = declared[part] ?? own;
    const unknown = entries.filter((entry) => !own.includes(entry));
    if (unknown.length) throw new Error(`entries.${part}: ${unknown.join(', ')} not in this part`);
    barrels[part] = buildBarrel(rawDir, contents, entries);
  }
  return barrels;
}

/** Stage finalize: prettier (pipeline.format) then the header, on every file incl. the barrels. */
async function finalize(
  files: readonly PipelineFile[],
  barrels: Partial<Record<ClientPart, string>>,
  context: PipelineContext,
  preset: PipelinePreset,
): Promise<PipelineFile[]> {
  const header = generatedHeader(context.settings, preset.source, context.client.spec.file);
  const all: PipelineFile[] = [
    ...files,
    ...Object.entries(barrels).map(([part, barrel]) => ({ path: 'index.ts', part: part as ClientPart, content: `${barrel}\n` })),
  ];
  const format = context.client.pipeline.format ? await prettierFormatter() : undefined;
  const result: PipelineFile[] = [];
  for (const file of all) {
    const target = join(context.workspaceRoot, partRoot(context.settings, context.client.path, file.part), 'src', context.settings.outputDir, file.path);
    result.push({ ...file, content: header + (format ? await format(file.content, target) : file.content) });
  }
  return result.sort(byPath);
}

/** prettier with the workspace config of each target file (.prettierrc, .editorconfig). */
async function prettierFormatter(): Promise<(content: string, filepath: string) => Promise<string>> {
  const prettier = await import('prettier').catch((error: unknown) => {
    throw new OpenApiError('prettier not installed', { phase: 'finalize', cause: error, hint: 'pnpm add -D prettier, or pipeline.format: false' });
  });
  return async (content, filepath) => {
    const options = (await prettier.resolveConfig(filepath, { editorconfig: true })) ?? {};
    return prettier.format(content, { ...options, filepath });
  };
}

/** Stage write: per part lib, its src/<outputDir> replaced by the files (sorted). */
function writeParts(
  output: readonly PipelineFile[],
  preset: PipelinePreset,
  context: PipelineContext,
  split: readonly PipelineFile[],
): Partial<Record<ClientPart, number>> {
  const { settings, client, workspaceRoot } = context;
  const written: Partial<Record<ClientPart, number>> = {};
  for (const part of preset.parts) {
    const root = partRoot(settings, client.path, part);
    const files = output.filter((file) => file.part === part);
    const counted = preset.barrel ? split.filter((file) => file.part === part).length : files.length;
    if (!existsSync(join(workspaceRoot, root, 'src/index.ts'))) {
      if (!counted) continue;
      throw new OpenApiError(`${root}/src/index.ts missing, the pipeline delivers ${counted} files for it`, {
        phase: 'write',
        hint: `commit: echo "export * from './${settings.outputDir}';" > ${root}/src/index.ts`,
      });
    }
    const targetDir = join(workspaceRoot, root, 'src', settings.outputDir);
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });
    for (const { path, content } of files) {
      const target = resolve(targetDir, path);
      // last line of defence: never write outside <part>/src/<outputDir>
      if (!target.startsWith(`${targetDir}${sep}`)) throw new OpenApiError(`${path}: outside ${root}/src/${settings.outputDir}`, { phase: 'write' });
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    written[part] = counted;
  }
  return written;
}
