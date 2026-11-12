/**
 * `bench --ref <rev>`: benchmark another commit (the baseline before the refactoring) without touching the checkout.
 *   1. detached git worktree of <rev> under <out>/worktree
 *   2. install dependencies (detected from the lockfile, or --install "<cmd>", or none)
 *   3. register this plugin in the worktree's nx.json (absolute path) if missing and commit that in the worktree,
 *      so the tree stays clean (`nx affected --base=HEAD` would otherwise see a changed nx.json → everything affected)
 *   4. caller runs the bench there; cleanup removes the worktree
 * Nx state during install is pointed into the worktree too (cache AND workspace data, never the main DB).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RefCheckout {
  dir: string;
  ref: string;
  sha: string;
  pluginAdded: boolean;
  cleanup(): void;
}

export interface RefOptions {
  repo: string;
  ref: string;
  dir: string;
  /** Shell command, `none` to skip, undefined = detect from lockfile. */
  install?: string;
  /** Plugin module registered when the ref has none (default: this package's plugin). */
  pluginPath?: string;
  log?: (line: string) => void;
}

const git = (cwd: string, args: string[]) => execFileSync('git', args, { cwd, encoding: 'utf-8' }).trim();

export function detectInstallCommand(dir: string): string | undefined {
  if (existsSync(join(dir, 'pnpm-lock.yaml'))) return 'pnpm install --frozen-lockfile';
  if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb'))) return 'bun install --frozen-lockfile';
  if (existsSync(join(dir, 'yarn.lock'))) return 'yarn install --immutable || yarn install --frozen-lockfile';
  if (existsSync(join(dir, 'package-lock.json'))) return 'npm ci';
  return undefined;
}

/** This package's plugin, as .ts from the sources or .js from dist (same extension as this module). */
export function defaultPluginPath(): string {
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  return fileURLToPath(new URL(`../plugin.${extension}`, import.meta.url));
}

interface NxJson {
  plugins?: Array<string | { plugin: string; options?: unknown }>;
}

const isMetricsPlugin = (entry: string | { plugin: string }) =>
  (typeof entry === 'string' ? entry : entry.plugin).includes('nx-metrics');

/** Adds the plugin to nx.json unless one is registered; returns whether it changed the file. */
export function registerPlugin(dir: string, pluginPath: string): boolean {
  const file = join(dir, 'nx.json');
  if (!existsSync(file)) throw new Error(`no nx.json in ${dir}`);
  const nxJson = JSON.parse(readFileSync(file, 'utf-8')) as NxJson;
  if (nxJson.plugins?.some(isMetricsPlugin)) return false;
  nxJson.plugins = [...(nxJson.plugins ?? []), { plugin: pluginPath, options: {} }];
  writeFileSync(file, `${JSON.stringify(nxJson, null, 2)}\n`);
  return true;
}

export function checkoutRef(options: RefOptions): RefCheckout {
  const log = options.log ?? (() => undefined);
  const dir = resolve(options.dir);
  const sha = git(options.repo, ['rev-parse', '--verify', `${options.ref}^{commit}`]);
  if (existsSync(dir)) throw new Error(`${dir} exists — remove it or choose another --out`);
  log(`worktree ${options.ref} (${sha.slice(0, 8)}) → ${dir}`);
  git(options.repo, ['worktree', 'add', '--detach', dir, sha]);
  const cleanup = () => {
    try {
      git(options.repo, ['worktree', 'remove', '--force', dir]);
    } catch {
      // already gone
    }
  };

  try {
    const install = options.install ?? detectInstallCommand(dir);
    if (install && install !== 'none') {
      log(`install: ${install}`);
      const result = spawnSync(install, {
        cwd: dir,
        shell: true,
        stdio: 'inherit',
        env: {
          ...process.env,
          NX_DAEMON: 'false',
          NX_CACHE_DIRECTORY: join(dir, '.nx', 'cache'),
          NX_WORKSPACE_DATA_DIRECTORY: join(dir, '.nx', 'workspace-data'),
        },
      });
      if (result.status !== 0) throw new Error(`install failed (exit ${result.status}): ${install}`);
    }
    const pluginAdded = registerPlugin(dir, options.pluginPath ?? defaultPluginPath());
    if (pluginAdded) {
      log('plugin registered in the worktree (committed there, tree stays clean)');
      git(dir, ['add', 'nx.json']);
      git(dir, [
        '-c',
        'user.name=nx-metrics',
        '-c',
        'user.email=nx-metrics@localhost',
        'commit',
        '--quiet',
        '--no-verify',
        '-m',
        'nx-metrics bench: register plugin',
      ]);
    }
    return { dir, ref: options.ref, sha, pluginAdded, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}
