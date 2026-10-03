/**
 * The published package, end to end (review Low): build the dist into a temp folder, check what ships (no source
 * maps pointing to unshipped .ts, the schema-faker runtime asset), load every export in plain Node, then a fixture
 * workspace that installs the dist as @mo-transfer/tooling-openapi — plugin + executor run from the built JS,
 * the tooling enters the hash as the npm package.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { createNxFixture, filesBelow, type NxFixture, read, removeWorkspace, repoRoot, THINGS_SPEC, write } from '../helpers';

const PACKAGE = join(repoRoot, 'packages/tooling/openapi');

describe('dist smoke test', () => {
  const out = join(repoRoot, 'tmp/openapi-it', `dist-${process.pid}`);
  let fx: NxFixture;

  beforeAll(() => {
    rmSync(out, { recursive: true, force: true });
    execFileSync(process.execPath, [join(repoRoot, 'node_modules/typescript/bin/tsc'), '-p', join(PACKAGE, 'tsconfig.lib.json'), '--outDir', out], { stdio: 'pipe' });
    execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings=ExperimentalWarning', join(PACKAGE, 'scripts/prepare-dist.mts'), '--out', out], {
      stdio: 'pipe',
    });
  });
  afterAll(() => {
    rmSync(out, { recursive: true, force: true });
    if (fx) removeWorkspace(fx.root);
  });

  it('ships JS + types + assets, no source maps to unshipped sources, a publishable package.json', () => {
    const files = filesBelow(out);
    expect(files).toEqual(expect.arrayContaining(['package.json', 'executors.json', 'generators.json', 'openapi-clients.schema.json', 'README.md']));
    expect(files).toEqual(expect.arrayContaining(['src/index.js', 'src/index.d.ts', 'src/executors/generate.js', 'src/executors/client.schema.json']));
    expect(files).toContain('src/pipeline/schema-faker/runtime/mock-runtime.ts');
    expect(files.filter((file) => file.endsWith('.map'))).toEqual([]);
    expect(files.filter((file) => file.endsWith('.spec.js'))).toEqual([]);
    const manifest = JSON.parse(read(out, 'package.json'));
    expect(manifest.private).toBeUndefined();
    expect(manifest.devDependencies).toBeUndefined();
    expect(manifest.exports['./plugin']).toEqual({ types: './src/plugin/openapi-clients.d.ts', default: './src/plugin/openapi-clients.js' });
  });

  it('every export loads in plain Node (CommonJS)', () => {
    const script = ['', '/adapter', '/adapter-testing', '/clients', '/plugin']
      .map((subpath) => `require(${JSON.stringify(join(out, JSON.parse(readFileSync(join(out, 'package.json'), 'utf-8')).exports[`.${subpath}`].default))});`)
      .join('\n');
    expect(() => execFileSync(process.execPath, ['-e', `${script}\nconsole.log('ok')`], { encoding: 'utf-8' })).not.toThrow();
  });

  it('a workspace with the dist installed: plugin + executor from the built package, the package as cache input', () => {
    fx = createNxFixture('dist', { ownNodeModules: true });
    // the package from "npm": node_modules/@mo-transfer/tooling-openapi → dist, no tsconfig paths onto the sources
    rmSync(join(fx.root, 'node_modules/@mo-transfer'));
    mkdirSync(join(fx.root, 'node_modules/@mo-transfer'));
    symlinkSync(out, join(fx.root, 'node_modules/@mo-transfer/tooling-openapi'));
    write(fx.root, 'tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: {} } }));
    const manifest = JSON.parse(read(fx.root, 'package.json'));
    delete manifest.devDependencies['@mo-transfer/tooling-ng-lib'];
    delete manifest.devDependencies['@mo-transfer/tooling-workspace'];
    manifest.devDependencies['@mo-transfer/tooling-openapi'] = '0.1.0';
    write(fx.root, 'package.json', JSON.stringify(manifest, null, 2));
    const lock = parseYaml(read(fx.root, 'pnpm-lock.yaml'));
    lock.importers['.'].devDependencies['@mo-transfer/tooling-openapi'] = { specifier: '0.1.0', version: '0.1.0' };
    lock.packages['@mo-transfer/tooling-openapi@0.1.0'] = { resolution: { integrity: 'sha512-ZmFrZQ==' } };
    lock.snapshots['@mo-transfer/tooling-openapi@0.1.0'] = {};
    write(fx.root, 'pnpm-lock.yaml', stringifyYaml(lock));
    const nxJson = JSON.parse(read(fx.root, 'nx.json'));
    nxJson.sync = undefined;
    nxJson.plugins = ['@mo-transfer/tooling-openapi/plugin'];
    write(fx.root, 'nx.json', JSON.stringify(nxJson, null, 2));
    write(fx.root, 'tools/gen.mjs', "import { mkdirSync, writeFileSync } from 'node:fs';\nconst [o] = process.argv.slice(2);\nmkdirSync(o, { recursive: true });\nwriteFileSync(o + '/thing.ts', 'export type Thing = 1;\\n');\n");
    write(fx.root, 'libs/generated/d-client/project.json', JSON.stringify({ name: 'generated-d-client', tags: [] }));
    write(fx.root, 'libs/generated/d-client/openapi.yaml', THINGS_SPEC);
    write(fx.root, 'libs/generated/d-client/types/src/index.ts', "export * from './generated';\n");
    write(
      fx.root,
      'openapi-clients.json',
      JSON.stringify({
        adapters: { cmd: { module: 'builtin:command', options: { command: 'node', args: ['{workspaceRoot}/tools/gen.mjs', '{outDir}'], classify: { models: ['*.ts'] } } } },
        clients: { 'generated/d-client': { adapter: 'cmd', pipeline: { testing: false } } },
      }),
    );
    const target = fx.project('generated-d-client').targets['generate-api-client'];
    expect(target.executor).toBe('@mo-transfer/tooling-openapi:generate');
    expect(target.inputs).toContainEqual({ externalDependencies: ['@mo-transfer/tooling-openapi', 'typescript', 'yaml'] });
    const run = fx.tryNx('run', 'generated-d-client:generate-api-client', '--skip-nx-cache');
    expect(run.output).toContain('generated-d-client: cmd → {"types":1');
    expect(run.ok).toBe(true);
    expect(existsSync(join(fx.root, 'libs/generated/d-client/types/src/generated/thing.ts'))).toBe(true);
  });
});
