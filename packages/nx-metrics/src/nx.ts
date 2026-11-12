/** Runs the workspace's own Nx (its version, its plugins) — no global nx needed. */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export function nxBin(repo: string): string {
  const require = createRequire(join(repo, 'package.json'));
  const packageJsonPath = require.resolve('nx/package.json');
  const bin = (JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { bin: Record<string, string> }).bin.nx;
  return join(dirname(packageJsonPath), bin);
}

export function runNx(repo: string, args: string[], env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(process.execPath, [nxBin(repo), ...args], {
    cwd: repo,
    encoding: 'utf-8',
    env: { ...process.env, NX_TUI: 'false', NX_METRICS_DISABLED: 'true', ...env },
    maxBuffer: 256 * 1024 * 1024,
  });
  if (result.status !== 0)
    throw new Error(`nx ${args.join(' ')} failed (exit ${result.status}):\n${result.stderr || result.stdout}`);
  return result.stdout;
}
