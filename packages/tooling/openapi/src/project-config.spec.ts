import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
import { DEFAULT_SETTINGS, resolveSettings } from './settings';

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
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('client project.json: name + tags only (settings.clientTags)', () => {
    expect(clientProjectJson('generated/pet-client')).toEqual({
      name: 'generated-pet-client',
      $schema: '../../../node_modules/nx/schemas/project-schema.json',
      projectType: 'library',
      tags: ['scope:shared', 'generated'],
    });
    const booking = clientProjectJson('booking/generated/booking-client', resolveSettings({ clientTags: ['scope:{scope}', 'api'] }));
    expect(booking['$schema']).toBe('../../../../node_modules/nx/schemas/project-schema.json');
    expect(booking['tags']).toEqual(['scope:booking', 'api']);
    expect(() => clientProjectJson('pet-client')).toThrow(
      'openapi-clients.json → "pet-client": not a client path (generated/<client> or <domain>/generated/<client>)',
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
          'pipeline/**/*',
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

  it('npm package adapter: externalDependency on the package; toolingInputs package / none / source', () => {
    client('generated/pet-client');
    write('node_modules/@acme/openapi-adapter/package.json', '{"name":"@acme/openapi-adapter"}');
    const config: ClientsConfig = {
      settings: { toolingInputs: 'package' },
      adapters: { acme: { module: '@acme/openapi-adapter/sub' } },
      clients: { 'generated/pet-client': { adapter: 'acme' } },
    };
    const inputs = generateTarget(context(config), 'generated/pet-client', 'libs/generated/pet-client/openapi.yaml')['inputs'];
    expect(inputs).toContainEqual({ externalDependencies: ['@acme/openapi-adapter', '@mo-transfer/tooling-openapi', 'typescript'] });
    expect(toolingMode(resolveSettings({ toolingInputs: 'none' }), REPO_ROOT)).toBe('none');
    expect(toolingMode(DEFAULT_SETTINGS, REPO_ROOT)).toBe('source');
    expect(toolingMode(DEFAULT_SETTINGS, root)).toBe('none');
    expect(schemaPathFor(REPO_ROOT)).toBe(`./${relative(REPO_ROOT, join(__dirname, '..'))}/openapi-clients.schema.json`);
    expect(schemaPathFor('/does/not/exist')).toBe('./node_modules/@mo-transfer/tooling-openapi/openapi-clients.schema.json');
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
        { externalDependencies: ['openapi-typescript', 'orval', 'yaml', 'typescript'] },
      ],
      outputs: ['{projectRoot}/src/generated'],
      options: { client: 'generated/pet-client' },
      metadata: { description: 'OpenAPI testing lib (openapi-typescript, orval msw mocks, openapi-msw)' },
    });
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
