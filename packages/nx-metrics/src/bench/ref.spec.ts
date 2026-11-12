import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkoutRef, defaultPluginPath, detectInstallCommand, registerPlugin } from './ref.ts';

let repo: string;
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf-8' }).trim();

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'nx-metrics-ref-'));
  git('init', '--quiet');
  git('config', 'user.email', 'test@localhost');
  git('config', 'user.name', 'test');
  writeFileSync(join(repo, 'nx.json'), JSON.stringify({ plugins: ['@nx/js'] }));
  git('add', '.');
  git('commit', '--quiet', '-m', 'baseline');
  writeFileSync(join(repo, 'later.txt'), 'later');
  git('add', '.');
  git('commit', '--quiet', '-m', 'later');
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe('bench --ref', () => {
  it('checks out the ref, registers + commits the plugin, keeps the tree clean, cleans up', () => {
    const dir = join(repo, 'out', 'worktree');
    const checkout = checkoutRef({ repo, ref: 'HEAD~1', dir, install: 'none', pluginPath: '/abs/plugin.ts' });
    expect(checkout.sha).toBe(git('rev-parse', 'HEAD~1'));
    expect(checkout.pluginAdded).toBe(true);
    expect(existsSync(join(dir, 'later.txt'))).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, 'nx.json'), 'utf-8')).plugins).toEqual([
      '@nx/js',
      { plugin: '/abs/plugin.ts', options: {} },
    ]);
    expect(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf-8' })).toBe('');
    checkout.cleanup();
    expect(existsSync(dir)).toBe(false);
    expect(git('worktree', 'list')).not.toContain('worktree');
  });

  it('removes the worktree when the install fails', () => {
    const dir = join(repo, 'out', 'failing');
    expect(() => checkoutRef({ repo, ref: 'HEAD', dir, install: 'exit 7' })).toThrow(/install failed \(exit 7\)/);
    expect(existsSync(dir)).toBe(false);
  });

  it('rejects unknown refs', () => {
    expect(() => checkoutRef({ repo, ref: 'nope', dir: join(repo, 'x'), install: 'none' })).toThrow();
  });

  it('keeps an existing nx-metrics plugin', () => {
    writeFileSync(
      join(repo, 'nx.json'),
      JSON.stringify({ plugins: [{ plugin: '@berger-engineering/nx-metrics/plugin' }] }),
    );
    expect(registerPlugin(repo, '/abs/plugin.ts')).toBe(false);
  });

  it('detects the install command from the lockfile', () => {
    expect(detectInstallCommand(repo)).toBeUndefined();
    writeFileSync(join(repo, 'package-lock.json'), '{}');
    expect(detectInstallCommand(repo)).toBe('npm ci');
    writeFileSync(join(repo, 'pnpm-lock.yaml'), '');
    expect(detectInstallCommand(repo)).toBe('pnpm install --frozen-lockfile');
    expect(defaultPluginPath()).toMatch(/plugin\.ts$/);
  });
});
