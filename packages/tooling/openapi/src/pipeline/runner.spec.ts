/**
 * The pipeline end to end with a consumer adapter written in TypeScript (workspace module, loaded through the own
 * require hook) — no generator package: overlays, classify, transforms, split, barrels, format, header, write,
 * merged-core, errors per stage. Real generators: test/integration.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientsConfig } from '../config';
import { formatError, OpenApiError } from '../errors';
import { generateClient, generateTesting, resolveClient } from '../facade';

let root: string;
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const read = (path: string): string => readFileSync(join(root, path), 'utf-8');
const config = (value: ClientsConfig): void => write('openapi-clients.json', JSON.stringify(value));
const parts = (clientPath: string, names: string[]) => names.forEach((part) => write(`libs/${clientPath}/${part}/src/index.ts`, "export * from './generated';\n"));

/** A consumer adapter in TypeScript: writes files from the spec title, options steer the output. */
const ADAPTER = `
import type { AdapterDefinition } from '@mo-transfer/tooling-openapi/adapter';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleOf } from './helper';

interface Options { suffix: string; extra?: boolean }

const adapter: AdapterDefinition<Options> = {
  apiVersion: 1,
  id: 'fake',
  defaults: { suffix: 'Service' },
  optionsSchema: { type: 'object', properties: { suffix: { type: 'string' }, extra: { type: 'boolean' } }, additionalProperties: false },
  generate({ specFile, outDir, options, log }) {
    const title = titleOf(readFileSync(specFile, 'utf-8'));
    log('fake generates ' + title);
    mkdirSync(join(outDir, 'model'), { recursive: true });
    mkdirSync(join(outDir, 'api'), { recursive: true });
    writeFileSync(join(outDir, 'model/thing.ts'), 'export interface Thing { title: "' + title + '" }\\n');
    writeFileSync(join(outDir, 'api/things.ts'), "import type { Thing } from '../model/thing';\\nimport { BASE } from '../base';\\nexport class Things" + options.suffix + " { base = BASE; get(): Thing | undefined { return undefined; } }\\n");
    writeFileSync(join(outDir, 'base.ts'), "export const BASE = '/api';\\n");
    writeFileSync(join(outDir, 'README.md'), 'dropped');
    if (options.extra) writeFileSync(join(outDir, 'extra.ts'), 'export const extra = 1;\\n');
  },
  classify() {
    return { models: ['model/thing.ts'], apis: ['api/things.ts'], core: ['base.ts'] };
  },
};
export default adapter;
`;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openapi-runner-'));
  write('tools/fake/adapter.ts', ADAPTER);
  write('tools/fake/helper.ts', "export const titleOf = (spec: string): string => /title: (\\w+)/.exec(spec)?.[1] ?? 'none';\n");
  write('libs/generated/x-client/openapi.yaml', 'openapi: 3.0.3\ninfo:\n  title: Original\n  version: "1"\npaths: {}\n');
  write('libs/generated/x-client/overlays/title.yaml', 'overlay: 1.0.0\nactions:\n  - target: $.info\n    update: { title: Overlaid }\n');
  write(
    'tools/hooks/prefix.ts',
    "export default { apiVersion: 1, id: 'prefix', optionsSchema: { type: 'object', properties: { text: { type: 'string' } } }, transform(files: { path: string; content: string; part: string }[], ctx: { options: { text?: string }; preset: string }) { return files.map((f) => ({ ...f, content: '// ' + (ctx.options.text ?? ctx.preset) + '\\n' + f.content })); } };\n",
  );
  write('tools/hooks/mutate.ts', "export default { apiVersion: 1, id: 'mutate', transform(files: { content: string }[]) { files.forEach((f) => { f.content += '// mutated\\n'; }); } };\n");
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('pipeline (preset client) with a TypeScript workspace adapter', () => {
  it('overlay → generate → classify → transforms → split → barrel → header → write; registration options; idempotent', async () => {
    parts('generated/x-client', ['types', 'api', 'core']);
    config({
      settings: { features: { overlays: true } },
      adapters: { fake: { module: './tools/fake/adapter.ts', options: { suffix: 'Api' } } },
      clients: {
        'generated/x-client': {
          adapter: 'fake',
          pipeline: { overlays: ['overlays/title.yaml'], transforms: [{ module: './tools/hooks/prefix.ts', options: { text: 'hook' } }, './tools/hooks/mutate.ts'] },
        },
      },
    });
    const log = vi.fn();
    const client = resolveClient(root, 'generated/x-client');
    expect(await generateClient(client, root, { verbose: true, log })).toEqual({ types: 1, api: 1, core: 1 });
    const header = (spec = 'libs/generated/x-client/openapi.yaml') =>
      `/* eslint-disable */\n/* eslint-enable @nx/enforce-module-boundaries, no-restricted-imports */\n// Generated by @mo-transfer/tooling (openapi, adapter fake) from ${spec}. Do not edit, do not commit.\n`;
    expect(read('libs/generated/x-client/types/src/generated/model/thing.ts')).toBe(
      `${header()}// hook\nexport interface Thing { title: "Overlaid" }\n// mutated\n`,
    );
    expect(read('libs/generated/x-client/api/src/generated/api/things.ts')).toBe(
      `${header()}// hook\nimport type { Thing } from '@mo-transfer/generated/x-client/types';\nimport { BASE } from '@mo-transfer/generated/x-client/core';\nexport class ThingsApi { base = BASE; get(): Thing | undefined { return undefined; } }\n// mutated\n`,
    );
    expect(read('libs/generated/x-client/api/src/generated/index.ts')).toBe(`${header()}export * from './api/things';\n`);
    expect(read('libs/generated/x-client/core/src/generated/index.ts')).toBe(`${header()}export * from './base';\n`);
    expect(log).toHaveBeenCalledWith('fake generates Overlaid');
    expect(log).toHaveBeenCalledWith('[openapi:transform] generated/x-client');
    expect(log).toHaveBeenCalledWith('transform prefix: 3 files');

    const before = readdirSync(join(root, 'libs/generated/x-client/api/src/generated'), { recursive: true });
    await generateClient(client, root);
    expect(readdirSync(join(root, 'libs/generated/x-client/api/src/generated'), { recursive: true })).toEqual(before);
  });

  it('merged-core: core files in the api lib (relative imports kept), no core lib; format with prettier', async () => {
    parts('generated/x-client', ['types', 'api']);
    write('.prettierrc', '{ "singleQuote": false, "semi": false }');
    config({
      adapters: { fake: { module: './tools/fake/adapter.ts' } },
      clients: { 'generated/x-client': { adapter: 'fake', layout: 'merged-core', pipeline: { format: true } } },
    });
    expect(await generateClient(resolveClient(root, 'generated/x-client'), root)).toEqual({ types: 1, api: 2 });
    const things = read('libs/generated/x-client/api/src/generated/api/things.ts');
    expect(things).toContain('import { BASE } from "../base"');
    expect(things).toContain('import type { Thing } from "@mo-transfer/generated/x-client/types"');
    expect(read('libs/generated/x-client/api/src/generated/base.ts')).toContain('export const BASE = "/api"\n');
    expect(read('libs/generated/x-client/api/src/generated/index.ts')).toContain('export * from "./api/things"\nexport * from "./base"\n');
    expect(existsSync(join(root, 'libs/generated/x-client/core'))).toBe(false);
  });

  it('errors carry the stage, client and adapter; a missing lib for delivered files; invalid options; requirements', async () => {
    parts('generated/x-client', ['types', 'api']);
    const run = async (entry: object, adapters: ClientsConfig['adapters'] = { fake: { module: './tools/fake/adapter.ts' } }) => {
      config({ adapters, clients: { 'generated/x-client': { adapter: 'fake', ...entry } } });
      return generateClient(resolveClient(root, 'generated/x-client'), root).catch((error: OpenApiError) => error);
    };
    expect(await run({})).toMatchObject({ phase: 'write', client: 'generated/x-client', adapter: 'fake', message: expect.stringContaining('libs/generated/x-client/core/src/index.ts missing, the pipeline delivers 1 files') });
    expect(await run({ options: { suffix: 1, nope: true } })).toMatchObject({
      phase: 'options',
      message: 'invalid options\n  options.suffix: expected string, got integer\n  options.nope: unknown option',
    });
    expect(await run({ pipeline: { overlays: ['missing.yaml'] } })).toMatchObject({
      phase: 'spec',
      message: 'pipeline.overlays set (missing.yaml), feature flag "overlays" disabled',
    });
    expect(await run({ pipeline: { transforms: ['./tools/hooks/none.ts'] } })).toMatchObject({ phase: 'load' });
    expect(await run({ options: { extra: true }, layout: 'merged-core' })).toEqual({ types: 1, api: 2 });

    write('tools/req/adapter.ts', "export default { apiVersion: 1, id: 'req', requires: { packages: ['not-there'] }, generate() {}, classify() { return { models: [], apis: [], core: [] }; } };\n");
    const unmet = await run({ adapter: 'req' }, { req: { module: './tools/req/adapter.ts' } });
    expect(unmet).toMatchObject({ phase: 'requires', adapter: 'req', message: 'package not-there not installed (pnpm add -D not-there)' });
    expect(formatError(unmet)).toBe('[openapi:requires] generated/x-client (adapter req): package not-there not installed (pnpm add -D not-there)');

    write('tools/dangling/adapter.ts', "import { writeFileSync } from 'node:fs';\nexport default { apiVersion: 1, id: 'dangling', generate({ outDir }: { outDir: string }) { writeFileSync(outDir + '/a.ts', \"import { x } from './x';\\n\"); writeFileSync(outDir + '/x.ts', ''); }, classify() { return { models: [], apis: ['a.ts'], core: [] }; } };\n");
    expect(await run({ adapter: 'dangling' }, { dangling: { module: './tools/dangling/adapter.ts' } })).toMatchObject({
      phase: 'split',
      message: "a.ts: Import './x' points to a dropped or unknown file (x.ts)",
    });
    write('tools/entries/adapter.ts', "import { writeFileSync } from 'node:fs';\nexport default { apiVersion: 1, id: 'entries', generate({ outDir }: { outDir: string }) { writeFileSync(outDir + '/a.ts', 'export const a = 1;\\n'); }, classify() { return { models: [], apis: ['a.ts'], core: [], entries: { api: ['b.ts'] } }; } };\n");
    expect(await run({ adapter: 'entries' }, { entries: { module: './tools/entries/adapter.ts' } })).toMatchObject({
      phase: 'barrel',
      message: 'entries.api: b.ts not in this part',
    });
  });

  it('transform hooks: invalid options, invalid files, duplicates', async () => {
    parts('generated/x-client', ['types', 'api', 'core']);
    write('tools/hooks/bad-part.ts', "export default { apiVersion: 1, id: 'bad-part', transform(files: object[]) { return [...files, { path: 'x.ts', part: 'testing', content: '' }]; } };\n");
    write('tools/hooks/dup.ts', "export default { apiVersion: 1, id: 'dup', transform(files: object[]) { return [...files, files[0]]; } };\n");
    const run = async (transforms: unknown[]) => {
      config({ adapters: { fake: { module: './tools/fake/adapter.ts' } }, clients: { 'generated/x-client': { adapter: 'fake', pipeline: { transforms: transforms as string[] } } } });
      return generateClient(resolveClient(root, 'generated/x-client'), root).catch((error: OpenApiError) => error);
    };
    expect(await run([{ module: './tools/hooks/prefix.ts', options: { text: 1 } }])).toMatchObject({
      phase: 'transform',
      message: 'transform prefix: invalid options\n  options.text: expected string, got integer',
    });
    expect(await run(['./tools/hooks/bad-part.ts'])).toMatchObject({ message: 'transform bad-part: returned an invalid file "x.ts" (part one of types, api, core)' });
    expect(await run(['./tools/hooks/dup.ts'])).toMatchObject({ message: 'transform dup: api/things.ts twice' });
  });

  it('prettier missing → finalize error with hint', async () => {
    vi.resetModules();
    vi.doMock('prettier', () => {
      throw new Error('not installed');
    });
    const facade = await import('../facade.js');
    parts('generated/x-client', ['types', 'api', 'core']);
    config({ adapters: { fake: { module: './tools/fake/adapter.ts' } }, clients: { 'generated/x-client': { adapter: 'fake', pipeline: { format: true } } } });
    const error = await facade.generateClient(facade.resolveClient(root, 'generated/x-client'), root).catch((caught: OpenApiError) => caught);
    expect(error).toMatchObject({ message: 'prettier not installed', hint: 'pnpm add -D prettier, or pipeline.format: false' });
    vi.doUnmock('prettier');
  });

  it('generateTesting refuses a client with pipeline.testing: false', async () => {
    config({ clients: { 'generated/x-client': { pipeline: { testing: false } } } });
    await expect(generateTesting(resolveClient(root, 'generated/x-client'), root)).rejects.toThrow('pipeline.testing is false: no testing lib');
  });
});
