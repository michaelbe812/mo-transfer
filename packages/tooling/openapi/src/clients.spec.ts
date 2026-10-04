import type { Tree } from '@nx/devkit';
import { createTreeWithEmptyWorkspace } from '@nx/devkit/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  addClientEntry,
  domainClientTestingExports,
  readClientsJson,
  relocateClientProject,
  renameClientExports,
  updateClientEntries,
  writeClientsJson,
} from './clients';

const read = (tree: Tree, path: string) => tree.read(path, 'utf-8');
const clients = (tree: Tree) => JSON.parse(read(tree, 'openapi-clients.json') ?? '{}').clients;

describe('openapi-clients.json on the Tree', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
  });

  it('defaults without file; add keeps key order, 2 spaces + newline', () => {
    expect(readClientsJson(tree)).toEqual({
      // a virtual tree root: the package is not inside it → the schema below node_modules
      $schema: './node_modules/@mo-transfer/tooling-openapi/openapi-clients.schema.json',
      defaultAdapter: 'openapi-tools',
      clients: {},
    });
    addClientEntry(tree, 'generated/b-client', {});
    addClientEntry(tree, 'generated/a-client', { url: 'https://a' });
    expect(read(tree, 'openapi-clients.json')).toBe(
      [
        '{',
        '  "$schema": "./node_modules/@mo-transfer/tooling-openapi/openapi-clients.schema.json",',
        '  "defaultAdapter": "openapi-tools",',
        '  "clients": {',
        '    "generated/b-client": {},',
        '    "generated/a-client": {',
        '      "url": "https://a"',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('an existing file is read as is', () => {
    writeClientsJson(tree, { clients: { 'generated/x-client': { adapter: 'hey-api' } } });
    expect(readClientsJson(tree)).toEqual({ clients: { 'generated/x-client': { adapter: 'hey-api' } } });
  });

  it('move: every client at or below the path is renamed; a part path or another client is untouched', () => {
    expect(updateClientEntries(tree, 'booking', 'billing')).toEqual([]);
    writeClientsJson(tree, {
      clients: {
        'booking/generated/a-client': { url: 'https://a' },
        'booking/generated/b-client': {},
        'bookings/generated/c-client': {},
        'generated/d-client': {},
      },
    });
    expect(updateClientEntries(tree, 'booking/generated/a-client/api', 'booking/generated/a-client/x')).toEqual([]);
    expect(updateClientEntries(tree, 'booking', 'billing')).toEqual([
      ['booking/generated/a-client', 'billing/generated/a-client'],
      ['booking/generated/b-client', 'billing/generated/b-client'],
    ]);
    expect(clients(tree)).toEqual({
      'billing/generated/a-client': { url: 'https://a' },
      'billing/generated/b-client': {},
      'bookings/generated/c-client': {},
      'generated/d-client': {},
    });
  });

  it('remove: entries at or below the path are dropped', () => {
    writeClientsJson(tree, { clients: { 'generated/d-client': {}, 'booking/generated/a-client': {} } });
    expect(updateClientEntries(tree, 'generated/d-client')).toEqual([['generated/d-client', undefined]]);
    expect(clients(tree)).toEqual({ 'booking/generated/a-client': {} });
    writeClientsJson(tree, {});
    expect(updateClientEntries(tree, 'generated')).toEqual([]);
  });

  it('a renamed client renames <client>Http/Handlers/BaseUrl in apps/ and libs/', () => {
    tree.write(
      'libs/booking/data-access/src/a.spec.ts',
      'import { demoClientHttp, demoClientHandlers, demoClientBaseUrl, demoClientX } from "x";\n',
    );
    tree.write('apps/client/src/main.ts', 'const u = demoClientBaseUrl;\n');
    tree.write('libs/booking/data-access/src/b.ts', 'export const other = 1;\n');
    // not source: other extensions, node_modules/dist/tmp
    tree.write('libs/booking/data-access/README.md', 'demoClientHttp\n');
    tree.write('libs/node_modules/x/index.ts', 'demoClientHttp;\n');

    expect(renameClientExports(tree, 'generated/demo-client', 'booking/generated/thing-client')).toEqual([
      'apps/client/src/main.ts',
      'libs/booking/data-access/src/a.spec.ts',
    ]);
    expect(read(tree, 'libs/booking/data-access/src/a.spec.ts')).toBe(
      'import { thingClientHttp, thingClientHandlers, thingClientBaseUrl, demoClientX } from "x";\n',
    );
    expect(read(tree, 'apps/client/src/main.ts')).toBe('const u = thingClientBaseUrl;\n');
  });

  it('no rename for the same name, a non-client path or a moved (not renamed) client', () => {
    tree.write('libs/booking/data-access/src/a.ts', 'demoClientHttp;\n');
    expect(renameClientExports(tree, 'generated/demo-client', 'booking/generated/demo-client')).toEqual([]);
    expect(renameClientExports(tree, 'booking/data-access', 'booking/generated/x-client')).toEqual([]);
    expect(renameClientExports(tree, 'generated/demo-client', 'booking/data-access')).toEqual([]);
    expect(read(tree, 'libs/booking/data-access/src/a.ts')).toBe('demoClientHttp;\n');
    // a workspace without apps/: only libs/
    tree.delete('apps');
    expect(renameClientExports(tree, 'generated/demo-client', 'generated/other-client')).toEqual(['libs/booking/data-access/src/a.ts']);
  });

  it('relocateClientProject: name, $schema, scope tag, paths in the targets; no-op without project.json', () => {
    tree.write(
      'libs/booking/generated/x-client/project.json',
      JSON.stringify({
        name: 'generated-x-client',
        $schema: '../../../node_modules/nx/schemas/project-schema.json',
        tags: ['scope:shared', 'generated'],
        targets: {
          'generate-api-client': {
            inputs: ['{workspaceRoot}/libs/generated/x-client/openapi.yaml'],
            options: { client: 'generated/x-client' },
          },
        },
      }),
    );
    expect(relocateClientProject(tree, 'generated/x-client', 'booking/generated/x-client')).toBe(
      'booking-generated-x-client',
    );
    expect(JSON.parse(read(tree, 'libs/booking/generated/x-client/project.json') ?? '')).toEqual({
      name: 'booking-generated-x-client',
      $schema: '../../../../node_modules/nx/schemas/project-schema.json',
      tags: ['scope:booking', 'generated'],
      targets: {
        'generate-api-client': {
          inputs: ['{workspaceRoot}/libs/booking/generated/x-client/openapi.yaml'],
          options: { client: 'booking/generated/x-client' },
        },
      },
    });
    expect(relocateClientProject(tree, 'generated/y-client', 'generated/z-client')).toBe('generated-z-client');
    expect(tree.exists('libs/generated/z-client/project.json')).toBe(false);
  });

  it('domainClientTestingExports: testing exports of a slice\'s own clients — <client>Handlers only for a faking engine', () => {
    const testingLib = (clientPath: string) => tree.write(`libs/${clientPath}/testing/src/index.ts`, "export * from './generated';\n");
    writeClientsJson(tree, {
      settings: { testing: { mocks: 'schema-faker' } },
      clients: {
        'booking/generated/booking-client': {},
        'booking/generated/lean-client': { pipeline: { testing: { mocks: 'none' } } },
        'booking/generated/no-testing-client': { pipeline: { testing: false } },
        'booking/generated/missing-client': {},
        'checkin/generated/checkin-client': {},
        'generated/pet-client': {},
        'booking/not-a-client': {},
      },
    });
    for (const clientPath of ['booking/generated/booking-client', 'booking/generated/lean-client', 'checkin/generated/checkin-client', 'generated/pet-client']) {
      testingLib(clientPath);
    }

    expect(domainClientTestingExports(tree, 'booking')).toEqual([
      {
        clientPath: 'booking/generated/booking-client',
        alias: '@mo-transfer/booking/generated/booking-client/testing',
        http: 'bookingClientHttp',
        handlers: 'bookingClientHandlers',
      },
      { clientPath: 'booking/generated/lean-client', alias: '@mo-transfer/booking/generated/lean-client/testing', http: 'leanClientHttp' },
    ]);
    expect(domainClientTestingExports(tree, 'layout')).toEqual([]);
    expect(domainClientTestingExports(createTreeWithEmptyWorkspace(), 'booking')).toEqual([]);
  });
});
