import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  adapterOf,
  adapterRegistry,
  clientPartConfig,
  clientPartEdges,
  clientProjectJson,
  clientTargets,
  findSpecFile,
  generateTestingTarget,
} from './project-config';

const INDEX = "export * from './generated';\n";

describe('client config (project.json of clients and parts, inferred client targets)', () => {
  let root: string;
  const write = (path: string, content = ''): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  const exists = (path: string): boolean => existsSync(join(root, path));
  const client = (clientPath: string, parts = ['types', 'api', 'core', 'testing'], spec = 'openapi.yaml'): void => {
    write(`libs/${clientPath}/${spec}`, 'openapi: 3.0.3\n');
    for (const part of parts) write(`libs/${clientPath}/${part}/src/index.ts`, INDEX);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'openapi-config-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('client project.json: name + tags only; targets: generate-api-client (json-field input, adapter inputs), update-spec', () => {
    client('generated/pet-client');
    expect(clientProjectJson('generated/pet-client')).toEqual({
      name: 'generated-pet-client',
      $schema: '../../../node_modules/nx/schemas/project-schema.json',
      projectType: 'library',
      tags: ['scope:shared', 'generated'],
    });
    const targets = clientTargets(exists, 'generated/pet-client', {
      defaultAdapter: 'openapi-tools',
      clients: { 'generated/pet-client': { url: 'https://x' } },
    });
    expect(targets['generate-api-client']).toEqual({
      executor: '@mo-transfer/tooling-openapi:generate',
      cache: true,
      inputs: [
        '{workspaceRoot}/libs/generated/pet-client/openapi.yaml',
        { json: '{workspaceRoot}/openapi-clients.json', fields: ['defaultAdapter', 'clients.generated/pet-client'] },
        '{workspaceRoot}/libs/generated/pet-client/types/src/index.ts',
        '{workspaceRoot}/libs/generated/pet-client/api/src/index.ts',
        '{workspaceRoot}/libs/generated/pet-client/core/src/index.ts',
        '{workspaceRoot}/packages/tooling/openapi/src/facade/**/*',
        '{workspaceRoot}/packages/tooling/openapi/src/executors/**/*',
        '{workspaceRoot}/packages/tooling/openapi/src/plugin/**/*',
        '{workspaceRoot}/packages/tooling/openapi/src/project-config.ts',
        '{workspaceRoot}/openapitools.json',
        { externalDependencies: ['@openapitools/openapi-generator-cli', 'typescript', 'yaml'] },
        { runtime: 'java -version 2>&1' },
      ],
      outputs: [
        '{projectRoot}/types/src/generated',
        '{projectRoot}/api/src/generated',
        '{projectRoot}/core/src/generated',
      ],
      options: { client: 'generated/pet-client' },
    });
    expect(targets['update-spec']).toEqual({
      executor: '@mo-transfer/tooling-openapi:update-spec',
      cache: false,
      inputs: ['{workspaceRoot}/openapi-clients.json'],
      options: { client: 'generated/pet-client' },
    });
  });

  it('domain client: scope of the domain, the entry adapter wins over defaultAdapter', () => {
    client('booking/generated/booking-client', ['types', 'api', 'testing'], 'openapi.json');
    const booking = clientProjectJson('booking/generated/booking-client');
    expect(booking['$schema']).toBe('../../../../node_modules/nx/schemas/project-schema.json');
    expect(booking['tags']).toEqual(['scope:booking', 'generated']);
    const { 'generate-api-client': generate } = clientTargets(exists, 'booking/generated/booking-client', {
      defaultAdapter: 'openapi-tools',
      clients: { 'booking/generated/booking-client': { adapter: 'hey-api' } },
    }) as Record<string, { inputs: unknown[] }>;
    expect(generate.inputs[0]).toBe('{workspaceRoot}/libs/booking/generated/booking-client/openapi.json');
    expect(generate.inputs).toContainEqual({ externalDependencies: ['@hey-api/openapi-ts', 'typescript', 'yaml'] });
    expect(generate.inputs).not.toContainEqual({ runtime: 'java -version 2>&1' });
  });

  it('adapter fallback: entry → defaultAdapter → openapi-tools; unknown adapter fails', () => {
    expect(adapterOf('generated/a', { clients: { 'generated/a': {} } })).toBe('openapi-tools');
    expect(adapterOf('generated/a', { defaultAdapter: 'hey-api', clients: {} })).toBe('hey-api');
    expect(adapterOf('generated/a', {})).toBe('openapi-tools');
    expect(() =>
      adapterOf('generated/odd-client', { clients: { 'generated/odd-client': { adapter: 'swagger-codegen' } } }),
    ).toThrow(
      'openapi-clients.json → "generated/odd-client": unknown adapter "swagger-codegen" (known: openapi-tools, hey-api, nx-plugin-openapi)',
    );
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
    expect(clientPartConfig(exists, clientPath, 'testing')).toEqual({
      implicitDependencies: ['booking-generated-booking-client'],
      peerDependencies: {},
      targets: {
        'generate-api-testing': {
          executor: '@mo-transfer/tooling-openapi:generate-testing',
          cache: true,
          inputs: [
            '{workspaceRoot}/libs/booking/generated/booking-client/openapi.yaml',
            '{workspaceRoot}/packages/tooling/openapi/src/facade/facade.mjs',
            '{workspaceRoot}/packages/tooling/openapi/src/testing/**/*',
            '{workspaceRoot}/packages/tooling/openapi/src/executors/generate-testing.js',
            { externalDependencies: ['openapi-typescript', 'orval', 'yaml'] },
          ],
          outputs: ['{projectRoot}/src/generated'],
          options: { client: clientPath },
        },
        lint: { dependsOn: ['generate-api-testing', '^generate-api-client', '^generate-api-testing'] },
        typecheck: { dependsOn: ['generate-api-testing', '^generate-api-client', '^generate-api-testing'] },
      },
    });
    expect(generateTestingTarget(clientPath, 'x.yaml')['inputs']).toContain('{workspaceRoot}/x.yaml');
  });

  it('edges skip parts that are not committed (core is optional), unknown part → client only', () => {
    client('generated/lean-client', ['types', 'api']);
    expect(clientPartEdges(exists, { path: 'generated/lean-client', part: 'api' })).toEqual([
      'generated-lean-client',
      'generated-lean-client-types',
    ]);
    expect(clientPartEdges(exists, { path: 'generated/lean-client', part: 'docs' })).toEqual(['generated-lean-client']);
  });

  it('errors: bad client path, no spec / two specs', () => {
    expect(() => clientProjectJson('pet-client')).toThrow(
      'openapi-clients.json → "pet-client": not a client path (generated/<client> or <domain>/generated/<client>)',
    );
    expect(() => clientTargets(exists, 'pet-client', {})).toThrow('not a client path');
    expect(() => clientTargets(exists, 'generated/nospec-client', {})).toThrow(
      'openapi-clients.json → "generated/nospec-client": libs/generated/nospec-client needs exactly one spec file (openapi.yaml | openapi.json), found none. New client: nx g @mo-transfer/tooling-openapi:client <name> --spec=<file|url>',
    );
    client('generated/two-client');
    write('libs/generated/two-client/openapi.json', '{}');
    expect(() => findSpecFile(exists, 'generated/two-client')).toThrow('found openapi.yaml, openapi.json');
  });

  it('adapter registry: the three adapters, $-keys (comments) filtered, read once', () => {
    const registry = adapterRegistry();
    expect(Object.keys(registry)).toEqual(['openapi-tools', 'hey-api', 'nx-plugin-openapi']);
    expect(adapterRegistry()).toBe(registry);
  });
});
