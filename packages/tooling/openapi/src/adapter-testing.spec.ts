/**
 * The contract test helper consumers run against their adapters — here against the built-in command adapter
 * (a Node script as "generator") and against broken adapters (every violation is reported).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type AdapterDefinition, type Classification, defineAdapter, defineScaffold, defineTransform } from './adapter';
import { runAdapterContract } from './adapter-testing';
import commandAdapter from './adapters/command';

let root: string;
const write = (path: string, content: string): void => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'openapi-contract-'));
  write('spec.yaml', 'openapi: 3.0.3\ninfo: { title: T, version: "1" }\npaths: {}\n');
  // the "generator": writes a model, an api importing it and a runtime file; argv: outDir, client name
  write(
    'gen.mjs',
    [
      "import { mkdirSync, writeFileSync } from 'node:fs';",
      'const [out, name] = process.argv.slice(2);',
      "mkdirSync(out + '/model', { recursive: true }); mkdirSync(out + '/api', { recursive: true });",
      "writeFileSync(out + '/model/thing.ts', 'export interface Thing {}\\n');",
      "writeFileSync(out + '/api/things.ts', \"import type { Thing } from '../model/thing';\\nexport const client = '\" + name + \"';\\nexport type T = Thing;\\n\");",
      "writeFileSync(out + '/runtime.ts', 'export const BASE = process.env.BASE_URL;\\n'.replace('process.env.BASE_URL', JSON.stringify(process.env.BASE_URL)));",
      "writeFileSync(out + '/README.md', 'dropped');",
      "if (process.env.FAIL) { console.error('generator says no'); process.exit(3); }",
    ].join('\n'),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const commandOptions = {
  command: 'node',
  args: ['{workspaceRoot}/gen.mjs', '{outDir}', '{clientName}'],
  env: { BASE_URL: '/api/{clientPath}' },
  classify: { models: ['model/**'], apis: ['api/*.ts'], core: ['*.ts'] },
};

describe('runAdapterContract', () => {
  it('the command adapter (globs, placeholders, env) fulfils the contract; merged-core; declared entries', async () => {
    const report = await runAdapterContract(commandAdapter, { specFile: 'spec.yaml', workspaceRoot: root, options: commandOptions });
    expect(report.parts).toEqual({ types: ['model/thing.ts'], api: ['api/things.ts'], core: ['runtime.ts'] });
    expect(report.barrels).toEqual({
      types: "export * from './model/thing';",
      api: "export * from './api/things';",
      core: "export * from './runtime';",
    });
    const merged = await runAdapterContract(commandAdapter, {
      specFile: join(root, 'spec.yaml'),
      workspaceRoot: root,
      layout: 'merged-core',
      keepOutput: true,
      options: { ...commandOptions, entries: { api: ['api/things.ts'] } },
    });
    expect(merged.parts).toEqual({ types: ['model/thing.ts'], api: ['api/things.ts', 'runtime.ts'] });
    expect(merged.barrels.api).toBe("export * from './api/things';\nexport * from './runtime';");
    rmSync(merged.outDir, { recursive: true, force: true });
  });

  it('reports every violation', async () => {
    const adapter = (overrides: Partial<AdapterDefinition>): AdapterDefinition => ({
      apiVersion: 1,
      id: 'broken',
      generate: ({ outDir }) => writeFileSync(join(outDir, 'a.ts'), "import { b } from './b';\n"),
      classify: (): Classification => ({ models: [], apis: ['a.ts'], core: [] }),
      ...overrides,
    });
    const contract = (definition: unknown, options?: object) =>
      runAdapterContract(definition as AdapterDefinition, { specFile: 'spec.yaml', workspaceRoot: root, options: options as Record<string, unknown> });
    await expect(contract({ apiVersion: 2, id: 'x' })).rejects.toThrow('adapter contract: adapter: apiVersion 2 not supported');
    await expect(contract(commandAdapter, { command: 'node' })).rejects.toThrow('invalid options: options.classify: required');
    await expect(contract(adapter({ requires: { node: '>=99' } }))).rejects.toThrow('Node >=99 required');
    await expect(contract(adapter({ generate: () => undefined }))).rejects.toThrow('generate wrote no .ts file into ctx.outDir');
    await expect(contract(adapter({ classify: () => ({ models: [], apis: [], core: [] }) }))).rejects.toThrow('classify put no file into models/apis/core');
    await expect(contract(adapter({}))).rejects.toThrow("adapter contract: a.ts: Import './b' points to a dropped or unknown file (not found)");
    await expect(
      contract(adapter({ generate: ({ outDir, log }) => { log('silent'); writeFileSync(join(outDir, 'a.ts'), ''); }, classify: () => ({ models: [], apis: ['a.ts'], core: [], entries: { api: ['z.ts'] } }) })),
    ).rejects.toThrow('entries.api: z.ts not in this part');
    await expect(contract(commandAdapter, { ...commandOptions, env: { FAIL: '1' } })).rejects.toThrow('generator says no');
  });

  it('define helpers are identities (typed SPI)', () => {
    const definition = { apiVersion: 1 as const, id: 'x', generate: () => undefined, classify: () => ({ models: [], apis: [], core: [] }) };
    expect(defineAdapter(definition)).toBe(definition);
    const transform = { apiVersion: 1 as const, id: 't', transform: () => undefined };
    expect(defineTransform(transform)).toBe(transform);
    const scaffold = { apiVersion: 1 as const, id: 's', writeLib: () => undefined };
    expect(defineScaffold(scaffold)).toBe(scaffold);
  });
});
