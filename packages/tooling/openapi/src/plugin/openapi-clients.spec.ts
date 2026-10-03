import { DependencyType, logger } from '@nx/devkit';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDependencies, createNodes, inferClientNodes, targetNamesOf } from './openapi-clients';

describe('plugin: targets inferred from openapi-clients.json', () => {
  let root: string;
  const write = (path: string, content = ''): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const config = (clients: Record<string, unknown>, extra: Record<string, unknown> = {}): void =>
    write('openapi-clients.json', JSON.stringify({ defaultAdapter: 'openapi-tools', ...extra, clients }));
  const client = (clientPath: string, spec = 'openapi.yaml', testing = true): void => {
    write(`libs/${clientPath}/project.json`, '{}');
    write(`libs/${clientPath}/${spec}`, 'openapi: 3.0.3\n');
    if (testing) write(`libs/${clientPath}/testing/project.json`, '{}');
  };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openapi-plugin-'));
    warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('client targets + testing target per entry, metadata, adapter inputs (no project.json → no node)', () => {
    client('generated/pet-client');
    client('booking/generated/booking-client', 'openapi.json', false);
    config({
      'generated/pet-client': { adapter: 'hey-api' },
      'booking/generated/booking-client': {},
      'generated/gone-client': {},
    });
    const { projects = {} } = inferClientNodes(root);

    expect(Object.keys(projects)).toEqual([
      'libs/generated/pet-client',
      'libs/generated/pet-client/testing',
      'libs/booking/generated/booking-client',
    ]);
    const pet = projects['libs/generated/pet-client'];
    expect(Object.keys(pet.targets)).toEqual(['update-spec', 'generate-api-client']);
    expect(pet.metadata?.openapi).toMatchObject({ adapter: 'hey-api', adapterSource: 'builtin' });
    expect(pet.targets['generate-api-client']['inputs']).toContainEqual({
      externalDependencies: ['@hey-api/openapi-ts', 'typescript', 'yaml'],
    });
    expect(Object.keys(projects['libs/generated/pet-client/testing'].targets)).toEqual(['generate-api-testing']);
    expect(projects['libs/generated/pet-client/testing'].metadata).toBeUndefined();
    const booking = projects['libs/booking/generated/booking-client'].targets['generate-api-client']['inputs'] as unknown[];
    expect(booking[0]).toBe('{workspaceRoot}/libs/booking/generated/booking-client/openapi.json');
    expect(booking).toContainEqual({ runtime: 'java -version 2>&1' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('a broken entry never breaks the graph: warning, only update-spec, problem in the metadata', () => {
    client('generated/odd-client');
    config({ 'generated/odd-client': { adapter: 'swagger-codegen' } });
    const { projects = {} } = inferClientNodes(root);
    expect(Object.keys(projects['libs/generated/odd-client'].targets)).toEqual(['update-spec']);
    expect(projects['libs/generated/odd-client'].metadata?.openapi.problem).toContain('unknown adapter "swagger-codegen"');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown adapter "swagger-codegen"'));
  });

  it('a disabled feature (overlays without the flag): warning, target kept, disabledFeatures in the metadata', () => {
    client('generated/ov-client');
    config({ 'generated/ov-client': { pipeline: { overlays: ['o.yaml'] } } });
    const { projects = {} } = inferClientNodes(root);
    expect(projects['libs/generated/ov-client'].metadata?.openapi.disabledFeatures).toEqual(['overlays']);
    expect(projects['libs/generated/ov-client'].targets).toHaveProperty('generate-api-client');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('uses overlays with the feature flag off'));
  });

  it('unreadable file or no clients: no nodes, warning only for the unreadable file', () => {
    write('openapi-clients.json', '{ nope');
    expect(inferClientNodes(root)).toEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('openapi-clients.json: not readable'));
    write('openapi-clients.json', '{}');
    expect(inferClientNodes(root)).toEqual({ projects: {} });
  });

  it('createNodes (Nx 23 API): the root openapi-clients.json, plugin options rename the targets', async () => {
    client('generated/pet-client');
    config({ 'generated/pet-client': {} });
    const [glob, create] = createNodes;
    expect(glob).toBe('openapi-clients.json');
    const results = await create(['openapi-clients.json'], { clientTargetName: 'codegen', updateSpecTargetName: 'refresh' }, {
      workspaceRoot: root,
      nxJsonConfiguration: {},
    } as Parameters<typeof create>[2]);
    expect(results).toHaveLength(1);
    expect(results[0][0]).toBe('openapi-clients.json');
    const projects = results[0][1].projects ?? {};
    expect(Object.keys(projects['libs/generated/pet-client'].targets ?? {})).toEqual(['refresh', 'codegen']);
    expect(Object.keys(projects['libs/generated/pet-client/testing'].targets ?? {})).toEqual(['generate-api-testing']);
    expect(targetNamesOf(undefined)).toEqual({});
    expect(targetNamesOf({ testingTargetName: 't' })).toEqual({ testing: 't' });
  });

  it('createDependencies: client → npm:<package> of consumer adapters and transforms (only existing external nodes)', async () => {
    client('generated/pet-client');
    client('generated/other-client');
    client('generated/builtin-client');
    config(
      {
        'generated/pet-client': { adapter: 'acme', pipeline: { transforms: ['@acme/hooks', './tools/local.ts'] } },
        'generated/other-client': { adapter: 'local' },
        'generated/builtin-client': {},
        'generated/no-project': {},
      },
      { adapters: { acme: { module: '@acme/openapi-adapter', packages: ['orval', 'not-installed'] }, local: { module: './tools/x.ts', packages: ['orval'] } } },
    );
    const projects = {
      'generated-pet-client': { root: 'libs/generated/pet-client', name: 'generated-pet-client' },
      'libs/generated/other-client': { root: 'libs/generated/other-client' },
      'generated-builtin-client': { root: 'libs/generated/builtin-client', name: 'generated-builtin-client' },
    };
    const externalNodes = Object.fromEntries(
      ['@acme/openapi-adapter', 'orval', '@acme/hooks', '@hey-api/openapi-ts'].map((name) => [`npm:${name}`, { name: `npm:${name}` }]),
    );
    const dependencies = await createDependencies(undefined, { workspaceRoot: root, projects, externalNodes } as unknown as Parameters<
      typeof createDependencies
    >[1]);
    expect(dependencies).toEqual([
      { source: 'generated-pet-client', target: 'npm:@acme/hooks', type: DependencyType.implicit },
      { source: 'generated-pet-client', target: 'npm:@acme/openapi-adapter', type: DependencyType.implicit },
      { source: 'generated-pet-client', target: 'npm:orval', type: DependencyType.implicit },
      { source: 'libs/generated/other-client', target: 'npm:orval', type: DependencyType.implicit },
    ]);
    write('openapi-clients.json', '{ nope');
    expect(await createDependencies(undefined, { workspaceRoot: root, projects, externalNodes } as unknown as Parameters<typeof createDependencies>[1])).toEqual([]);
  });
});
