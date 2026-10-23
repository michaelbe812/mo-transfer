import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The real Nx client against running cache servers (e.g. `docker/compose.yml`), in a throwaway workspace that
 * links this repo's `nx`. Runs only when configured:
 *   NX_CACHE_E2E_URLS=http://localhost:3100,http://localhost:3200
 * Tokens default to the compose stack (`ci-token`, `dev-token`, `ro-token`).
 */
const urls = (process.env['NX_CACHE_E2E_URLS'] ?? '')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const tokens = {
  ci: process.env['NX_CACHE_E2E_CI_TOKEN'] ?? 'ci-token',
  dev: process.env['NX_CACHE_E2E_DEV_TOKEN'] ?? 'dev-token',
  readOnly: process.env['NX_CACHE_E2E_RO_TOKEN'] ?? 'ro-token',
};
const repoNodeModules = join(import.meta.dirname, '..', '..', '..', '..', 'node_modules');
const nxPackageJson = createRequire(join(repoNodeModules, '..', 'package.json')).resolve('nx/package.json');
const nxBin = join(
  nxPackageJson,
  '..',
  (JSON.parse(readFileSync(nxPackageJson, 'utf-8')) as { bin: { nx: string } }).bin.nx,
);

/** Without the outer Nx run's variables (NX_SKIP_NX_CACHE, NX_WORKSPACE_ROOT, …) when started via `nx run …:e2e`. */
const inheritedEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('NX_')));

/** Minimal workspace: one cacheable target that copies a unique input to `dist/`, so every run has a fresh hash. */
const createWorkspace = () => {
  const root = mkdtempSync(join(tmpdir(), 'nx-cache-e2e-'));
  symlinkSync(repoNodeModules, join(root, 'node_modules'), 'dir');
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'nx-cache-e2e', private: true }));
  writeFileSync(join(root, 'nx.json'), JSON.stringify({ neverConnectToCloud: true }));
  mkdirSync(join(root, 'app', 'src'), { recursive: true });
  writeFileSync(
    join(root, 'app', 'project.json'),
    JSON.stringify({
      name: 'app',
      targets: {
        build: {
          executor: 'nx:run-commands',
          cache: true,
          inputs: ['{projectRoot}/src/**/*'],
          outputs: ['{projectRoot}/dist'],
          options: {
            command:
              "node -e \"fs.mkdirSync('app/dist',{recursive:true});fs.copyFileSync('app/src/input.txt','app/dist/output.txt')\"",
          },
        },
      },
    }),
  );
  return root;
};

for (const url of urls) {
  describe(`nx client against ${url}`, () => {
    let root: string;
    let content: string;

    const run = (args: Array<string>, token: string) => {
      try {
        return execFileSync(process.execPath, [nxBin, ...args], {
          cwd: root,
          encoding: 'utf-8',
          stdio: 'pipe',
          env: {
            ...inheritedEnv,
            NX_DAEMON: 'false',
            NX_NO_CLOUD: 'true',
            NX_SELF_HOSTED_REMOTE_CACHE_SERVER: url,
            NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN: token,
          },
        });
      } catch (error) {
        const { stdout, stderr } = error as { stdout?: string; stderr?: string };
        return `${stdout ?? ''}${stderr ?? ''}`;
      }
    };
    // colors are forced when run under Nx; compare plain text
    const nx =
      (...args: Array<string>) =>
      (token: string) =>
        stripVTControlCharacters(run(args, token));
    /** Clean slate locally: no local cache, no outputs — a hit can only come from the server. */
    const buildFresh = (token: string) => {
      nx('reset')(token);
      rmSync(join(root, 'app', 'dist'), { recursive: true, force: true });
      const output = nx('run', 'app:build', '--outputStyle=static')(token);
      // every scenario must still build: a broken setup must not pass as an expected miss
      expect(output).toContain('Successfully ran target build');
      return output;
    };
    const restoredOutput = () => readFileSync(join(root, 'app', 'dist', 'output.txt'), 'utf-8');

    beforeAll(() => {
      root = createWorkspace();
      content = `e2e ${randomUUID()}`;
      writeFileSync(join(root, 'app', 'src', 'input.txt'), content);
    });
    afterAll(() => rmSync(root, { recursive: true, force: true }));

    // the steps build on each other (same hash), in order
    it('developer: miss, uploads to dev/', () => {
      expect(buildFresh(tokens.dev)).not.toContain('[remote cache]');
    });

    it('developer: hit from dev/, outputs restored', () => {
      expect(buildFresh(tokens.dev)).toContain('[remote cache]');
      expect(restoredOutput()).toBe(content);
    });

    it('ci: miss — never reads dev/ — uploads to trusted/', () => {
      expect(buildFresh(tokens.ci)).not.toContain('[remote cache]');
    });

    it('read-only: hit from trusted/, outputs restored', () => {
      expect(buildFresh(tokens.readOnly)).toContain('[remote cache]');
      expect(restoredOutput()).toBe(content);
    });

    it('read-only: miss runs the task, upload is refused, nothing stored', () => {
      writeFileSync(join(root, 'app', 'src', 'input.txt'), `${content} pr`);
      expect(buildFresh(tokens.readOnly)).not.toContain('[remote cache]');
      expect(buildFresh(tokens.ci)).not.toContain('[remote cache]');
    });

    it('wrong token: Nx reports Unauthorized', () => {
      expect(buildFresh('not-a-token')).toContain('Unauthorized');
    });
  });
}

describe.skipIf(urls.length > 0)('nx client e2e', () => {
  it.skip('set NX_CACHE_E2E_URLS to run against cache servers', () => undefined);
});
