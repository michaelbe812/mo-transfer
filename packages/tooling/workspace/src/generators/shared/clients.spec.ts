import type { Tree } from '@nx/devkit';
import { createBlueprintTree, pathsOf, read, readProject, scopesOf } from '@mo-transfer/tooling-conventions/testing';
import { addClientEntry, type ClientEntry } from '@mo-transfer/tooling-openapi/clients';
import { clientPartConfig, clientProjectJson } from '@mo-transfer/tooling-openapi';
import { writeJsonFile, writeLibConfig } from '@mo-transfer/tooling-conventions/tree';
import { beforeEach, describe, expect, it } from 'vitest';
import { moveGenerator } from '../move/generator';
import { removeGenerator } from '../remove/generator';
import { renameGenerator } from '../rename/generator';

/**
 * move / rename / remove keep openapi-clients.json and the client config in step. The client is laid out
 * like `nx g @mo-transfer/tooling-openapi:client` does it (spec, client project.json, four libs with index.ts
 * + config, paths, entry).
 */
const SPEC_YAML = 'openapi: 3.0.3\ninfo: { title: Demo, version: 1.0.0 }\npaths:\n  /things: {}\n';
const clients = (tree: Tree) => JSON.parse(read(tree, 'openapi-clients.json')).clients;

function addClient(tree: Tree, clientPath: string, entry: ClientEntry = {}, parts = ['api', 'core', 'testing', 'types']): void {
  tree.write(`libs/${clientPath}/openapi.yaml`, SPEC_YAML);
  for (const part of parts) {
    tree.write(`libs/${clientPath}/${part}/src/index.ts`, "export * from './generated';\n");
  }
  addClientEntry(tree, clientPath, entry);
  const exists = (path: string): boolean => tree.exists(path);
  writeJsonFile(tree, `libs/${clientPath}/project.json`, clientProjectJson(clientPath));
  for (const part of parts) {
    writeLibConfig(tree, `${clientPath}/${part}`, clientPartConfig(exists, clientPath, part));
  }
}

describe('move / rename / remove with OpenAPI clients', () => {
  let tree: Tree;
  beforeEach(() => {
    tree = createBlueprintTree();
  });

  it('remove takes the client, its config, paths and entry out — exactly as before', async () => {
    addClient(tree, 'generated/keep-client');
    const before = read(tree, 'openapi-clients.json');
    const baseTsconfig = read(tree, 'tsconfig.base.json');
    addClient(tree, 'booking/generated/demo-client');

    await removeGenerator(tree, { path: 'booking/generated/demo-client', skipFormat: true });

    expect(tree.exists('libs/booking/generated')).toBe(false);
    expect(read(tree, 'openapi-clients.json')).toBe(before);
    expect(read(tree, 'tsconfig.base.json')).toBe(baseTsconfig);

    // `generated` is no scope: removing one of two shared clients leaves the scope list alone
    addClient(tree, 'generated/other-client');
    await removeGenerator(tree, { path: 'generated/keep-client', skipFormat: true });
    expect(scopesOf(tree)).toEqual(['booking', 'layout', 'shared']);
  });

  it('remove refuses while a data-access lib imports the client', async () => {
    addClient(tree, 'booking/generated/demo-client');
    tree.write(
      'libs/booking/data-access/src/uses.ts',
      "import { DemoService } from '@mo-transfer/booking/generated/demo-client/api';\nexport const x = DemoService;\n",
    );

    await expect(removeGenerator(tree, { path: 'booking/generated/demo-client' })).rejects.toThrow(
      'libs/booking/data-access/src/uses.ts',
    );
  });

  it('move / rename keep the entry, the aliases and the generated testing exports in step', async () => {
    addClient(tree, 'generated/demo-client', { url: 'https://example.org/a.yaml' });
    tree.write(
      'libs/booking/data-access/src/booking-api.spec.ts',
      "import { demoClientHandlers, demoClientHttp } from '@mo-transfer/generated/demo-client/testing';\nexport const h = [demoClientHandlers, demoClientHttp];\n",
    );

    await moveGenerator(tree, { from: 'generated/demo-client', to: 'booking/generated/demo-client', skipFormat: true });
    expect(clients(tree)).toEqual({ 'booking/generated/demo-client': { url: 'https://example.org/a.yaml' } });
    expect(tree.exists('libs/booking/generated/demo-client/openapi.yaml')).toBe(true);

    const moved = readProject(tree, 'libs/booking/generated/demo-client/project.json');
    expect(moved.name).toBe('booking-generated-demo-client');
    expect(moved.tags).toEqual(['scope:booking', 'generated']);
    // generate-api-client/update-spec follow the moved entry (inferred by the plugin), nothing to rewrite
    expect(moved.targets).toBeUndefined();

    await renameGenerator(tree, { path: 'booking/generated/demo-client', name: 'thing-client', skipFormat: true });
    expect(clients(tree)).toEqual({ 'booking/generated/thing-client': { url: 'https://example.org/a.yaml' } });
    const api = readProject(tree, 'libs/booking/generated/thing-client/api/project.json');
    expect(api.name).toBe('booking-generated-thing-client-api');
    expect(api.implicitDependencies).toEqual([
      'booking-generated-thing-client',
      'booking-generated-thing-client-types',
      'booking-generated-thing-client-core',
    ]);
    const testing = readProject(tree, 'libs/booking/generated/thing-client/testing/project.json');
    // generate-api-testing is inferred (plugin, follows the moved entry); lint/typecheck wait for it
    expect(testing.targets['generate-api-testing']).toBeUndefined();
    expect(testing.targets.lint.dependsOn).toEqual(['generate-api-testing', '^generate-api-client', '^generate-api-testing']);
    expect(pathsOf(tree)).toHaveProperty(['@mo-transfer/booking/generated/thing-client/api']);
    expect(read(tree, 'libs/booking/data-access/src/booking-api.spec.ts')).toBe(
      "import { thingClientHandlers, thingClientHttp } from '@mo-transfer/booking/generated/thing-client/testing';\nexport const h = [thingClientHandlers, thingClientHttp];\n",
    );
  });

  it('merged-core + testing: false: move / rename / remove keep layout and pipeline, edges without core', async () => {
    const entry: ClientEntry = { layout: 'merged-core', pipeline: { testing: false } };
    addClient(tree, 'generated/lean-client', entry, ['api', 'types']);
    await moveGenerator(tree, { from: 'generated/lean-client', to: 'booking/generated/lean-client', skipFormat: true });
    await renameGenerator(tree, { path: 'booking/generated/lean-client', name: 'slim-client', skipFormat: true });
    expect(clients(tree)).toEqual({ 'booking/generated/slim-client': entry });
    expect(readProject(tree, 'libs/booking/generated/slim-client/api/project.json').implicitDependencies).toEqual([
      'booking-generated-slim-client',
      'booking-generated-slim-client-types',
    ]);
    expect(tree.exists('libs/booking/generated/slim-client/core')).toBe(false);
    expect(tree.exists('libs/booking/generated/slim-client/testing')).toBe(false);
    await removeGenerator(tree, { path: 'booking/generated/slim-client', skipFormat: true });
    expect(clients(tree)).toEqual({});
    expect(Object.keys(pathsOf(tree)).some((alias) => alias.includes('slim-client'))).toBe(false);
  });

  it('removing a domain drops its clients', async () => {
    addClient(tree, 'booking/generated/demo-client');
    await removeGenerator(tree, { path: 'booking', force: true, skipFormat: true });
    expect(clients(tree)).toEqual({});
  });

  it('moving a whole domain moves the client paths inside its libs, too', async () => {
    addClient(tree, 'booking/generated/demo-client');
    await moveGenerator(tree, { from: 'booking', to: 'reservation', skipFormat: true });

    const testing = readProject(tree, 'libs/reservation/generated/demo-client/testing/project.json');
    expect(testing.name).toBe('reservation-generated-demo-client-testing');
    expect(testing.tags).toEqual(['scope:reservation', 'type:testing', 'feat:none', 'generated']);
    expect(testing.implicitDependencies).toEqual(['reservation-generated-demo-client']);
    expect(testing.targets['generate-api-testing']).toBeUndefined();
    expect(readProject(tree, 'libs/reservation/generated/demo-client/project.json').tags).toEqual([
      'scope:reservation',
      'generated',
    ]);
  });
});
