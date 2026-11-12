/**
 * Benchmark config (default `<repo>/nx-metrics.bench.json`). A scenario = command + cache state + optional file touches.
 *
 *   cache "keep"        Nx state survives between iterations → after warmup: warm local cache
 *   cache "none"        NX_SKIP_NX_CACHE=true → pure execution time (cold, no cache at all)
 *   cache "fresh-agent" local cache + workspace data wiped before every iteration → like a fresh CI agent,
 *                       hits come from the remote cache only (graph is recomputed as well)
 *   remoteCache false   NX_SKIP_REMOTE_CACHE=true → isolate the remote cache's effect
 *   touch [files]       append a unique comment before every iteration → hashes change like in a real PR
 */
import { existsSync, readFileSync } from 'node:fs';

export type CacheMode = 'keep' | 'none' | 'fresh-agent';

export interface BenchScenario {
  name: string;
  description?: string;
  command: string;
  cache?: CacheMode;
  remoteCache?: boolean;
  touch?: string[];
  env?: Record<string, string>;
  iterations?: number;
  warmup?: number;
}

export interface BenchConfig {
  iterations: number;
  warmup: number;
  env: Record<string, string>;
  scenarios: BenchScenario[];
}

/** Daemon off: reproducible timings and the hook sees this process' env (label/tags). TUI off: plain logs. */
export const DEFAULT_BENCH_ENV: Record<string, string> = { NX_DAEMON: 'false', NX_TUI: 'false' };

const CACHE_MODES: CacheMode[] = ['keep', 'none', 'fresh-agent'];

export function parseBenchConfig(raw: unknown): BenchConfig {
  if (typeof raw !== 'object' || raw === null) throw new Error('bench config must be an object');
  const input = raw as Partial<BenchConfig>;
  if (!Array.isArray(input.scenarios) || input.scenarios.length === 0)
    throw new Error('bench config needs at least one scenario');
  const names = new Set<string>();
  for (const scenario of input.scenarios) {
    if (!scenario?.name || !scenario.command) throw new Error('every scenario needs "name" and "command"');
    if (!/^[\w.-]+$/.test(scenario.name))
      throw new Error(`scenario name "${scenario.name}": only letters, digits, . _ -`);
    if (names.has(scenario.name)) throw new Error(`duplicate scenario "${scenario.name}"`);
    if (scenario.cache && !CACHE_MODES.includes(scenario.cache))
      throw new Error(`scenario "${scenario.name}": cache must be ${CACHE_MODES.join(' | ')}`);
    names.add(scenario.name);
  }
  return {
    iterations: input.iterations ?? 5,
    warmup: input.warmup ?? 1,
    env: { ...DEFAULT_BENCH_ENV, ...input.env },
    scenarios: input.scenarios,
  };
}

export function loadBenchConfig(file: string): BenchConfig {
  if (!existsSync(file)) throw new Error(`bench config not found: ${file} (see README → Benchmarks)`);
  return parseBenchConfig(JSON.parse(readFileSync(file, 'utf-8')));
}

/** Env a scenario adds on top of the config env (cache switches before the scenario's own env, which wins). */
export function scenarioEnv(scenario: BenchScenario): Record<string, string> {
  return {
    ...(scenario.cache === 'none' ? { NX_SKIP_NX_CACHE: 'true' } : {}),
    ...(scenario.remoteCache === false ? { NX_SKIP_REMOTE_CACHE: 'true' } : {}),
    ...scenario.env,
  };
}
