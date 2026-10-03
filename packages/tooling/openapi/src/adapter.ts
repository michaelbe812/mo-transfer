/**
 * Extension SPI v1 of @mo-transfer/tooling-openapi (export `./adapter`): code generator adapters, transform hooks,
 * lib scaffolds. Types + identity helpers only — importing it loads no generator.
 *
 *   export default defineAdapter({ apiVersion: 1, id: 'orval', defaults, optionsSchema, requires, generate, classify });
 *
 * The facade decides WHERE the code lives and HOW it is split into libs (types / api / core); an adapter only
 * delivers raw output (separate .ts files) + a classification. It knows neither Nx nor libs nor aliases.
 * Register a consumer adapter in openapi-clients.json → `adapters` (README: "Eigener Adapter").
 */
import type { Tree } from '@nx/devkit';
import type { Layout, PipelineConfig } from './config';
import type { ClientPart, Part, Placement } from './settings';

export type { ClientPart, Part, Placement } from './settings';
export type { Layout, PipelineConfig } from './config';
export { listTsFiles } from './adapters/files';

/** The SPI version this package implements; adapters, transforms and scaffolds declare it. */
export const ADAPTER_API_VERSION = 1;

/**
 * One client, built by the facade (resolveClient) from its entry in openapi-clients.json + the client folder at
 * run time — the targets only carry the `client` path (the entry is a json input).
 */
export interface ClientDefinition {
  /** folder name, e.g. 'pet-client' */
  name: string;
  /** client path below libsDir, e.g. 'generated/pet-client' */
  path: string;
  /** 'shared' → <libsDir>/<clientFolder>/<name>, { domain } → <libsDir>/<domain>/<clientFolder>/<name> */
  placement: Placement;
  /**
   * `file` (workspace-relative, committed) is the only source of generation and a cache input. `url` only for
   * `update-spec`: downloads, normalizes, overwrites `file`. Never generated straight from the URL.
   */
  spec: { file: string; url?: string };
  generator: { adapter: string; options: Record<string, unknown> };
  layout: Layout;
  pipeline: PipelineConfig;
}

/** Context of generate AND classify (classify may need the options, e.g. multi-backend adapters). */
export interface AdapterContext<TOptions = Record<string, unknown>> {
  /** absolute; the spec after the overlays (spec stage) */
  specFile: string;
  /** absolute: tmp/openapi/<client path>/raw, emptied before generate */
  outDir: string;
  /** module defaults < registration options < the entry's options, validated against optionsSchema */
  options: TOptions;
  workspaceRoot: string;
  client: ClientDefinition;
  /** `nx run … --verbose`: stream generator output */
  verbose: boolean;
  /** progress line (printed with --verbose) */
  log(message: string): void;
  /**
   * Runs a process in the workspace root (node_modules/.bin in PATH): output streamed with --verbose, else
   * captured and attached to the error on failure.
   */
  run(command: string, args: string[], options?: { cwd?: string; env?: Record<string, string> }): void;
}

/**
 * Files relative to outDir, posix. Files not listed are dropped (README, .openapi-generator/, root index.ts …).
 * models → lib `types` (type:types), apis → lib `api` (type:data-access), core → lib `core` (type:data-access,
 * contains HTTP; merged into `api` with layout merged-core).
 */
export interface Classification {
  models: string[];
  apis: string[];
  core: string[];
  /**
   * Public API per category: files `src/generated/index.ts` re-exports with `export *`.
   * Default: every file of the category. Needed when generator barrels (models.ts) would export twice.
   */
  entries?: Partial<Record<Part, string[]>>;
}

/** Subset of JSON Schema the options are validated against (before generate). */
export interface OptionsSchema {
  type?: OptionsSchemaType | OptionsSchemaType[];
  description?: string;
  properties?: Record<string, OptionsSchema>;
  required?: string[];
  additionalProperties?: boolean | OptionsSchema;
  items?: OptionsSchema;
  enum?: unknown[];
  anyOf?: OptionsSchema[];
}
export type OptionsSchemaType = 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean' | 'null';

/** Checked before generate: missing packages / an old Node end in an error with a hint instead of a stack. */
export interface AdapterRequirements {
  /** npm packages resolvable from the workspace root */
  packages?: string[];
  /** minimum Node version, e.g. '>=22.10' */
  node?: string;
}

export interface AdapterDefinition<TOptions = Record<string, unknown>> {
  apiVersion: 1;
  /** must equal the id it is registered under (openapi-clients.json → adapters) */
  id: string;
  defaults?: Partial<TOptions>;
  optionsSchema?: OptionsSchema;
  requires?: AdapterRequirements;
  /** raw output into ctx.outDir — separate .ts files (a single file is not split, see README limitations) */
  generate(ctx: AdapterContext<TOptions>): void | Promise<void>;
  classify(ctx: AdapterContext<TOptions>): Classification | Promise<Classification>;
}

/** Identity with types: `export default defineAdapter({ … })`. */
export function defineAdapter<TOptions = Record<string, unknown>>(
  definition: AdapterDefinition<TOptions>,
): AdapterDefinition<TOptions> {
  return definition;
}

/** A generated file in the pipeline (path relative to the part's src/generated, posix). */
export interface PipelineFile {
  path: string;
  part: ClientPart;
  content: string;
}

export interface TransformContext<TOptions = Record<string, unknown>> {
  /** `client` (generate-api-client) or `testing` (generate-api-testing) */
  preset: 'client' | 'testing';
  client: ClientDefinition;
  workspaceRoot: string;
  specFile: string;
  options: TOptions;
  log(message: string): void;
}

/**
 * Transform hook (openapi-clients.json → clients → <path> → pipeline.transforms): runs after classify, before
 * split. Returns the new file list (or nothing after changing `content` in place). Must be deterministic.
 */
export interface TransformDefinition<TOptions = Record<string, unknown>> {
  apiVersion: 1;
  id: string;
  optionsSchema?: OptionsSchema;
  transform(
    files: PipelineFile[],
    ctx: TransformContext<TOptions>,
  ): PipelineFile[] | void | Promise<PipelineFile[] | void>;
}

export function defineTransform<TOptions = Record<string, unknown>>(
  definition: TransformDefinition<TOptions>,
): TransformDefinition<TOptions> {
  return definition;
}

/** A part lib the client generator asks the scaffold to write. */
export interface ScaffoldLib {
  /** lib path below libsDir, e.g. `booking/generated/booking-client/api` */
  libPath: string;
  clientPath: string;
  part: ClientPart;
  /** default tags (scope, layer, generated): the built-in scaffold writes them, a workspace scaffold may derive its own */
  tags: string[];
  /** part → client (→ parts below): the generated code is gitignored, Nx sees no import edges */
  implicitDependencies: string[];
  /** extra targets (the testing lib: lint/typecheck wait for its generate target) */
  targets: Record<string, Record<string, unknown>>;
  /** false for the testing lib (never built, never shipped) */
  buildable: boolean;
}

/**
 * Lib scaffold (openapi-clients.json → settings.scaffold): writes the config files of a part lib + its import
 * path. The client generator writes spec, `src/index.ts`, client project.json and the entry itself.
 */
export interface LibScaffold {
  apiVersion: 1;
  id: string;
  /** throws if the domain cannot own a client (default: libsDir/<domain> must exist) */
  validateDomain?(tree: Tree, domain: string): void;
  writeLib(tree: Tree, lib: ScaffoldLib): void;
}

export function defineScaffold(definition: LibScaffold): LibScaffold {
  return definition;
}
