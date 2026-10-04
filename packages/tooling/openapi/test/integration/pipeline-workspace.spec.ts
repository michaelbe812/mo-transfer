/**
 * Extension points end to end with `nx` in a fixture workspace (real plugin, executors, cache):
 *
 *   ts-client      consumer adapter in TypeScript (workspace module, imports the SPI + a helper) + overlay + transform hook
 *   other-client   same TS adapter (cache: an adapter change hits both, nothing else)
 *   npm-client     consumer adapter as ESM-only npm package (exports: import only), layout merged-core
 *   cmd-client     built-in `command` adapter (a Node script as generator), testing: false
 *
 * Checked: inferred inputs/outputs/edges/metadata, generated output, cache invalidation per client and per
 * adapter/overlay/transform change, `nx affected` reach, the createDependencies edge to the npm package.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createWorkspace, filesBelow, read, removeWorkspace, repoRoot, SCAFFOLD, THINGS_SPEC, write } from '../helpers';

const TOOLING_PATHS = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf-8')).compilerOptions.paths as Record<string, string[]>,
  )
    .filter(([alias]) => alias.startsWith('@mo-transfer/tooling-'))
    .map(([alias, [target]]) => [alias, [join(repoRoot, target)]]),
);

const TS_ADAPTER = `
import { defineAdapter, listTsFiles } from '@mo-transfer/tooling-openapi/adapter';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { titleOf } from './helper';

interface FakeOptions { serviceSuffix: string }

export default defineAdapter<FakeOptions>({
  apiVersion: 1,
  id: 'fake',
  defaults: { serviceSuffix: 'Service' },
  optionsSchema: { type: 'object', properties: { serviceSuffix: { type: 'string' } }, additionalProperties: false },
  generate({ specFile, outDir, options }) {
    const title: string = titleOf(readFileSync(specFile, 'utf-8'));
    for (const dir of ['model', 'api', 'core']) mkdirSync(join(outDir, dir), { recursive: true });
    writeFileSync(join(outDir, 'model/thing.ts'), 'export interface Thing { title: ' + JSON.stringify(title) + ' }\\n');
    writeFileSync(join(outDir, 'core/runtime.ts'), "export const BASE_PATH = '/api';\\n");
    writeFileSync(
      join(outDir, 'api/things.ts'),
      "import type { Thing } from '../model/thing';\\nimport { BASE_PATH } from '../core/runtime';\\n" +
        'export class Things' + options.serviceSuffix + ' { readonly base = BASE_PATH; first(): Thing | undefined { return undefined; } }\\n',
    );
  },
  classify({ outDir }) {
    const files = listTsFiles(outDir);
    return {
      models: files.filter((file) => file.startsWith('model/')),
      apis: files.filter((file) => file.startsWith('api/')),
      core: files.filter((file) => file.startsWith('core/')),
    };
  },
});
`;
const HELPER = "export const titleOf = (spec: string): string => /title: (.+)/.exec(spec)?.[1]?.trim() ?? 'none';\n";

const NPM_ADAPTER = `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
export default {
  apiVersion: 1,
  id: 'acme',
  generate({ outDir }) {
    mkdirSync(join(outDir, 'models'), { recursive: true });
    writeFileSync(join(outDir, 'models/owner.ts'), 'export interface Owner { id: string }\\n');
    writeFileSync(join(outDir, 'service.ts'), "import type { Owner } from './models/owner';\\nimport { http } from './http';\\nexport const owners = (): Owner[] => http([]);\\n");
    writeFileSync(join(outDir, 'http.ts'), 'export const http = <T>(value: T): T => value;\\n');
  },
  classify() {
    return { models: ['models/owner.ts'], apis: ['service.ts'], core: ['http.ts'] };
  },
};
`;
const GENERATOR_SCRIPT = [
  "import { mkdirSync, writeFileSync } from 'node:fs';",
  'const [out] = process.argv.slice(2);',
  "mkdirSync(out + '/gen', { recursive: true });",
  "writeFileSync(out + '/gen/models.ts', 'export type Id = string;\\n');",
  "writeFileSync(out + '/gen/client.ts', \"import type { Id } from './models';\\nexport const get = (id: Id) => id;\\n\");",
].join('\n');
const TRANSFORM = "export default { apiVersion: 1, id: 'stamp', transform(files: { content: string }[]) { return files.map((f) => ({ ...f, content: f.content + '// stamped v1\\n' })); } };\n";

describe('extension points with nx in a fixture workspace', () => {
  let root: string;
  const nxEnv = () => ({
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NX_'))),
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_CACHE_DIRECTORY: join(root, '.nx/cache'),
    NX_WORKSPACE_DATA_DIRECTORY: join(root, '.nx/workspace-data'),
    // plain output to parse (the outer Nx task may force colors)
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  });
  const nx = (...args: string[]): string =>
    execFileSync(process.execPath, [join(repoRoot, 'node_modules/nx/dist/bin/nx.js'), ...args], { cwd: root, encoding: 'utf-8', env: nxEnv() });
  const project = (name: string) => JSON.parse(nx('show', 'project', name, '--json'));
  const clientsJson = () => JSON.parse(read(root, 'openapi-clients.json'));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form edits of the fixture's JSON
  const updateClients = (update: (config: Record<string, any>) => void): void => {
    const config = clientsJson();
    update(config);
    write(root, 'openapi-clients.json', `${JSON.stringify(config, null, 2)}\n`);
  };
  /** generate-api-client of the given clients → which ran (not from the cache) */
  const generate = (...clients: string[]): string[] => {
    const output = nx('run-many', '-t', 'generate-api-client', '-p', ...clients.map((client) => `generated-${client}`), '--output-style=static');
    const plain = stripVTControlCharacters(output);
    return clients.filter((client) => {
      const line = plain.split('\n').find((text) => text.includes(`nx run generated-${client}:generate-api-client`));
      return line !== undefined && !/local cache|existing outputs match the cache/.test(line);
    });
  };
  const affected = (file: string): string[] => JSON.parse(nx('show', 'projects', '--affected', `--files=${file}`, '--json'));

  beforeAll(() => {
    root = createWorkspace('pipeline', { ownNodeModules: true });
    // the fake npm adapter: ESM only, exports with the import condition only
    write(
      root,
      'node_modules/@acme/openapi-adapter/package.json',
      JSON.stringify({ name: '@acme/openapi-adapter', version: '1.0.0', type: 'module', exports: { '.': { import: './index.js' } } }),
    );
    write(root, 'node_modules/@acme/openapi-adapter/index.js', NPM_ADAPTER);
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
    manifest.devDependencies['@acme/openapi-adapter'] = '1.0.0';
    write(root, 'package.json', JSON.stringify(manifest, null, 2));
    // the lockfile knows the fake package: Nx creates npm:@acme/openapi-adapter (externalDependencies, createDependencies)
    const lock = parseYaml(readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf-8'));
    lock.importers['.'].devDependencies['@acme/openapi-adapter'] = { specifier: '1.0.0', version: '1.0.0' };
    lock.packages['@acme/openapi-adapter@1.0.0'] = { resolution: { integrity: 'sha512-ZmFrZQ==' } };
    lock.snapshots['@acme/openapi-adapter@1.0.0'] = {};
    write(root, 'pnpm-lock.yaml', stringifyYaml(lock));
    write(root, 'nx.json', readFileSync(join(repoRoot, 'nx.json'), 'utf-8'));
    write(root, 'lib-scopes.json', JSON.stringify({ scopes: ['shared'] }));
    write(root, 'tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: TOOLING_PATHS } }));
    write(root, 'specs/things.yaml', THINGS_SPEC);
    write(root, 'tools/openapi-adapters/fake/adapter.ts', TS_ADAPTER);
    write(root, 'tools/openapi-adapters/fake/helper.ts', HELPER);
    write(root, 'tools/codegen/gen.mjs', GENERATOR_SCRIPT);
    write(root, 'tools/openapi-transforms/stamp.ts', TRANSFORM);
    write(
      root,
      'openapi-clients.json',
      JSON.stringify({
        settings: { scaffold: SCAFFOLD, features: { overlays: true } },
        adapters: {
          fake: { module: './tools/openapi-adapters/fake/adapter.ts' },
          acme: { module: '@acme/openapi-adapter' },
          cmd: {
            module: 'builtin:command',
            runtime: ['node --version'],
            options: { command: 'node', args: ['{workspaceRoot}/tools/codegen/gen.mjs', '{outDir}'], classify: { models: ['gen/models.ts'], apis: ['gen/client.ts'] } },
          },
        },
        clients: {},
      }),
    );
    nx('g', '@mo-transfer/tooling-openapi:client', 'ts-client', '--spec=specs/things.yaml', '--adapter=fake');
    nx('g', '@mo-transfer/tooling-openapi:client', 'other-client', '--spec=specs/things.yaml', '--adapter=fake');
    nx('g', '@mo-transfer/tooling-openapi:client', 'npm-client', '--spec=specs/things.yaml', '--adapter=acme', '--layout=merged-core');
    nx('g', '@mo-transfer/tooling-openapi:client', 'cmd-client', '--spec=specs/things.yaml', '--adapter=cmd', '--no-testing');
    write(
      root,
      'libs/generated/ts-client/overlays/title.yaml',
      'overlay: 1.0.0\ninfo: { title: rename, version: 1.0.0 }\nactions:\n  - target: $.info\n    update: { title: Overlaid Things }\n',
    );
    updateClients((config) => {
      config.clients['generated/ts-client'].pipeline = { overlays: ['overlays/title.yaml'], transforms: ['./tools/openapi-transforms/stamp.ts'] };
    });
  });
  afterAll(() => removeWorkspace(root));

  it('the plugin infers inputs from the registry: module folder, npm package, built-in alias; layouts, testing: false', () => {
    const ts = project('generated-ts-client');
    const inputs = ts.targets['generate-api-client'].inputs;
    expect(inputs).toContain('{workspaceRoot}/tools/openapi-adapters/fake/**/*');
    expect(inputs).toContain('{workspaceRoot}/tools/openapi-transforms/**/*');
    expect(inputs).toContain('{workspaceRoot}/libs/generated/ts-client/overlays/title.yaml');
    expect(inputs).toContainEqual({
      json: '{workspaceRoot}/openapi-clients.json',
      fields: ['defaultAdapter', 'settings', 'adapters.fake', 'clients.generated/ts-client'],
    });
    expect(ts.metadata.openapi).toMatchObject({ adapter: 'fake', adapterSource: 'workspace', layout: 'default', testing: true });
    expect(project('generated-ts-client-testing').targets['generate-api-testing'].inputs).toContain('{workspaceRoot}/tools/openapi-transforms/**/*');

    const npm = project('generated-npm-client');
    expect(npm.targets['generate-api-client'].inputs).toContainEqual({ externalDependencies: ['@acme/openapi-adapter', 'typescript', 'yaml'] });
    expect(npm.targets['generate-api-client'].outputs).toEqual(['{projectRoot}/types/src/generated', '{projectRoot}/api/src/generated']);
    expect(npm.metadata.openapi).toMatchObject({ adapterSource: 'package', layout: 'merged-core', parts: ['types', 'api', 'testing'] });
    expect(project('generated-npm-client-api').implicitDependencies).toEqual(['generated-npm-client', 'generated-npm-client-types']);
    expect(existsSync(join(root, 'libs/generated/npm-client/core'))).toBe(false);

    const cmd = project('generated-cmd-client');
    expect(cmd.targets['generate-api-client'].inputs).toContainEqual({ runtime: 'node --version' });
    expect(cmd.metadata.openapi).toMatchObject({ adapterSource: 'builtin', testing: false, parts: ['types', 'api', 'core'] });
    expect(existsSync(join(root, 'libs/generated/cmd-client/testing'))).toBe(false);
    expect(clientsJson().clients['generated/cmd-client']).toEqual({ adapter: 'cmd', pipeline: { testing: false } });
  });

  it('createDependencies: npm-client → npm:@acme/openapi-adapter (affected after a lockfile change)', () => {
    // the full graph incl. external nodes (nx graph --file leaves them out)
    const graph = JSON.parse(
      execFileSync(
        process.execPath,
        ['-e', "require('@nx/devkit').createProjectGraphAsync({ exitOnError: true }).then((g) => console.log(JSON.stringify({ dependencies: g.dependencies, external: Object.keys(g.externalNodes ?? {}) })))"],
        { cwd: root, encoding: 'utf-8', env: nxEnv() },
      ),
    );
    expect(graph.external).toContain('npm:@acme/openapi-adapter');
    expect(graph.dependencies['generated-npm-client']).toContainEqual({
      source: 'generated-npm-client',
      target: 'npm:@acme/openapi-adapter',
      type: 'implicit',
    });
  });

  it('generates through every adapter kind: TS workspace adapter + overlay + transform, ESM npm package (merged-core), command', () => {
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual(['ts-client', 'other-client', 'npm-client', 'cmd-client']);
    const thing = read(root, 'libs/generated/ts-client/types/src/generated/model/thing.ts');
    expect(thing).toContain('export interface Thing { title: "Overlaid Things" }\n// stamped v1\n');
    expect(read(root, 'libs/generated/ts-client/api/src/generated/api/things.ts')).toContain("from '@mo-transfer/generated/ts-client/core'");
    expect(read(root, 'libs/generated/other-client/types/src/generated/model/thing.ts')).not.toContain('Overlaid');

    expect(filesBelow(join(root, 'libs/generated/npm-client/api/src/generated'))).toEqual(['http.ts', 'index.ts', 'service.ts']);
    expect(read(root, 'libs/generated/npm-client/api/src/generated/service.ts')).toContain("import { http } from './http';");
    expect(read(root, 'libs/generated/npm-client/api/src/generated/service.ts')).toContain("from '@mo-transfer/generated/npm-client/types'");

    expect(filesBelow(join(root, 'libs/generated/cmd-client/api/src/generated'))).toEqual(['gen/client.ts', 'index.ts']);
    expect(read(root, 'libs/generated/cmd-client/api/src/generated/index.ts')).toContain('(openapi, adapter cmd)');
    expect(read(root, 'libs/generated/cmd-client/core/src/generated/index.ts')).toMatch(/export \{\};\n$/);
  });

  it('cache per client: an entry change hits only its client; an adapter change only its clients; overlay / transform only theirs', () => {
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual([]);
    updateClients((config) => {
      config.clients['generated/other-client'].options = { serviceSuffix: 'Api' };
    });
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual(['other-client']);
    expect(read(root, 'libs/generated/other-client/api/src/generated/api/things.ts')).toContain('export class ThingsApi');

    write(root, 'tools/openapi-adapters/fake/helper.ts', `${HELPER}// helper changed\n`);
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual(['ts-client', 'other-client']);

    write(root, 'libs/generated/ts-client/overlays/title.yaml', read(root, 'libs/generated/ts-client/overlays/title.yaml').replace('Overlaid Things', 'Second Title'));
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual(['ts-client']);
    expect(read(root, 'libs/generated/ts-client/types/src/generated/model/thing.ts')).toContain('Second Title');

    write(root, 'tools/openapi-transforms/stamp.ts', TRANSFORM.replace('stamped v1', 'stamped v2'));
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual(['ts-client']);
    expect(read(root, 'libs/generated/ts-client/types/src/generated/model/thing.ts')).toContain('// stamped v2');

    updateClients((config) => {
      config.adapters.cmd.options.args.push('--unused');
    });
    expect(generate('ts-client', 'other-client', 'npm-client', 'cmd-client')).toEqual(['cmd-client']);
  });

  it('nx affected reaches exactly the clients of a changed adapter, overlay or transform (+ their libs)', () => {
    const adapterChange = affected('tools/openapi-adapters/fake/helper.ts');
    expect(adapterChange).toEqual(expect.arrayContaining(['generated-ts-client', 'generated-other-client', 'generated-ts-client-api']));
    expect(adapterChange).not.toContain('generated-npm-client');
    expect(adapterChange).not.toContain('generated-cmd-client');
    const overlayChange = affected('libs/generated/ts-client/overlays/title.yaml');
    expect(overlayChange).toContain('generated-ts-client');
    expect(overlayChange).not.toContain('generated-other-client');
    expect(affected('tools/openapi-transforms/stamp.ts')).toEqual(expect.arrayContaining(['generated-ts-client', 'generated-ts-client-testing']));
    expect(affected('tools/openapi-transforms/stamp.ts')).not.toContain('generated-other-client');
  });

  it('testing preset with all mocks engines via nx: none (default), schema-faker, orval (deprecated) — engine inputs only in their mode', () => {
    updateClients((config) => {
      config.clients['generated/ts-client'].pipeline.testing = { mocks: 'schema-faker' };
      config.clients['generated/other-client'].pipeline = { testing: { mocks: 'orval' } };
    });
    const faker = project('generated-ts-client-testing').targets['generate-api-testing'];
    const orval = project('generated-other-client-testing').targets['generate-api-testing'];
    const none = project('generated-npm-client-testing').targets['generate-api-testing'];
    expect(faker.inputs.find((input: { externalDependencies?: string[] }) => input.externalDependencies).externalDependencies).not.toContain('orval');
    expect(orval.inputs.find((input: { externalDependencies?: string[] }) => input.externalDependencies).externalDependencies).toContain('orval');
    expect(none.inputs.find((input: { externalDependencies?: string[] }) => input.externalDependencies).externalDependencies).not.toContain('orval');
    expect(project('generated-other-client').metadata.openapi.mocks).toBe('orval');
    expect(project('generated-npm-client').metadata.openapi.mocks).toBe('none');
    nx('run-many', '-t', 'generate-api-testing', '-p', 'generated-ts-client-testing', 'generated-other-client-testing', 'generated-npm-client-testing');
    expect(filesBelow(join(root, 'libs/generated/npm-client/testing/src/generated'))).toEqual(['http.ts', 'index.ts', 'schema.ts']);
    expect(filesBelow(join(root, 'libs/generated/ts-client/testing/src/generated'))).toContain('mock-runtime.ts');
    expect(read(root, 'libs/generated/ts-client/testing/src/generated/model.ts')).toContain("export type Thing = components['schemas']");
    const orvalFiles = filesBelow(join(root, 'libs/generated/other-client/testing/src/generated'));
    expect(orvalFiles.some((file) => file.startsWith('model/'))).toBe(true);
    expect(orvalFiles).not.toContain('mock-runtime.ts');
    // the transform hook of ts-client runs in the testing preset, too
    expect(read(root, 'libs/generated/ts-client/testing/src/generated/handlers.ts')).toContain('// stamped');
  });

  it('overlay feature flag off: no overlay input, generate fails with the hint, the metadata names it (verify reports it)', () => {
    updateClients((config) => {
      config.settings.features.overlays = false;
    });
    const ts = project('generated-ts-client');
    expect(ts.metadata.openapi.disabledFeatures).toEqual(['overlays']);
    expect(ts.targets['generate-api-client'].inputs).not.toContain('{workspaceRoot}/libs/generated/ts-client/overlays/title.yaml');
    let output = '';
    try {
      nx('run', 'generated-ts-client:generate-api-client', '--skip-nx-cache');
    } catch (error) {
      output = `${(error as { stdout?: string }).stdout ?? ''}${(error as { stderr?: string }).stderr ?? ''}`;
    }
    expect(output).toContain('[openapi:spec] generated/ts-client (adapter fake): pipeline.overlays set (overlays/title.yaml), feature flag "overlays" disabled');
    expect(output).toContain('hint: experimental feature flag "overlays" disabled');
    updateClients((config) => {
      config.settings.features.overlays = true;
    });
  });

  it('a broken registration never breaks the graph: the client keeps update-spec, the problem is in the metadata', () => {
    updateClients((config) => {
      config.adapters.fake.module = './tools/openapi-adapters/missing.ts';
    });
    const ts = project('generated-ts-client');
    expect(Object.keys(ts.targets)).toEqual(['update-spec']);
    expect(ts.metadata.openapi.problem).toBe('adapters.fake: ./tools/openapi-adapters/missing.ts not found (relative to the workspace root)');
    updateClients((config) => {
      config.adapters.fake.module = './tools/openapi-adapters/fake/adapter.ts';
    });
  });
});
