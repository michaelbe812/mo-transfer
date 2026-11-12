import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { benchToMarkdown, compareBench, comparisonToMarkdown } from './compare.ts';
import { parseBenchConfig, scenarioEnv } from './config.ts';
import { runBench, type BenchResult } from './runner.ts';
import { commentFor, FileToucher } from './touch.ts';

/**
 * Stand-in for `nx`: one cacheable task whose "hash" is the content of src/a.ts. A hit when the hash is in
 * NX_CACHE_DIRECTORY (unless NX_SKIP_NX_CACHE), else a miss that fills the cache. Writes a run record like the plugin.
 */
const FAKE_NX = `
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
const hash = createHash('sha1').update(readFileSync('src/a.ts')).digest('hex');
const cacheDir = process.env.NX_CACHE_DIRECTORY;
const entry = join(cacheDir, hash);
const hit = process.env.NX_SKIP_NX_CACHE !== 'true' && existsSync(entry);
if (!hit) { mkdirSync(cacheDir, { recursive: true }); writeFileSync(entry, ''); }
const tags = Object.fromEntries(process.env.NX_METRICS_TAGS.split(',').map((pair) => pair.split('=')));
const now = Date.now();
const task = { id: 'a:build', project: 'a', target: 'build', hash, status: hit ? 'local-cache' : 'success', cache: hit ? 'local-hit' : 'miss', exitCode: 0, startTime: now, endTime: now + (hit ? 1 : 50), durationMs: hit ? 1 : 50 };
const summary = { total: 1, localHit: hit ? 1 : 0, remoteHit: 0, miss: hit ? 0 : 1, notCacheable: 0, notRun: 0, failed: 0, hitRate: hit ? 1 : 0 };
appendFileSync(process.env.NX_METRICS_FILE, JSON.stringify({ schema: 1, runId: String(now), command: 'build', startTime: now, endTime: now, durationMs: 0, label: process.env.NX_METRICS_LABEL, tags, summary, tasks: [task] }) + '\\n');
`;

let repo: string;

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), 'nx-metrics-bench-'));
  mkdirSync(join(repo, 'src'));
  writeFileSync(join(repo, 'src', 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(repo, 'fake-nx.mjs'), FAKE_NX);
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

async function bench(scenarios: unknown[], name = 'test'): Promise<BenchResult> {
  return runBench({
    repo,
    outDir: join(repo, 'out', name),
    name,
    config: parseBenchConfig({ iterations: 3, warmup: 1, scenarios }),
  });
}

describe('runBench', () => {
  it('measures cache modes: keep → hits after warmup, none → always miss, fresh-agent → wiped each time', async () => {
    const result = await bench([
      { name: 'warm', command: 'node fake-nx.mjs', cache: 'keep' },
      { name: 'cold', command: 'node fake-nx.mjs', cache: 'none' },
      { name: 'fresh', command: 'node fake-nx.mjs', cache: 'fresh-agent' },
    ]);
    const byName = Object.fromEntries(result.scenarios.map((scenario) => [scenario.name, scenario]));
    expect(result.pluginRecorded).toBe(true);
    expect(byName.warm.iterations).toHaveLength(3);
    expect(byName.warm.tasks).toMatchObject({ localHit: 3, miss: 0 });
    expect(byName.cold.tasks).toMatchObject({ localHit: 0, miss: 3 });
    expect(byName.fresh.tasks).toMatchObject({ localHit: 0, miss: 3 });
    expect(byName.warm.stats?.n).toBe(3);
    expect(byName.cold.slowestMisses[0]).toEqual({ id: 'a:build', medianMs: 50 });
  });

  it('touch changes the hash every iteration and restores the file', async () => {
    const result = await bench([{ name: 'pr', command: 'node fake-nx.mjs', touch: ['src/a.ts'] }]);
    expect(result.scenarios[0].tasks).toMatchObject({ miss: 3, localHit: 0 });
    expect(readFileSync(join(repo, 'src', 'a.ts'), 'utf-8')).toBe('export const a = 1;\n');
  });

  it('stops on failure unless keep-going, and restores touched files', async () => {
    await expect(
      bench([{ name: 'broken', command: 'node -e "process.exit(3)"', touch: ['src/a.ts'] }]),
    ).rejects.toThrow(/exit 3/);
    expect(readFileSync(join(repo, 'src', 'a.ts'), 'utf-8')).toBe('export const a = 1;\n');
    const result = await runBench({
      repo,
      outDir: join(repo, 'out', 'kg'),
      name: 'kg',
      keepGoing: true,
      config: parseBenchConfig({
        iterations: 2,
        warmup: 0,
        scenarios: [{ name: 'broken', command: 'node -e "process.exit(3)"' }],
      }),
    });
    expect(result.scenarios[0].failed).toBe(2);
    expect(result.scenarios[0].stats).toBeUndefined();
    expect(result.pluginRecorded).toBe(false);
  });

  it('refuses fresh-agent on the workspace state', async () => {
    await expect(
      runBench({
        repo,
        outDir: join(repo, 'out'),
        name: 'x',
        workspaceState: true,
        config: parseBenchConfig({ scenarios: [{ name: 'f', command: 'true', cache: 'fresh-agent' }] }),
      }),
    ).rejects.toThrow(/workspace-state/);
  });

  it('compares two results', async () => {
    const before = await bench([{ name: 'warm', command: 'node fake-nx.mjs' }], 'before');
    const after = await bench(
      [
        { name: 'warm', command: 'node fake-nx.mjs' },
        { name: 'new', command: 'node fake-nx.mjs' },
      ],
      'after',
    );
    const deltas = compareBench(before, after);
    expect(deltas.map((delta) => delta.scenario)).toEqual(['warm', 'new']);
    expect(deltas[0].deltaMs).toBeTypeOf('number');
    expect(deltas[1].deltaMs).toBeUndefined();
    expect(comparisonToMarkdown(before, after)).toContain('| warm |');
    expect(benchToMarkdown(after)).toContain('| new |');
  });
});

describe('config', () => {
  it('validates and fills defaults', () => {
    const config = parseBenchConfig({ scenarios: [{ name: 'a', command: 'nx build' }] });
    expect(config).toMatchObject({ iterations: 5, warmup: 1, env: { NX_DAEMON: 'false', NX_TUI: 'false' } });
    expect(() => parseBenchConfig({ scenarios: [] })).toThrow(/at least one/);
    expect(() => parseBenchConfig({ scenarios: [{ name: 'a b', command: 'x' }] })).toThrow(/only letters/);
    expect(() =>
      parseBenchConfig({
        scenarios: [
          { name: 'a', command: 'x' },
          { name: 'a', command: 'y' },
        ],
      }),
    ).toThrow(/duplicate/);
    expect(() => parseBenchConfig({ scenarios: [{ name: 'a', command: 'x', cache: 'warm' }] })).toThrow(
      /cache must be/,
    );
  });

  it('maps cache switches to Nx env vars, scenario env wins', () => {
    expect(scenarioEnv({ name: 'a', command: 'x', cache: 'none', remoteCache: false })).toEqual({
      NX_SKIP_NX_CACHE: 'true',
      NX_SKIP_REMOTE_CACHE: 'true',
    });
    expect(scenarioEnv({ name: 'a', command: 'x', cache: 'none', env: { NX_SKIP_NX_CACHE: 'false' } })).toEqual({
      NX_SKIP_NX_CACHE: 'false',
    });
  });
});

describe('touch', () => {
  it('uses the comment syntax of the file type', () => {
    expect(commentFor('a.ts', 'x')).toBe('// x');
    expect(commentFor('a.css', 'x')).toBe('/* x */');
    expect(commentFor('a.html', 'x')).toBe('<!-- x -->');
    expect(() => commentFor('a.json', 'x')).toThrow(/JSON/);
  });

  it('appends from the original each time, restore resets', () => {
    const file = join(repo, 'src', 'a.ts');
    const toucher = new FileToucher();
    toucher.touch(file, '1');
    toucher.touch(file, '2');
    expect(readFileSync(file, 'utf-8')).toBe('export const a = 1;\n// nx-metrics bench 2\n');
    toucher.restore();
    expect(readFileSync(file, 'utf-8')).toBe('export const a = 1;\n');
  });
});
