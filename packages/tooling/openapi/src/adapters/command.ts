/**
 * Adapter `command`: any generator as a process (NSwag, a script, a Docker call) — no JavaScript needed.
 * Placeholders in `command`, `args`, `env`: {specFile} {outDir} {workspaceRoot} {clientName} {clientPath}.
 * Classification by globs over the .ts files of the raw output (a file in two categories is an error).
 *
 *   "adapters": { "nswag": { "module": "builtin:command", "runtime": ["nswag version"],
 *                            "options": { "command": "nswag", "args": ["openapi2tsclient", "/input:{specFile}", "/output:{outDir}/client.ts"],
 *                                         "classify": { "apis": ["**\/*.ts"] } } } }
 *
 * The command runs in the workspace root with node_modules/.bin in PATH; output streamed with --verbose.
 */
import type { Part } from '../adapter';
import { type Classification, defineAdapter } from '../adapter';
import { matchesAny } from '../pipeline/glob';
import { fillTemplate } from '../settings';
import { listTsFiles } from './files';

export interface CommandAdapterOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** globs (relative to outDir) per category; files matching none are dropped */
  classify: { models?: string[]; apis?: string[]; core?: string[] };
  /** barrel entries per part (default: every file of the part) */
  entries?: Partial<Record<Part, string[]>>;
}

const stringList = { type: 'array', items: { type: 'string' } } as const;

const commandAdapter = defineAdapter<CommandAdapterOptions>({
  apiVersion: 1,
  id: 'command',
  defaults: { args: [], env: {} },
  optionsSchema: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      args: stringList,
      env: { type: 'object', additionalProperties: { type: 'string' } },
      classify: {
        type: 'object',
        properties: { models: stringList, apis: stringList, core: stringList },
        additionalProperties: false,
      },
      entries: {
        type: 'object',
        properties: { types: stringList, api: stringList, core: stringList },
        additionalProperties: false,
      },
    },
    required: ['command', 'classify'],
    additionalProperties: false,
  },
  generate({ specFile, outDir, options, workspaceRoot, client, run }) {
    const values = { specFile, outDir, workspaceRoot, clientName: client.name, clientPath: client.path };
    const fill = (text: string): string => fillTemplate(text, values);
    run(
      fill(options.command),
      (options.args ?? []).map(fill),
      { env: Object.fromEntries(Object.entries(options.env ?? {}).map(([key, value]) => [key, fill(value)])) },
    );
  },
  classify({ outDir, options }) {
    const files = listTsFiles(outDir);
    const pick = (globs: string[] | undefined): string[] => files.filter((file) => matchesAny(file, globs ?? []));
    const classification: Classification = {
      models: pick(options.classify.models),
      apis: pick(options.classify.apis),
      core: pick(options.classify.core),
    };
    if (options.entries) classification.entries = options.entries;
    return classification;
  },
});

export default commandAdapter;
