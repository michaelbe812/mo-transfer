import { logger, type Tree, updateJson } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlueprintTree, pathsOf, read, readProject } from '@mo-transfer/tooling-conventions/testing';
import { listLibPaths, readJsonFile } from '@mo-transfer/tooling-conventions/tree';
import { clientGenerator, syncTargetDefaults } from './generator';

const SPEC_YAML = `openapi: 3.0.3
info: { title: Demo, version: 1.0.0 }
servers: [{ url: /api }]
paths:
  /things:
    get:
      operationId: listThings
      responses:
        '200': { description: OK }
`;
const clients = (tree: Tree) => JSON.parse(read(tree, 'openapi-clients.json')).clients;
/** the repo's lib scaffold (settings.scaffold) — loaded at run time like in the workspace */
const SCAFFOLD = join(__dirname, '../../../../conventions/src/openapi-scaffold.ts');
const SETTINGS = { scaffold: SCAFFOLD };
const clientsJson = (tree: Tree, config: object) =>
  tree.write('openapi-clients.json', JSON.stringify({ settings: SETTINGS, ...config }));

describe('client generator', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createBlueprintTree();
    clientsJson(tree, { defaultAdapter: 'openapi-tools', clients: {} });
    tree.write('specs/demo.yaml', SPEC_YAML);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates a shared client: spec, four libs with only index.ts, entry', async () => {
    await clientGenerator(tree, { name: 'demo-client', spec: 'specs/demo.yaml', skipFormat: true });

    expect(read(tree, 'libs/generated/demo-client/openapi.yaml')).toBe(SPEC_YAML);
    expect(listLibPaths(tree, 'generated')).toEqual([
      'generated/demo-client/api',
      'generated/demo-client/core',
      'generated/demo-client/testing',
      'generated/demo-client/types',
    ]);
    expect(read(tree, 'libs/generated/demo-client/api/src/index.ts')).toBe("export * from './generated';\n");
    expect(clients(tree)).toEqual({ 'generated/demo-client': {} });
  });

  it('writes the config: client project.json (no targets), part configs with edges, paths entries', async () => {
    await clientGenerator(tree, { name: 'demo-client', spec: 'specs/demo.yaml', skipFormat: true });

    const client = readProject(tree, 'libs/generated/demo-client/project.json');
    expect(client).toMatchObject({ name: 'generated-demo-client', tags: ['scope:shared', 'generated'] });
    // generate-api-client/update-spec: inferred from the entry by the plugin (src/plugin/openapi-clients.ts)
    expect(client.targets).toBeUndefined();

    expect(readJsonFile(tree, 'libs/generated/demo-client/api/project.json')).toMatchObject({
      name: 'generated-demo-client-api',
      tags: ['scope:shared', 'type:data-access', 'feat:none', 'generated'],
      implicitDependencies: ['generated-demo-client', 'generated-demo-client-types', 'generated-demo-client-core'],
      targets: { build: {}, lint: {}, typecheck: {} },
    });
    // gitignored code: no peerDependencies (dist as before)
    expect(readJsonFile(tree, 'libs/generated/demo-client/api/package.json')).toEqual({
      name: '@mo-transfer/generated/demo-client/api',
      version: '0.0.1',
      private: true,
      sideEffects: false,
    });
    const testing = readProject(tree, 'libs/generated/demo-client/testing/project.json');
    // generate-api-testing: inferred by the plugin, lint/typecheck wait for it
    expect(testing.targets['generate-api-testing']).toBeUndefined();
    expect(testing.targets.lint).toEqual({
      dependsOn: ['generate-api-testing', '^generate-api-client', '^generate-api-testing'],
    });
    expect(tree.exists('libs/generated/demo-client/testing/package.json')).toBe(false);

    const paths = pathsOf(tree);
    for (const part of ['api', 'core', 'testing', 'types']) {
      expect(paths[`@mo-transfer/generated/demo-client/${part}`]).toEqual([
        `./libs/generated/demo-client/${part}/src/index.ts`,
      ]);
    }
  });

  it('creates a domain client from a JSON spec, with url and a non-default adapter', async () => {
    tree.write(
      'specs/demo.json',
      JSON.stringify({ openapi: '3.1.0', info: { title: 'x', version: '1' }, paths: { '/x': {} } }),
    );
    await clientGenerator(tree, {
      name: 'booking-client',
      domain: 'booking',
      spec: 'specs/demo.json',
      url: 'https://example.org/openapi.json',
      adapter: 'hey-api',
      skipFormat: true,
    });

    expect(tree.exists('libs/booking/generated/booking-client/openapi.json')).toBe(true);
    expect(clients(tree)).toEqual({
      'booking/generated/booking-client': { url: 'https://example.org/openapi.json', adapter: 'hey-api' },
    });
  });

  it('downloads a URL once and normalizes it to YAML (url = source for update-spec)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ openapi: '3.0.3', info: { title: 't', version: '1' }, paths: { '/p': {} } })),
      ),
    );
    await clientGenerator(tree, { name: 'remote-client', spec: 'https://example.org/api.json', skipFormat: true });

    const spec = read(tree, 'libs/generated/remote-client/openapi.yaml');
    expect(spec).toContain('# Source: https://example.org/api.json');
    expect(spec).toContain('openapi: 3.0.3');
    expect(clients(tree)['generated/remote-client']).toEqual({ url: 'https://example.org/api.json' });
  });

  it('rejects an unknown domain, an existing client, no OpenAPI 3 spec and an unknown adapter', async () => {
    await expect(
      clientGenerator(tree, { name: 'x-client', domain: 'payment', spec: 'specs/demo.yaml' }),
    ).rejects.toThrow('Unknown scope "payment"');
    await clientGenerator(tree, { name: 'demo-client', spec: 'specs/demo.yaml', skipFormat: true });
    await expect(clientGenerator(tree, { name: 'demo-client', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'exists already',
    );
    tree.write('specs/swagger.yaml', 'swagger: "2.0"\npaths: { /x: {} }\n');
    await expect(clientGenerator(tree, { name: 'old-client', spec: 'specs/swagger.yaml' })).rejects.toThrow(
      'not an OpenAPI 3.x spec',
    );
    await expect(
      clientGenerator(tree, { name: 'y-client', spec: 'specs/demo.yaml', adapter: 'swagger-codegen' }),
    ).rejects.toThrow('Unknown adapter');
  });

  it('an existing openapi-clients.json without defaultAdapter: openapi-tools is the default', async () => {
    clientsJson(tree, { clients: {} });
    await clientGenerator(tree, {
      name: 'd-client',
      spec: 'specs/demo.yaml',
      adapter: 'openapi-tools',
      skipFormat: true,
    });
    expect(JSON.parse(read(tree, 'openapi-clients.json'))).toEqual({ settings: SETTINGS, clients: { 'generated/d-client': {} } });
  });

  it.each(['openapi-tools', 'hey-api', 'nx-plugin-openapi', 'command'])(
    'adapter %s: stored unless it is the default',
    async (adapter) => {
      await clientGenerator(tree, { name: 'a-client', spec: 'specs/demo.yaml', adapter, skipFormat: true });
      expect(clients(tree)['generated/a-client']).toEqual(adapter === 'openapi-tools' ? {} : { adapter });
    },
  );

  it('is idempotent: a second run fails before writing anything, the first result stays', async () => {
    await clientGenerator(tree, { name: 'demo-client', spec: 'specs/demo.yaml', skipFormat: true });
    const before = tree.listChanges().map((change) => [change.path, change.content?.toString()]);
    await expect(clientGenerator(tree, { name: 'demo-client', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'exists already',
    );
    expect(tree.listChanges().map((change) => [change.path, change.content?.toString()])).toEqual(before);
  });

  it('validates the name, the entry and the spec', async () => {
    await expect(clientGenerator(tree, { name: 'DemoClient', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'Client "DemoClient" must be kebab-case',
    );
    await expect(clientGenerator(tree, { name: 'generated', spec: 'specs/demo.yaml' })).rejects.toThrow(
      '"generated" is reserved.',
    );
    // entry left over without folder
    clientsJson(tree, { clients: { 'generated/stale-client': {} } });
    await expect(clientGenerator(tree, { name: 'stale-client', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'openapi-clients.json has an entry "generated/stale-client" already',
    );
    tree.write('specs/broken.yaml', 'openapi: [3\n');
    await expect(clientGenerator(tree, { name: 'b-client', spec: 'specs/broken.yaml' })).rejects.toThrow(
      'specs/broken.yaml: no valid YAML/JSON',
    );
    tree.write('specs/empty.yaml', '');
    await expect(clientGenerator(tree, { name: 'e-client', spec: 'specs/empty.yaml' })).rejects.toThrow(
      'not an OpenAPI 3.x spec',
    );
    tree.write('specs/paths-missing.yaml', 'openapi: 3.0.3\n');
    await expect(clientGenerator(tree, { name: 'm-client', spec: 'specs/paths-missing.yaml' })).rejects.toThrow(
      'not an OpenAPI 3.x spec',
    );
    tree.write('specs/no-paths.yaml', 'openapi: 3.0.3\npaths: {}\n');
    await expect(clientGenerator(tree, { name: 'p-client', spec: 'specs/no-paths.yaml' })).rejects.toThrow(
      'not an OpenAPI 3.x spec with at least one path',
    );
  });

  it('domain "shared" = shared client; a domain path that is no client path is rejected', async () => {
    await clientGenerator(tree, { name: 'demo-client', domain: 'shared', spec: 'specs/demo.yaml', skipFormat: true });
    expect(clients(tree)).toEqual({ 'generated/demo-client': {} });

    // without scope list any slice folder counts as domain — a nested one yields no client path
    tree.delete('lib-scopes.json');
    tree.write('libs/a/b/types/src/index.ts', 'export {};\n');
    await expect(clientGenerator(tree, { name: 'x-client', domain: 'a/b', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'Domain "a/b" must be kebab-case',
    );
  });

  it('spec from a file outside the tree (absolute or workspace-relative), newline added', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'client-spec-'));
    try {
      writeFileSync(join(dir, 'abs.yaml'), SPEC_YAML.trimEnd());
      await clientGenerator(tree, { name: 'abs-client', spec: join(dir, 'abs.yaml'), skipFormat: true });
      expect(read(tree, 'libs/generated/abs-client/openapi.yaml')).toBe(SPEC_YAML);

      // relative, not in the tree: read from disk below tree.root
      const relative = join('..', 'abs.yaml');
      const treeInTmp = createBlueprintTree();
      clientsJson(treeInTmp, { clients: {} });
      Object.defineProperty(treeInTmp, 'root', { value: join(dir, 'ws') });
      await clientGenerator(treeInTmp, { name: 'rel-client', spec: relative, skipFormat: true });
      expect(read(treeInTmp, 'libs/generated/rel-client/openapi.yaml')).toBe(SPEC_YAML);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('URL: download errors are reported, an explicit url wins as update source', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 404 })),
    );
    await expect(clientGenerator(tree, { name: 'r-client', spec: 'https://example.org/missing.json' })).rejects.toThrow(
      'GET https://example.org/missing.json: 404',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('openapi: 3.0.3\ninfo: { title: t, version: "1" }\npaths: { /p: {} }\n')),
    );
    await clientGenerator(tree, {
      name: 'r-client',
      spec: 'https://mirror.example.org/api.yaml',
      url: 'https://example.org/api.yaml',
      skipFormat: true,
    });
    expect(read(tree, 'libs/generated/r-client/openapi.yaml')).toContain('# Source: https://example.org/api.yaml');
    expect(clients(tree)['generated/r-client']).toEqual({ url: 'https://example.org/api.yaml' });
  });

  it('a file spec with an explicit url: the file is committed as is, the url is the update source', async () => {
    await clientGenerator(tree, {
      name: 'f-client',
      spec: 'specs/demo.yaml',
      url: 'https://example.org/f.yaml',
      skipFormat: true,
    });
    expect(read(tree, 'libs/generated/f-client/openapi.yaml')).toBe(SPEC_YAML);
    expect(clients(tree)['generated/f-client']).toEqual({ url: 'https://example.org/f.yaml' });
  });

  it('formats (formatFiles) and tells how to generate and use the client', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const callback = await clientGenerator(tree, { name: 'demo-client', domain: 'booking', spec: 'specs/demo.yaml' });
    callback();
    expect(info.mock.calls.map(([message]) => message)).toEqual([
      'Client booking-generated-demo-client: libs/booking/generated/demo-client/{openapi.yaml,project.json,types,api,core,testing}, paths in tsconfig.base.json, entry in openapi-clients.json.',
      'Generate: nx run-many -t generate-api-client generate-api-testing (build/lint/test/typecheck do it on their own).',
      'Use: @mo-transfer/booking/generated/demo-client/api (services) + /types in the booking data-access layer, specs: @mo-transfer/booking/generated/demo-client/testing (demoClientHandlers, demoClientHttp).',
    ]);
    await clientGenerator(tree, { name: 'shared-client', spec: 'specs/demo.yaml', skipFormat: true }).then((done) =>
      done(),
    );
    expect(info).toHaveBeenLastCalledWith(expect.stringContaining('in the shared data-access layer'));
    info.mockRestore();
  });
  it('layout merged-core: no core lib, api edges without core; testing: false: no testing lib, entry pipeline.testing', async () => {
    await clientGenerator(tree, { name: 'lean-client', spec: 'specs/demo.yaml', layout: 'merged-core', testing: false, skipFormat: true });
    expect(listLibPaths(tree, 'generated')).toEqual(['generated/lean-client/api', 'generated/lean-client/types']);
    expect(clients(tree)['generated/lean-client']).toEqual({ layout: 'merged-core', pipeline: { testing: false } });
    expect(readProject(tree, 'libs/generated/lean-client/api/project.json').implicitDependencies).toEqual([
      'generated-lean-client',
      'generated-lean-client-types',
    ]);
    expect(Object.keys(pathsOf(tree)).filter((alias) => alias.includes('lean-client'))).toEqual([
      '@mo-transfer/generated/lean-client/api',
      '@mo-transfer/generated/lean-client/types',
    ]);
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    (await clientGenerator(tree, { name: 'other-client', spec: 'specs/demo.yaml', testing: false, skipFormat: true }))();
    expect(info).toHaveBeenLastCalledWith('Use: @mo-transfer/generated/other-client/api (services) + /types in the shared data-access layer.');
    info.mockRestore();
  });

  it('consumer adapters (openapi-clients.json → adapters) are known; plugin options in nx.json rename the testing dependsOn', async () => {
    clientsJson(tree, { adapters: { orval: { module: './tools/orval.ts' } }, clients: {} });
    updateJson(tree, 'nx.json', (nxJson) => ({
      ...nxJson,
      plugins: [{ plugin: '@mo-transfer/tooling-openapi/plugin', options: { clientTargetName: 'codegen', testingTargetName: 'codegen-testing' } }],
    }));
    await clientGenerator(tree, { name: 'o-client', spec: 'specs/demo.yaml', adapter: 'orval', skipFormat: true });
    expect(clients(tree)['generated/o-client']).toEqual({ adapter: 'orval' });
    expect(readProject(tree, 'libs/generated/o-client/testing/project.json').targets.lint).toEqual({
      dependsOn: ['codegen-testing', '^codegen', '^codegen-testing'],
    });
  });

  it('a scaffold that cannot be loaded or is no scaffold: error before anything is written', async () => {
    clientsJson(tree, { settings: { scaffold: './nowhere.ts' }, clients: {} });
    await expect(clientGenerator(tree, { name: 'x-client', spec: 'specs/demo.yaml' })).rejects.toThrow('scaffold ./nowhere.ts: ./nowhere.ts not found');
    clientsJson(tree, { settings: { scaffold: join(__dirname, 'schema.json') }, clients: {} });
    await expect(clientGenerator(tree, { name: 'x-client', spec: 'specs/demo.yaml' })).rejects.toThrow('apiVersion undefined not supported (this package implements 1)');
    expect(tree.exists('libs/generated/x-client')).toBe(false);
  });
});

describe('client generator with the built-in scaffold (no settings.scaffold)', () => {
  it('project.json (settings.partTags, edges, testing dependsOn) + tsconfig.json + paths; domain = an existing folder', async () => {
    const tree = createTreeWithEmptyWorkspace();
    tree.write('tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: { '@x/z': ['./z.ts'] } } }));
    tree.write('libs/booking/README.md', '');
    tree.write('specs/demo.yaml', SPEC_YAML);
    await clientGenerator(tree, { name: 'demo-client', domain: 'booking', spec: 'specs/demo.yaml', skipFormat: true });
    expect(readJsonFile(tree, 'libs/booking/generated/demo-client/api/project.json')).toEqual({
      name: 'booking-generated-demo-client-api',
      $schema: '../../../../../node_modules/nx/schemas/project-schema.json',
      projectType: 'library',
      sourceRoot: 'libs/booking/generated/demo-client/api/src',
      tags: ['scope:booking', 'type:data-access', 'feat:none', 'generated'],
      implicitDependencies: ['booking-generated-demo-client', 'booking-generated-demo-client-types', 'booking-generated-demo-client-core'],
    });
    expect(readJsonFile(tree, 'libs/booking/generated/demo-client/testing/project.json')['targets']).toEqual({
      lint: { dependsOn: ['generate-api-testing', '^generate-api-client', '^generate-api-testing'] },
      typecheck: { dependsOn: ['generate-api-testing', '^generate-api-client', '^generate-api-testing'] },
    });
    expect(readJsonFile(tree, 'libs/booking/generated/demo-client/types/tsconfig.json')).toEqual({
      extends: '../../../../../tsconfig.base.json',
      include: ['src/**/*.ts'],
    });
    expect(Object.keys(pathsOf(tree))).toEqual([
      '@mo-transfer/booking/generated/demo-client/api',
      '@mo-transfer/booking/generated/demo-client/core',
      '@mo-transfer/booking/generated/demo-client/testing',
      '@mo-transfer/booking/generated/demo-client/types',
      '@x/z',
    ]);
    expect(JSON.parse(read(tree, 'openapi-clients.json')).$schema).toMatch(/openapi-clients\.schema\.json$/);
    await expect(clientGenerator(tree, { name: 'x-client', domain: 'payment', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'Domain "payment" has no folder libs/payment',
    );
    await expect(clientGenerator(tree, { name: 'x-client', domain: 'Pay', spec: 'specs/demo.yaml' })).rejects.toThrow(
      'Domain "Pay" must be kebab-case',
    );
    // no tsconfig.base.json: no paths entry, no error
    tree.delete('tsconfig.base.json');
    await clientGenerator(tree, { name: 'y-client', spec: 'specs/demo.yaml', skipFormat: true });
    expect(tree.exists('tsconfig.base.json')).toBe(false);
  });
});

describe('syncTargetDefaults (L5)', () => {
  const names = { client: 'codegen', testing: 'codegen-testing', updateSpec: 'update-spec' };
  it('rewrites object and list target defaults, leaves the rest; default names or no targetDefaults: no change', () => {
    const tree = createTreeWithEmptyWorkspace();
    updateJson(tree, 'nx.json', (nxJson) => ({
      ...nxJson,
      targetDefaults: {
        lint: { dependsOn: ['^generate-api-client', '^generate-api-testing', '^build'] },
        test: [{ dependsOn: ['^generate-api-client', '^codegen'] }, { cache: true }],
        build: { cache: true },
      },
    }));
    const before = read(tree, 'nx.json');
    syncTargetDefaults(tree, { client: 'generate-api-client', testing: 'generate-api-testing', updateSpec: 'update-spec' });
    expect(read(tree, 'nx.json')).toBe(before);
    syncTargetDefaults(tree, names);
    const { targetDefaults } = JSON.parse(read(tree, 'nx.json'));
    expect(targetDefaults.lint.dependsOn).toEqual(['^codegen', '^codegen-testing', '^build']);
    expect(targetDefaults.test[0].dependsOn).toEqual(['^codegen']);
    const after = read(tree, 'nx.json');
    syncTargetDefaults(tree, names);
    expect(read(tree, 'nx.json')).toBe(after);
    updateJson(tree, 'nx.json', ({ targetDefaults: _, ...rest }) => rest);
    expect(() => syncTargetDefaults(tree, names)).not.toThrow();
  });
});
