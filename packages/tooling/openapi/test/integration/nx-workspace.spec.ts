/**
 * `nx` itself in a fixture workspace configured like the repo (nx.json targetDefaults + plugins, lib-scopes.json,
 * exact tooling paths): `nx g @mo-transfer/tooling-openapi:client` writes the config, Nx reads it (tags, edges,
 * targets, inputs from targetDefaults), the plugin infers the client's generate-api-client/update-spec (json fields) and
 * `nx run …:generate-api-client` / `…-testing:generate-api-testing` run through the real executors, cached on the second run.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createWorkspace, removeWorkspace, repoRoot, SCAFFOLD, THINGS_SPEC, write } from '../helpers';

const TOOLING_PATHS = Object.fromEntries(
  Object.entries(
    JSON.parse(readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf-8')).compilerOptions.paths as Record<
      string,
      string[]
    >,
  )
    .filter(([alias]) => alias.startsWith('@mo-transfer/tooling-'))
    .map(([alias, [target]]) => [alias, [join(repoRoot, target)]]),
);

describe('nx in a fixture workspace', () => {
  let root: string;
  const nx = (...args: string[]): string =>
    execFileSync(process.execPath, [join(repoRoot, 'node_modules/nx/dist/bin/nx.js'), ...args], {
      cwd: root,
      encoding: 'utf-8',
      // own daemon-less graph/cache: never the repo's (the test may itself run as an Nx task)
      env: {
        ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NX_'))),
        NX_DAEMON: 'false',
        NX_NO_CLOUD: 'true',
        NX_CACHE_DIRECTORY: join(root, '.nx/cache'),
        NX_WORKSPACE_DATA_DIRECTORY: join(root, '.nx/workspace-data'),
      },
    });
  const project = (name: string) => JSON.parse(nx('show', 'project', name, '--json'));

  beforeAll(() => {
    root = createWorkspace('nx');
    // the repo's manifest + lockfile: Nx resolves the externalDependencies inputs (adapter versions) from them
    write(root, 'package.json', readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
    write(root, 'pnpm-lock.yaml', readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf-8'));
    // the repo's targetDefaults (lint/typecheck/build/test bodies, ^generate-api-client/-testing, dependentTasksOutputFiles) + plugins
    write(root, 'nx.json', readFileSync(join(repoRoot, 'nx.json'), 'utf-8'));
    write(root, 'lib-scopes.json', JSON.stringify({ scopes: ['booking', 'shared'] }));
    // like the repo: exact paths for the tooling exports (Nx loads generators with swc + these paths)
    write(root, 'tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: TOOLING_PATHS } }));
    // the domain must exist (a lib below libs/booking)
    write(root, 'libs/booking/types/src/index.ts', 'export {};\n');
    write(root, 'specs/things.yaml', THINGS_SPEC);
    // the repo's lib conventions for the part libs (settings.scaffold, loaded at run time by the generator)
    write(root, 'openapi-clients.json', JSON.stringify({ settings: { scaffold: SCAFFOLD }, clients: {} }));
    nx(
      'g',
      '@mo-transfer/tooling-openapi:client',
      'things-client',
      '--domain=booking',
      '--spec=specs/things.yaml',
      '--adapter=hey-api',
    );
  });
  afterAll(() => removeWorkspace(root));

  it('reads the config the generator wrote + the inferred client targets: part libs, edges, generate targets', () => {
    const testing = project('booking-generated-things-client-testing');
    expect(testing.tags).toEqual(['scope:booking', 'type:testing', 'feat:none', 'generated']);
    expect(testing.implicitDependencies).toEqual(['booking-generated-things-client']);
    expect(testing.targets['generate-api-testing'].executor).toBe('@mo-transfer/tooling-openapi:generate-testing');
    expect(testing.targets.lint.dependsOn).toEqual([
      'generate-api-testing',
      '^generate-api-client',
      '^generate-api-testing',
    ]);
    expect(testing.targets.typecheck.dependsOn).toEqual([
      'generate-api-testing',
      '^generate-api-client',
      '^generate-api-testing',
    ]);
    expect(testing.targets.typecheck.options.command).toBe(
      'tsc -p libs/booking/generated/things-client/testing/tsconfig.json',
    );
    expect(testing.targets.lint.inputs).toContainEqual({
      dependentTasksOutputFiles: '**/src/generated/**/*.ts',
      transitive: true,
    });
    expect(testing.targets.build).toBeUndefined();

    const api = project('booking-generated-things-client-api');
    expect(api.implicitDependencies).toEqual([
      'booking-generated-things-client',
      'booking-generated-things-client-types',
      'booking-generated-things-client-core',
    ]);
    expect(api.targets.build.executor).toBe('@nx/angular:ng-packagr-lite');
    expect(api.targets.build.dependsOn).toEqual(['^build', '^generate-api-client', '^generate-api-testing']);
    expect(api.metadata.js.packageName).toBe('@mo-transfer/booking/generated/things-client/api');

    const client = project('booking-generated-things-client');
    expect(client.tags).toEqual(['scope:booking', 'generated']);
    expect(client.targets['generate-api-client'].inputs).toContainEqual({
      json: '{workspaceRoot}/openapi-clients.json',
      fields: ['defaultAdapter', 'settings', 'clients.booking/generated/things-client'],
    });
    expect(client.targets['generate-api-client'].inputs).toContainEqual({
      externalDependencies: ['@hey-api/openapi-ts', 'typescript', 'yaml'],
    });
    expect(client.targets['generate-api-client'].options).toEqual({ client: 'booking/generated/things-client' });
    expect(client.targets['update-spec'].executor).toBe('@mo-transfer/tooling-openapi:update-spec');
    // inferred, not written: the client project.json holds name + tags only
    expect(
      JSON.parse(readFileSync(join(root, 'libs/booking/generated/things-client/project.json'), 'utf-8')).targets,
    ).toBeUndefined();
    expect(JSON.parse(readFileSync(join(root, 'tsconfig.base.json'), 'utf-8')).compilerOptions.paths).toHaveProperty([
      '@mo-transfer/booking/generated/things-client/types',
    ]);
  });

  it('nx run …:generate-api-client/-testing runs the executors; the second run comes from the cache', () => {
    expect(nx('run', 'booking-generated-things-client:generate-api-client')).toContain(
      'booking-generated-things-client: hey-api → {"types":1',
    );
    expect(existsSync(join(root, 'libs/booking/generated/things-client/api/src/generated/sdk.gen.ts'))).toBe(true);
    expect(nx('run', 'booking-generated-things-client:generate-api-client')).toMatch(
      /local cache|existing outputs match the cache/,
    );

    expect(nx('run', 'booking-generated-things-client-testing:generate-api-testing')).toContain(
      'booking-generated-things-client-testing:',
    );
    expect(existsSync(join(root, 'libs/booking/generated/things-client/testing/src/generated/handlers.ts'))).toBe(true);
  });
});
