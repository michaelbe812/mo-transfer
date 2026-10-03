import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ClientsConfig } from './config';
import {
  clientPartConfig,
  clientPartEdges,
  clientProjectJson,
  createInferenceContext,
  generateTarget,
  generateTestingTarget,
  inferClientTargets,
  schemaPathFor,
  toolingMode,
} from './project-config';

const INDEX = "export * from './generated';\n";
const REPO_ROOT = join(__dirname, '../../../..');
const SRC = relative(REPO_ROOT, __dirname);

describe('client config (project.json of clients and parts, inferred targets)', () => {
  let root: string;
  const write = (path: string, content = ''): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const exists = (path: string): boolean => existsSync(join(root, path));
  const client = (clientPath: string, parts = ['types', 'api', 'core', 'testing'], spec = 'openapi.yaml'): void => {
    write(`libs/${clientPath}/${spec}`, 'openapi: 3.0.3\n');
    write(`libs/${clientPath}/project.json`, '{}');
    for (const part of parts) {
      write(`libs/${clientPath}/${part}/src/index.ts`, INDEX);
      write(`libs/${clientPath}/${part}/project.json`, '{}');
    }
  };
  const context = (config: ClientsConfig, workspaceRoot = root) => createInferenceContext(workspaceRoot, config, exists);

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openapi-config-'));
    // installed packages (only those become externalDependencies, M1)
    const installed = ['typescript', 'yaml', 'orval', 'openapi-typescript', 'prettier', '@acme/transform', '@openapitools/openapi-generator-cli', '@hey-api/openapi-ts'];
    for (const name of installed) write(`node_modules/${name}/package.json`, '{}');
    write('package.json', JSON.stringify({ devDependencies: Object.fromEntries(installed.map((name) => [name, '1.0.0'])) }));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('client project.json: name + tags only', () => {
    expect(clientProjectJson('generated/pet-client')).toEqual({
      name: 'generated-pet-client',
      $schema: '../../../node_modules/nx/schemas/project-schema.json',
      projectType: 'library',
      tags: ['scope:shared', 'generated'],
    });
    const booking = clientProjectJson('booking/generated/booking-client');
    expect(booking['$schema']).toBe('../../../../node_modules/nx/schemas/project-schema.json');
    expect(booking['tags']).toEqual(['scope:booking', 'generated']);
    expect(() => clientProjectJson('pet-client')).toThrow(
      'openapi-clients.json → "pet-client": not a client path (generated/<name> or <domain>/generated/<name>)',
    );
  });

  it('generate-api-client: spec, json fields, part index files, tooling sources (in the repo), adapter inputs', () => {
    client('generated/pet-client');
    const config: ClientsConfig = { defaultAdapter: 'openapi-tools', clients: { 'generated/pet-client': { url: 'https://x' } } };
    const target = generateTarget(context(config, REPO_ROOT), 'generated/pet-client', 'libs/generated/pet-client/openapi.yaml');
    expect(target).toEqual({
      executor: '@mo-transfer/tooling-openapi:generate',
      cache: true,
      inputs: [
        '{workspaceRoot}/libs/generated/pet-client/openapi.yaml',
        { json: '{workspaceRoot}/openapi-clients.json', fields: ['defaultAdapter', 'settings', 'clients.generated/pet-client'] },
        '{workspaceRoot}/libs/generated/pet-client/types/src/index.ts',
        '{workspaceRoot}/libs/generated/pet-client/api/src/index.ts',
        '{workspaceRoot}/libs/generated/pet-client/core/src/index.ts',
        ...[
          ...['barrel', 'client-preset', 'glob', 'jsonpath', 'overlay', 'run-process', 'runner', 'spec', 'split', 'transform'].map((name) => `pipeline/${name}.ts`),
          'registry/**/*',
          'executors/**/*',
          'plugin/**/*',
          'adapter.ts',
          'config.ts',
          'errors.ts',
          'facade.ts',
          'settings.ts',
          'project-config.ts',
          'adapters/**/*',
        ].map((source) => `{workspaceRoot}/${SRC}/${source}`),
        `!{workspaceRoot}/${SRC}/**/*.spec.ts`,
        '{workspaceRoot}/openapitools.json',
        { externalDependencies: ['@openapitools/openapi-generator-cli', 'typescript', 'yaml'] },
        { runtime: 'java -version 2>&1' },
      ],
      outputs: ['{projectRoot}/types/src/generated', '{projectRoot}/api/src/generated', '{projectRoot}/core/src/generated'],
      options: { client: 'generated/pet-client' },
      metadata: { description: 'OpenAPI client code (adapter openapi-tools) → types, api, core' },
    });
  });

  it('consumer adapter + pipeline: module folder, adapter json field, overlays, transforms, prettier, merged-core outputs', () => {
    client('booking/generated/booking-client', ['types', 'api'], 'openapi.json');
    write('tools/orval/orval.ts', '');
    write('tools/hooks/strip.ts', '');
    const config: ClientsConfig = {
      settings: { features: { overlays: true } },
      adapters: { orval: { module: './tools/orval/orval.ts', packages: ['orval'], runtime: ['node -v'] } },
      clients: {
        'booking/generated/booking-client': {
          adapter: 'orval',
          layout: 'merged-core',
          pipeline: { overlays: ['overlays/a.yaml'], transforms: ['./tools/hooks/strip.ts', { module: '@acme/transform' }], format: true },
        },
      },
    };
    const target = generateTarget(context(config), 'booking/generated/booking-client', 'libs/booking/generated/booking-client/openapi.json');
    expect(target['inputs']).toEqual([
      '{workspaceRoot}/libs/booking/generated/booking-client/openapi.json',
      '{workspaceRoot}/libs/booking/generated/booking-client/overlays/a.yaml',
      {
        json: '{workspaceRoot}/openapi-clients.json',
        fields: ['defaultAdapter', 'settings', 'adapters.orval', 'clients.booking/generated/booking-client'],
      },
      '{workspaceRoot}/libs/booking/generated/booking-client/types/src/index.ts',
      '{workspaceRoot}/libs/booking/generated/booking-client/api/src/index.ts',
      '{workspaceRoot}/tools/orval/**/*',
      '{workspaceRoot}/tools/hooks/**/*',
      '{workspaceRoot}/.prettierrc*',
      '{workspaceRoot}/.editorconfig',
      // tmp root: the tooling lives outside → no tooling files (toolingInputs auto → none)
      { externalDependencies: ['orval', '@acme/transform', 'prettier', 'typescript', 'yaml'] },
      { runtime: 'node -v' },
    ]);
    expect(target['outputs']).toEqual(['{projectRoot}/types/src/generated', '{projectRoot}/api/src/generated']);
  });

  it('npm package adapter: externalDependency on the package; tooling inputs by location (source / package / none)', () => {
    client('generated/pet-client');
    write('node_modules/@acme/openapi-adapter/package.json', '{"name":"@acme/openapi-adapter"}');
    write('node_modules/@mo-transfer/tooling-openapi/package.json', '{}');
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    manifest.devDependencies['@acme/openapi-adapter'] = '1.0.0';
    manifest.devDependencies['@mo-transfer/tooling-openapi'] = '1.0.0';
    write('package.json', JSON.stringify(manifest));
    const config: ClientsConfig = {
      adapters: { acme: { module: '@acme/openapi-adapter/sub' } },
      clients: { 'generated/pet-client': { adapter: 'acme' } },
    };
    const inputs = generateTarget(context(config), 'generated/pet-client', 'libs/generated/pet-client/openapi.yaml')['inputs'];
    expect(inputs).toContainEqual({ externalDependencies: ['@acme/openapi-adapter', '@mo-transfer/tooling-openapi', 'typescript', 'yaml'] });
    expect(toolingMode(REPO_ROOT)).toBe('source');
    write('package.json', '{}');
    expect(toolingMode(root)).toBe('none');
    // a symlinked install outside the workspace: a registry version in the root manifest = npm package
    write('package.json', JSON.stringify({ devDependencies: { '@mo-transfer/tooling-openapi': '0.1.0' } }));
    expect(toolingMode(root)).toBe('package');
    write('package.json', JSON.stringify({ devDependencies: { '@mo-transfer/tooling-openapi': 'workspace:*' } }));
    expect(toolingMode(root)).toBe('none');
    expect(schemaPathFor(REPO_ROOT)).toBe(`./${relative(REPO_ROOT, join(__dirname, '..'))}/openapi-clients.schema.json`);
    expect(schemaPathFor('/does/not/exist')).toBe('./node_modules/@mo-transfer/tooling-openapi/openapi-clients.schema.json');
  });

  it('declared but not installed packages stay out of externalDependencies and are reported (M1)', () => {
    client('generated/pet-client');
    rmSync(join(root, 'node_modules/prettier'), { recursive: true });
    write('node_modules/@acme/undeclared/package.json', '{}');
    const config: ClientsConfig = { clients: { 'generated/pet-client': { pipeline: { format: true, transforms: ['@acme/missing', '@acme/undeclared'] } } } };
    const { targets, metadata } = inferClientTargets(context(config), 'generated/pet-client');
    // not installed, installed but undeclared (not in the lockfile) — both would fail Nx' hasher
    expect(metadata.missingPackages).toEqual(['@acme/missing', '@acme/undeclared', 'prettier']);
    expect(targets['libs/generated/pet-client']['generate-api-client']['inputs']).toContainEqual({
      externalDependencies: ['@openapitools/openapi-generator-cli', 'typescript', 'yaml'],
    });
  });

  it('L6: narrow tooling inputs — testing-only code (schema-faker, testing preset) never re-generates the client code, adapters never the testing lib', () => {
    client('generated/pet-client');
    const config: ClientsConfig = { clients: { 'generated/pet-client': {} } };
    const ctx = context(config, REPO_ROOT);
    const files = (inputs: unknown) => (inputs as unknown[]).filter((input): input is string => typeof input === 'string' && input.includes(SRC));
    const clientInputs = files(generateTarget(ctx, 'generated/pet-client', 'x.yaml')['inputs']);
    const testing = files(generateTestingTarget(ctx, 'generated/pet-client', 'x.yaml')['inputs']);
    const covers = (inputs: string[], file: string) =>
      inputs.some((input) => !input.startsWith('!') && new RegExp(`^${input.replace('{workspaceRoot}/', '').replace(/[.]/g, '\\.').replace('**/*', '.*')}$`).test(`${SRC}/${file}`));
    for (const file of ['pipeline/schema-faker/mocks.ts', 'pipeline/schema-faker/runtime/mock-runtime.ts', 'pipeline/testing-preset.ts']) {
      expect(covers(clientInputs, file)).toBe(false);
      expect(covers(testing, file)).toBe(true);
    }
    for (const file of ['pipeline/runner.ts', 'pipeline/split.ts', 'registry/registry.ts', 'facade.ts']) {
      expect(covers(clientInputs, file)).toBe(true);
      expect(covers(testing, file)).toBe(true);
    }
    expect(covers(clientInputs, 'adapters/hey-api.ts')).toBe(true);
    expect(covers(testing, 'adapters/hey-api.ts')).toBe(false);
    expect(covers(clientInputs, 'pipeline/client-preset.ts')).toBe(true);
    expect(covers(testing, 'pipeline/client-preset.ts')).toBe(false);
  });

  it('M3: testing target runs adapters/files.ts (readRawFiles) — an input; package mode includes yaml', () => {
    client('generated/pet-client');
    const config: ClientsConfig = { clients: { 'generated/pet-client': {} } };
    const inputs = generateTestingTarget(context(config, REPO_ROOT), 'generated/pet-client', 'x.yaml')['inputs'] as unknown[];
    expect(inputs).toContain(`{workspaceRoot}/${SRC}/adapters/files.ts`);
    write('node_modules/@mo-transfer/tooling-openapi/package.json', '{}');
    const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
    write('package.json', JSON.stringify({ devDependencies: { ...manifest.devDependencies, '@mo-transfer/tooling-openapi': '1.0.0' } }));
    const packageMode: ClientsConfig = { clients: { 'generated/pet-client': {} } };
    expect(generateTarget(context(packageMode), 'generated/pet-client', 'x.yaml')['inputs']).toContainEqual({
      externalDependencies: ['@openapitools/openapi-generator-cli', '@mo-transfer/tooling-openapi', 'typescript', 'yaml'],
    });
  });

  it('generate-api-testing: spec, overlays, pipeline field, testing packages — independent of the adapter', () => {
    client('generated/pet-client');
    const config: ClientsConfig = {
      settings: { features: { overlays: true } },
      clients: { 'generated/pet-client': { adapter: 'hey-api', pipeline: { overlays: ['o.yaml'] } } },
    };
    expect(generateTestingTarget(context(config), 'generated/pet-client', 'libs/generated/pet-client/openapi.yaml')).toEqual({
      executor: '@mo-transfer/tooling-openapi:generate-testing',
      cache: true,
      inputs: [
        '{workspaceRoot}/libs/generated/pet-client/openapi.yaml',
        '{workspaceRoot}/libs/generated/pet-client/o.yaml',
        { json: '{workspaceRoot}/openapi-clients.json', fields: ['settings', 'clients.generated/pet-client.pipeline'] },
        { externalDependencies: ['openapi-typescript', 'yaml', 'typescript'] },
      ],
      outputs: ['{projectRoot}/src/generated'],
      options: { client: 'generated/pet-client' },
      metadata: { description: 'OpenAPI testing lib (openapi-typescript, schema-faker msw mocks, openapi-msw)' },
    });
    // orval (deprecated) only in its mode: per client or as workspace default
    const orval: ClientsConfig = { clients: { 'generated/pet-client': { pipeline: { testing: { mocks: 'orval' } } } } };
    expect(generateTestingTarget(context(orval), 'generated/pet-client', 'x.yaml')['inputs']).toContainEqual({
      externalDependencies: ['openapi-typescript', 'orval', 'yaml', 'typescript'],
    });
    const workspaceOrval: ClientsConfig = { settings: { testing: { mocks: 'orval' } }, clients: { 'generated/pet-client': {} } };
    expect(generateTestingTarget(context(workspaceOrval), 'generated/pet-client', 'x.yaml')['metadata']).toEqual({
      description: 'OpenAPI testing lib (openapi-typescript, orval msw mocks, openapi-msw)',
    });
    const unknown = { clients: { 'generated/pet-client': { pipeline: { testing: { mocks: 'nope' } } } } } as unknown as ClientsConfig;
    expect(inferClientTargets(context(unknown), 'generated/pet-client').metadata.problem).toBe('unknown mocks engine "nope" (schema-faker | orval)');
  });

  it('inferClientTargets: client + testing lib, target names, metadata; testing: false / no testing project → none', () => {
    client('generated/pet-client');
    client('generated/lean-client', ['types', 'api']);
    const config: ClientsConfig = {
      clients: { 'generated/pet-client': {}, 'generated/lean-client': { layout: 'merged-core', pipeline: { testing: false } } },
    };
    const named = createInferenceContext(root, config, exists, { client: 'codegen', testing: 'codegen-testing', updateSpec: 'refresh' });
    const pet = inferClientTargets(named, 'generated/pet-client');
    expect(Object.keys(pet.targets)).toEqual(['libs/generated/pet-client', 'libs/generated/pet-client/testing']);
    expect(Object.keys(pet.targets['libs/generated/pet-client'])).toEqual(['refresh', 'codegen']);
    expect(Object.keys(pet.targets['libs/generated/pet-client/testing'])).toEqual(['codegen-testing']);
    expect(pet.metadata).toEqual({
      adapter: 'openapi-tools',
      adapterSource: 'builtin',
      layout: 'default',
      testing: true,
      mocks: 'schema-faker',
      parts: ['types', 'api', 'core', 'testing'],
    });
    const lean = inferClientTargets(context(config), 'generated/lean-client');
    expect(Object.keys(lean.targets)).toEqual(['libs/generated/lean-client']);
    expect(lean.metadata).toMatchObject({ layout: 'merged-core', testing: false, parts: ['types', 'api'] });
  });

  it('overlays with the feature flag off: no cache inputs, target kept (it fails with a hint), disabledFeatures in the metadata', () => {
    client('generated/pet-client');
    const config: ClientsConfig = { clients: { 'generated/pet-client': { pipeline: { overlays: ['o.yaml'] } } } };
    const { targets, metadata } = inferClientTargets(context(config), 'generated/pet-client');
    expect(metadata.disabledFeatures).toEqual(['overlays']);
    expect(targets['libs/generated/pet-client']['generate-api-client']['inputs']).not.toContain('{workspaceRoot}/libs/generated/pet-client/o.yaml');
    expect(targets['libs/generated/pet-client/testing']['generate-api-testing']['inputs']).not.toContain('{workspaceRoot}/libs/generated/pet-client/o.yaml');
    expect(inferClientTargets(context({ clients: { 'generated/pet-client': {} } }), 'generated/pet-client').metadata.disabledFeatures).toBeUndefined();
  });

  it('broken entries: only update-spec + the problem (bad path, no spec, unknown adapter, missing module)', () => {
    client('generated/odd-client');
    client('generated/gone-client');
    const config: ClientsConfig = {
      adapters: { gone: { module: './tools/gone.ts' } },
      clients: {
        'generated/odd-client': { adapter: 'swagger-codegen' },
        'generated/gone-client': { adapter: 'gone' },
        'generated/nospec-client': {},
        'pet-client': {},
      },
    };
    const problem = (clientPath: string) => inferClientTargets(context(config), clientPath);
    expect(problem('generated/odd-client').metadata.problem).toBe(
      'unknown adapter "swagger-codegen" (known: openapi-tools, hey-api, nx-plugin-openapi, command, gone)',
    );
    expect(problem('generated/odd-client').metadata.adapterSource).toBeUndefined();
    expect(problem('generated/gone-client').metadata.problem).toBe('adapters.gone: ./tools/gone.ts not found (relative to the workspace root)');
    expect(problem('generated/nospec-client').metadata.problem).toBe(
      'libs/generated/nospec-client needs exactly one spec file (openapi.yaml | openapi.json), found none',
    );
    expect(problem('pet-client').metadata.problem).toContain('not a client path');
    expect(Object.keys(problem('generated/odd-client').targets['libs/generated/odd-client'])).toEqual(['update-spec']);
  });

  it('part libs: edges to the client (+ parts below), the testing part generates before lint/typecheck', () => {
    client('booking/generated/booking-client');
    const clientPath = 'booking/generated/booking-client';
    expect(clientPartConfig(exists, clientPath, 'types')).toEqual({
      implicitDependencies: ['booking-generated-booking-client'],
      peerDependencies: {},
    });
    expect(clientPartConfig(exists, clientPath, 'api').implicitDependencies).toEqual([
      'booking-generated-booking-client',
      'booking-generated-booking-client-types',
      'booking-generated-booking-client-core',
    ]);
    expect(clientPartConfig(exists, clientPath, 'core').implicitDependencies).toEqual([
      'booking-generated-booking-client',
      'booking-generated-booking-client-types',
    ]);
    const dependsOn = ['generate-api-testing', '^generate-api-client', '^generate-api-testing'];
    expect(clientPartConfig(exists, clientPath, 'testing')).toEqual({
      implicitDependencies: ['booking-generated-booking-client'],
      peerDependencies: {},
      targets: { lint: { dependsOn }, typecheck: { dependsOn } },
    });
    const named = clientPartConfig(exists, clientPath, 'testing', { targetNames: { client: 'c', testing: 't', updateSpec: 'u' } });
    expect(named.targets?.lint).toEqual({ dependsOn: ['t', '^c', '^t'] });
  });

  it('edges skip parts that are not committed (merged-core: no core), unknown part → client only', () => {
    client('generated/lean-client', ['types', 'api']);
    expect(clientPartEdges(exists, { path: 'generated/lean-client', part: 'api' })).toEqual([
      'generated-lean-client',
      'generated-lean-client-types',
    ]);
    expect(clientPartEdges(exists, { path: 'generated/lean-client', part: 'docs' })).toEqual(['generated-lean-client']);
  });
});
