/**
 * Review findings (H1, H2, M1, M3, M4, L5) against `nx` in a fixture workspace: a malformed openapi-clients.json
 * never breaks the graph, settings/transform paths cannot escape (no committed file deleted), missing declared
 * packages give a clear problem instead of a hasher failure, modules outside the workspace are rejected, renamed
 * targets keep dependsOn working.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addFakePackage, createNxFixture, type NxFixture, removeWorkspace, THINGS_SPEC, write } from '../helpers';

describe('H1: a malformed openapi-clients.json never breaks the graph', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('h1');
    write(fx.root, 'libs/generated/a-client/project.json', JSON.stringify({ name: 'generated-a-client', tags: ['scope:shared', 'generated'] }));
    write(fx.root, 'libs/generated/a-client/openapi.yaml', THINGS_SPEC);
  });
  afterAll(() => removeWorkspace(fx.root));

  const shapes: [string, unknown][] = [
    ['adapter registration {}', { adapters: { x: {} }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['adapter registration null', { adapters: { x: null }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['adapter module not a string', { adapters: { x: { module: 42 } }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['client entry null', { clients: { 'generated/a-client': null } }],
    ['transform entry {}', { clients: { 'generated/a-client': { pipeline: { transforms: [{}] } } } }],
    ['transforms not an array', { clients: { 'generated/a-client': { pipeline: { transforms: 'x' } } } }],
    ['clients not an object', { clients: 'x' }],
    ['settings not an object', { settings: 'x', clients: { 'generated/a-client': {} } }],
    ['adapters an array', { adapters: [1], clients: { 'generated/a-client': {} } }],
    ['the file an array', []],
  ];

  it.each(shapes)('%s: graph computes, the client project stays', (_, config) => {
    write(fx.root, 'openapi-clients.json', JSON.stringify(config));
    const result = fx.tryNx('show', 'projects', '--json');
    expect(result.output).not.toMatch(/Failed to process|threw an error/);
    expect(result.ok).toBe(true);
    expect(fx.nx('show', 'projects', '--json')).toContain('generated-a-client');
  });

  it('the problem lands in the metadata (verify reports it)', () => {
    write(fx.root, 'openapi-clients.json', JSON.stringify(shapes[0][1]));
    expect(fx.project('generated-a-client').metadata.openapi.problem).toBe('adapters.x: module missing (a workspace path, package or builtin:<id>)');
    write(fx.root, 'openapi-clients.json', JSON.stringify(shapes[4][1]));
    expect(fx.project('generated-a-client').metadata.openapi.problem).toBe('pipeline.transforms[0]: module missing');
  });
});

/** a Node script as generator (built-in command adapter): model + api in separate files */
const GENERATOR = [
  "import { mkdirSync, writeFileSync } from 'node:fs';",
  'const [out] = process.argv.slice(2);',
  "mkdirSync(out + '/model', { recursive: true });",
  "writeFileSync(out + '/model/thing.ts', 'export type Thing = { id: string };\\n');",
  "writeFileSync(out + '/client.ts', \"import type { Thing } from './model/thing';\\nexport const get = (): Thing => ({ id: 'x' });\\n\");",
].join('\n');
const COMMAND_ADAPTER = {
  module: 'builtin:command',
  options: { command: 'node', args: ['{workspaceRoot}/tools/gen.mjs', '{outDir}'], classify: { models: ['model/*.ts'], apis: ['client.ts'] } },
};
const commitClient = (root: string, clientPath: string, parts = ['types', 'api', 'core']): void => {
  write(root, `libs/${clientPath}/project.json`, JSON.stringify({ name: clientPath.replaceAll('/', '-'), tags: ['scope:shared', 'generated'] }));
  write(root, `libs/${clientPath}/openapi.yaml`, THINGS_SPEC);
  for (const part of parts) write(root, `libs/${clientPath}/${part}/src/index.ts`, "export * from './generated';\n");
};

describe('H2: paths from settings, transforms and classify cannot escape', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('h2');
    write(fx.root, 'tools/gen.mjs', GENERATOR);
    commitClient(fx.root, 'generated/b-client');
  });
  afterAll(() => removeWorkspace(fx.root));

  it('settings.outputDir ".." never deletes the committed lib: invalid settings, no targets, a warning', () => {
    fx.clients({ settings: { outputDir: '..' }, adapters: { cmd: COMMAND_ADAPTER }, clients: { 'generated/b-client': { adapter: 'cmd' } } });
    const run = fx.tryNx('run', 'generated-b-client:generate-api-client', '--skip-nx-cache');
    expect(existsSync(join(fx.root, 'libs/generated/b-client/types/src/index.ts'))).toBe(true);
    expect(run.ok).toBe(false);
    expect(fx.tryNx('show', 'projects', '--json').output).toContain('settings.outputDir: must be one kebab-case folder name');
  });

  it.each([
    [{ libsDir: '/tmp' }, 'settings.libsDir: must be a relative path inside the workspace'],
    [{ libsDir: '../outside' }, 'settings.libsDir: must be a relative path inside the workspace'],
    [{ clientFolder: 'a/b' }, 'settings.clientFolder: must be one kebab-case folder name'],
    [{ specFiles: ['../spec.yaml'] }, 'settings.specFiles: plain file names only'],
  ])('settings %j are rejected with a warning', (settings, message) => {
    fx.clients({ settings, clients: { 'generated/b-client': {} } });
    const result = fx.tryNx('show', 'projects', '--json');
    expect(result.ok).toBe(true);
    expect(result.output).toContain(message);
    expect(fx.project('generated-b-client').targets['generate-api-client']).toBeUndefined();
  });

  it('a transform returning a path outside its part fails; nothing is written outside src/generated', () => {
    write(
      fx.root,
      'tools/escape/escape.ts',
      "export default { apiVersion: 1, id: 'escape', transform(files: { path: string; part: string; content: string }[]) { return [...files, { path: '../../../../../escaped.ts', part: 'api', content: 'x' }]; } };\n",
    );
    fx.clients({ adapters: { cmd: COMMAND_ADAPTER }, clients: { 'generated/b-client': { adapter: 'cmd', pipeline: { transforms: ['./tools/escape/escape.ts'] } } } });
    const run = fx.tryNx('run', 'generated-b-client:generate-api-client', '--skip-nx-cache');
    expect(run.ok).toBe(false);
    expect(run.output).toContain('transform escape: invalid file path "../../../../../escaped.ts" (relative, inside its part)');
    expect(existsSync(join(fx.root, 'libs/escaped.ts'))).toBe(false);
    expect(existsSync(join(fx.root, 'escaped.ts'))).toBe(false);
  });

  it('a classification pointing outside the raw output is rejected', () => {
    write(fx.root, 'tools/out/out.ts', "export default { apiVersion: 1, id: 'out', generate() {}, classify() { return { models: ['../outside.ts'], apis: [], core: [] }; } };\n");
    fx.clients({ adapters: { out: { module: './tools/out/out.ts' } }, clients: { 'generated/b-client': { adapter: 'out' } } });
    const run = fx.tryNx('run', 'generated-b-client:generate-api-client', '--skip-nx-cache');
    expect(run.ok).toBe(false);
    expect(run.output).toContain('../outside.ts: classified, but no .ts file of the raw output');
  });
});

describe('M1: declared packages that are not installed', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('m1');
    write(fx.root, 'tools/gen.mjs', GENERATOR);
    commitClient(fx.root, 'generated/c-client');
  });
  afterAll(() => removeWorkspace(fx.root));

  it('never reach externalDependencies (no hasher failure); the problem is named in the metadata and as warning', () => {
    fx.clients({ adapters: { cmd: { ...COMMAND_ADAPTER, packages: ['not-installed-generator'] } }, clients: { 'generated/c-client': { adapter: 'cmd' } } });
    const first = fx.tryNx('run', 'generated-c-client:generate-api-client', '--skip-nx-cache');
    expect(first.output).not.toContain('could not be found');
    expect(first.ok).toBe(true);
    fx.clients({
      adapters: { cmd: { ...COMMAND_ADAPTER, packages: ['not-installed-generator'] } },
      clients: { 'generated/c-client': { adapter: 'cmd', pipeline: { transforms: ['@acme/not-installed-hook'] } } },
    });
    const graph = fx.tryNx('show', 'projects', '--json');
    expect(graph.output).toContain('not installed: not-installed-generator');
    const client = fx.project('generated-c-client');
    const external = client.targets['generate-api-client'].inputs.find((input: { externalDependencies?: string[] }) => input.externalDependencies);
    expect(external.externalDependencies).not.toContain('not-installed-generator');
    expect(external.externalDependencies).not.toContain('@acme/not-installed-hook');
    expect(client.metadata.openapi.missingPackages).toEqual(['not-installed-generator', '@acme/not-installed-hook']);
    fx.clients({ adapters: { cmd: { ...COMMAND_ADAPTER, packages: ['not-installed-generator'] } }, clients: { 'generated/c-client': { adapter: 'cmd' } } });
    const run = fx.tryNx('run', 'generated-c-client:generate-api-client', '--skip-nx-cache');
    expect(run.output).not.toContain('could not be found');
    expect(run.ok).toBe(true);
  });
});

/** a Node ≥ 22.18 (native type stripping) from nvm, if installed */
const TYPE_STRIPPING_NODE = (() => {
  const base = join(process.env.HOME ?? '', '.nvm/versions/node');
  if (!existsSync(base)) return undefined;
  const version = (name: string) => name.slice(1).split('.').map(Number);
  const candidates = readdirSync(base)
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
    .filter((name) => {
      const [major, minor] = version(name);
      return major > 22 || (major === 22 && minor >= 18);
    })
    .sort((a, b) => version(a)[0] - version(b)[0] || version(a)[1] - version(b)[1]);
  return candidates[0] && join(base, candidates[0], 'bin/node');
})();

const TS_WORKSPACE_ADAPTER = `
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { label } from './label';
export default {
  apiVersion: 1 as const,
  id: 'tsw',
  generate({ outDir }: { outDir: string }) {
    mkdirSync(join(outDir, 'model'), { recursive: true });
    writeFileSync(join(outDir, 'model/thing.ts'), 'export type Thing = ' + JSON.stringify(label) + ';\\n');
  },
  classify() {
    return { models: ['model/thing.ts'], apis: [], core: [] };
  },
};
`;

describe.each([
  ['Node (this process)', process.execPath],
  ['Node ≥ 22.18 with native type stripping', TYPE_STRIPPING_NODE],
])('M2: TypeScript adapters (workspace + npm package) load under %s', (_, node) => {
  let fx: NxFixture;
  beforeAll(() => {
    if (!node) return;
    fx = createNxFixture('m2', { ownNodeModules: true, node });
    write(fx.root, 'tools/tsw/adapter.ts', TS_WORKSPACE_ADAPTER);
    write(fx.root, 'tools/tsw/label.ts', "export const label: string = 'from-workspace-ts';\n");
    addFakePackage(fx.root, '@acme/ts-adapter', {
      'package.json': JSON.stringify({ name: '@acme/ts-adapter', version: '1.0.0', main: 'index.ts' }),
      'index.ts': TS_WORKSPACE_ADAPTER.replace("'tsw'", "'tsp'"),
      'label.ts': "export const label: string = 'from-npm-ts';\n",
    });
    commitClient(fx.root, 'generated/w-client');
    commitClient(fx.root, 'generated/p-client');
    fx.clients({
      settings: { toolingInputs: 'none' },
      adapters: { tsw: { module: './tools/tsw/adapter.ts' }, tsp: { module: '@acme/ts-adapter' } },
      clients: { 'generated/w-client': { adapter: 'tsw' }, 'generated/p-client': { adapter: 'tsp' } },
    });
  });
  afterAll(() => fx && removeWorkspace(fx.root));

  it.skipIf(!node)('nx run generates through both', () => {
    const run = fx.tryNx('run-many', '-t', 'generate-api-client', '-p', 'generated-w-client', 'generated-p-client', '--skip-nx-cache');
    expect(run.output).not.toContain('could not be loaded');
    expect(run.ok).toBe(true);
    expect(readFileSync(join(fx.root, 'libs/generated/w-client/types/src/generated/model/thing.ts'), 'utf-8')).toContain('"from-workspace-ts"');
    expect(readFileSync(join(fx.root, 'libs/generated/p-client/types/src/generated/model/thing.ts'), 'utf-8')).toContain('"from-npm-ts"');
  });
});

describe('M3: modules outside the workspace are rejected (no cache input possible)', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('m3');
    write(fx.root, '../m3-outside/adapter.ts', "export default { apiVersion: 1, id: 'out', generate() {}, classify() { return { models: [], apis: [], core: [] }; } };\n");
    write(fx.root, '../m3-outside/hook.ts', "export default { apiVersion: 1, id: 'hook', transform: (files: unknown[]) => files };\n");
    commitClient(fx.root, 'generated/o-client');
    commitClient(fx.root, 'generated/t-client');
    fx.clients({
      adapters: { out: { module: '../m3-outside/adapter.ts' } },
      clients: { 'generated/o-client': { adapter: 'out' }, 'generated/t-client': { pipeline: { transforms: ['../m3-outside/hook.ts'] } } },
    });
  });
  afterAll(() => {
    removeWorkspace(fx.root);
    removeWorkspace(join(fx.root, '../m3-outside'));
  });

  it('adapter and transform modules outside the workspace root: problem, no generate target', () => {
    const adapter = fx.project('generated-o-client');
    expect(adapter.metadata.openapi.problem).toBe('adapters.out: ../m3-outside/adapter.ts is outside the workspace (no cache input possible)');
    expect(adapter.targets['generate-api-client']).toBeUndefined();
    const transform = fx.project('generated-t-client');
    expect(transform.metadata.openapi.problem).toBe('pipeline.transforms: ../m3-outside/hook.ts is outside the workspace (no cache input possible)');
  });
});

describe('M4: client and testing generation in parallel with overlays do not share the effective spec', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('m4');
    write(fx.root, 'tools/gen.mjs', GENERATOR);
    commitClient(fx.root, 'generated/r-client', ['types', 'api', 'core', 'testing']);
    write(fx.root, 'libs/generated/r-client/testing/project.json', JSON.stringify({ name: 'generated-r-client-testing', tags: ['scope:shared', 'type:testing'] }));
    write(fx.root, 'libs/generated/r-client/overlays/title.yaml', 'overlay: 1.0.0\ninfo: { title: t, version: 1.0.0 }\nactions:\n  - target: $.info\n    update: { title: Overlaid }\n');
    fx.clients({
      settings: { features: { overlays: true } },
      adapters: { cmd: COMMAND_ADAPTER },
      clients: { 'generated/r-client': { adapter: 'cmd', pipeline: { overlays: ['overlays/title.yaml'] } } },
    });
  });
  afterAll(() => removeWorkspace(fx.root));

  it('each preset writes its own effective spec (tmp/openapi/<client>/<preset>/spec)', () => {
    const run = fx.tryNx('run-many', '-t', 'generate-api-client', 'generate-api-testing', '--parallel=2', '--skip-nx-cache');
    expect(run.ok).toBe(true);
    expect(existsSync(join(fx.root, 'tmp/openapi/generated/r-client/client/spec/openapi.yaml'))).toBe(true);
    expect(existsSync(join(fx.root, 'tmp/openapi/generated/r-client/testing/spec/openapi.yaml'))).toBe(true);
  });
});

describe('L5: renamed targets (plugin options) keep dependsOn working', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('l5');
    const nxJson = JSON.parse(readFileSync(join(fx.root, 'nx.json'), 'utf-8'));
    nxJson.plugins = nxJson.plugins.map((plugin: unknown) =>
      plugin === '@mo-transfer/tooling-openapi/plugin'
        ? { plugin, options: { clientTargetName: 'codegen', testingTargetName: 'codegen-testing', updateSpecTargetName: 'refresh-spec' } }
        : plugin,
    );
    write(fx.root, 'nx.json', JSON.stringify(nxJson, null, 2));
    write(fx.root, 'specs/things.yaml', THINGS_SPEC);
    fx.clients({ clients: {} });
    fx.nx('g', '@mo-transfer/tooling-openapi:client', 'l-client', '--spec=specs/things.yaml', '--adapter=hey-api');
  });
  afterAll(() => removeWorkspace(fx.root));

  it('the generator rewrites the targetDefaults dependsOn (^generate-api-client → ^codegen); every lib target waits for the renamed ones', () => {
    const nxJson = JSON.parse(readFileSync(join(fx.root, 'nx.json'), 'utf-8'));
    for (const target of ['lint', 'typecheck', 'build', 'test']) {
      expect(nxJson.targetDefaults[target].dependsOn).toEqual(expect.arrayContaining(['^codegen', '^codegen-testing']));
      expect(nxJson.targetDefaults[target].dependsOn).not.toContain('^generate-api-client');
    }
    const api = fx.project('generated-l-client-api');
    expect(api.targets.typecheck.dependsOn).toEqual(['^codegen', '^codegen-testing']);
    expect(fx.project('generated-l-client-testing').targets.lint.dependsOn).toEqual(['codegen-testing', '^codegen', '^codegen-testing']);
    expect(Object.keys(fx.project('generated-l-client').targets).sort()).toEqual(['codegen', 'refresh-spec']);
    // the task graph: typecheck of the api lib runs the client's codegen first
    const graph = JSON.parse(fx.nx('run', 'generated-l-client-api:typecheck', '--graph=stdout'));
    expect(Object.keys(graph.tasks.tasks)).toContain('generated-l-client:codegen');
  });
});
