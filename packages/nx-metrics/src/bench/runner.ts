/**
 * Runs the bench scenarios: per iteration prepare cache state + touches, run the command, take wall-clock time,
 * then join the plugin's run records (tagged with bench id/scenario/iteration) for cache hit numbers.
 *
 * Nx state is isolated per scenario under <out>/nx-state/<scenario> (cache AND workspace data together — setting only
 * the cache dir lets the shared DB index outputs that do not exist → phantom hits). The developer's cache is untouched.
 */
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, rmSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { gitInfo, machineInfo, type GitInfo, type MachineInfo } from '../environment.ts';
import { summarizeTasks, type RunRecord, type RunSummary, type TaskRecord } from '../record.ts';
import { readJsonl } from '../sinks.ts';
import { summarize, type Summary } from '../stats.ts';
import { scenarioEnv, type BenchConfig, type BenchScenario, type CacheMode } from './config.ts';
import { FileToucher } from './touch.ts';

export interface BenchOptions {
  repo: string;
  config: BenchConfig;
  outDir: string;
  /** Free label of this bench, e.g. `baseline` or `after-slicing`. */
  name: string;
  scenarios?: string[];
  iterations?: number;
  /** Use the workspace's own Nx state instead of isolated dirs (forbids `fresh-agent`, it would wipe it). */
  workspaceState?: boolean;
  keepGoing?: boolean;
  log?: (line: string) => void;
}

export interface IterationResult {
  index: number;
  durationMs: number;
  exitCode: number;
  /** Number of `nx` invocations the plugin recorded (0 → plugin not registered). */
  nxRuns: number;
  tasks?: RunSummary;
}

export interface SlowTask {
  id: string;
  medianMs: number;
}

export interface ScenarioResult {
  name: string;
  description?: string;
  command: string;
  cache: CacheMode;
  remoteCache: boolean;
  touch: string[];
  iterations: IterationResult[];
  failed: number;
  stats?: Summary;
  tasks?: RunSummary;
  localHitRate?: number;
  remoteHitRate?: number;
  slowestMisses: SlowTask[];
}

export interface BenchResult {
  schema: 1;
  tool: 'nx-metrics-bench';
  name: string;
  benchId: string;
  startedAt: string;
  finishedAt: string;
  git: GitInfo & { dirty: boolean };
  machine: MachineInfo;
  iterations: number;
  warmup: number;
  env: Record<string, string>;
  isolatedState: boolean;
  pluginRecorded: boolean;
  scenarios: ScenarioResult[];
}

interface IterationContext {
  options: BenchOptions;
  scenario: BenchScenario;
  benchId: string;
  stateDir?: string;
  metricsFile: string;
  toucher: FileToucher;
}

function runShell(command: string, cwd: string, env: NodeJS.ProcessEnv, logFile: string): Promise<number> {
  const fd = openSync(logFile, 'w');
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, { cwd, env, shell: true, stdio: ['ignore', fd, fd] });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      closeSync(fd);
      resolvePromise(code ?? (signal ? 128 : 1));
    });
  });
}

function wipeState(stateDir: string): void {
  rmSync(stateDir, { recursive: true, force: true });
  mkdirSync(join(stateDir, 'cache'), { recursive: true });
  mkdirSync(join(stateDir, 'data'), { recursive: true });
}

function iterationEnv(context: IterationContext, index: number, phase: 'warmup' | 'measure'): NodeJS.ProcessEnv {
  const { options, scenario, benchId, stateDir, metricsFile } = context;
  return {
    ...process.env,
    PATH: [join(options.repo, 'node_modules', '.bin'), process.env.PATH].join(delimiter),
    ...options.config.env,
    ...(stateDir
      ? { NX_CACHE_DIRECTORY: join(stateDir, 'cache'), NX_WORKSPACE_DATA_DIRECTORY: join(stateDir, 'data') }
      : {}),
    ...scenarioEnv(scenario),
    NX_METRICS_FILE: metricsFile,
    NX_METRICS_LABEL: `bench:${options.name}:${scenario.name}`,
    NX_METRICS_TAGS: `bench=${benchId},scenario=${scenario.name},iteration=${index},phase=${phase}`,
  };
}

export function recordsOf(
  records: readonly RunRecord[],
  benchId: string,
  scenario: string,
  index: number,
): RunRecord[] {
  return records.filter(
    (record) =>
      record.tags?.bench === benchId && record.tags.scenario === scenario && record.tags.iteration === String(index),
  );
}

async function runIteration(
  context: IterationContext,
  index: number,
  phase: 'warmup' | 'measure',
): Promise<IterationResult> {
  const { options, scenario, stateDir } = context;
  if (scenario.cache === 'fresh-agent' && stateDir) wipeState(stateDir);
  for (const file of scenario.touch ?? [])
    context.toucher.touch(resolve(options.repo, file), `${context.benchId}-${scenario.name}-${index}`);

  const logFile = join(options.outDir, 'logs', `${scenario.name}-${phase}-${index}.log`);
  const started = performance.now();
  const exitCode = await runShell(scenario.command, options.repo, iterationEnv(context, index, phase), logFile);
  const durationMs = performance.now() - started;

  const runs = recordsOf(readJsonl(context.metricsFile), context.benchId, scenario.name, index);
  const tasks = runs.length ? summarizeTasks(runs.flatMap((run) => run.tasks)) : undefined;
  return { index, durationMs, exitCode, nxRuns: runs.length, tasks };
}

export function slowestMisses(tasks: readonly TaskRecord[], limit = 5): SlowTask[] {
  const durations = new Map<string, number[]>();
  for (const task of tasks) {
    if (task.cache !== 'miss' || task.durationMs === undefined) continue;
    durations.set(task.id, [...(durations.get(task.id) ?? []), task.durationMs]);
  }
  return [...durations]
    .map(([id, values]) => ({ id, medianMs: summarize(values)?.median ?? 0 }))
    .sort((a, b) => b.medianMs - a.medianMs)
    .slice(0, limit);
}

export function summarizeScenario(
  scenario: BenchScenario,
  iterations: IterationResult[],
  measuredTasks: TaskRecord[],
): ScenarioResult {
  const succeeded = iterations.filter((iteration) => iteration.exitCode === 0);
  const tasks = measuredTasks.length ? summarizeTasks(measuredTasks) : undefined;
  const cacheable = tasks ? tasks.localHit + tasks.remoteHit + tasks.miss : 0;
  return {
    name: scenario.name,
    description: scenario.description,
    command: scenario.command,
    cache: scenario.cache ?? 'keep',
    remoteCache: scenario.remoteCache !== false,
    touch: scenario.touch ?? [],
    iterations,
    failed: iterations.length - succeeded.length,
    stats: summarize(succeeded.map((iteration) => iteration.durationMs)),
    tasks,
    localHitRate: tasks && cacheable ? tasks.localHit / cacheable : undefined,
    remoteHitRate: tasks && cacheable ? tasks.remoteHit / cacheable : undefined,
    slowestMisses: slowestMisses(measuredTasks),
  };
}

async function runScenario(context: IterationContext): Promise<ScenarioResult> {
  const { options, scenario } = context;
  const log = options.log ?? (() => undefined);
  const warmup = scenario.warmup ?? options.config.warmup;
  const iterations = options.iterations ?? scenario.iterations ?? options.config.iterations;
  if (context.stateDir) wipeState(context.stateDir);

  const results: IterationResult[] = [];
  const total = warmup + iterations;
  for (let index = 0; index < total; index++) {
    const phase = index < warmup ? 'warmup' : 'measure';
    const result = await runIteration(context, index, phase);
    log(
      `  ${scenario.name} ${phase} ${index + 1}/${total}: ${(result.durationMs / 1000).toFixed(2)} s${result.exitCode ? ` (exit ${result.exitCode})` : ''}`,
    );
    if (result.exitCode !== 0 && !options.keepGoing) {
      throw new Error(
        `scenario "${scenario.name}" failed (exit ${result.exitCode}), see ${join(options.outDir, 'logs')}`,
      );
    }
    if (phase === 'measure') results.push(result);
  }

  const measured = new Set(results.map((result) => String(result.index)));
  const measuredTasks = readJsonl(context.metricsFile)
    .filter(
      (record) =>
        record.tags?.bench === context.benchId &&
        record.tags.scenario === scenario.name &&
        measured.has(record.tags.iteration),
    )
    .flatMap((record) => record.tasks);
  return summarizeScenario(scenario, results, measuredTasks);
}

function selectScenarios(config: BenchConfig, names?: string[]): BenchScenario[] {
  if (!names?.length) return config.scenarios;
  const unknown = names.filter((name) => !config.scenarios.some((scenario) => scenario.name === name));
  if (unknown.length) throw new Error(`unknown scenario(s): ${unknown.join(', ')}`);
  return config.scenarios.filter((scenario) => names.includes(scenario.name));
}

function isDirty(repo: string): boolean {
  try {
    return execFileSync('git', ['status', '--porcelain'], { cwd: repo, encoding: 'utf-8' }).trim() !== '';
  } catch {
    return false;
  }
}

export async function runBench(options: BenchOptions): Promise<BenchResult> {
  const scenarios = selectScenarios(options.config, options.scenarios);
  if (options.workspaceState && scenarios.some((scenario) => scenario.cache === 'fresh-agent')) {
    throw new Error('cache "fresh-agent" wipes the Nx state — not allowed with --workspace-state');
  }
  const benchId = randomUUID().slice(0, 8);
  const metricsFile = join(options.outDir, 'runs.jsonl');
  mkdirSync(join(options.outDir, 'logs'), { recursive: true });
  const startedAt = new Date().toISOString();
  const git = { ...gitInfo(options.repo, { isCi: false }), dirty: isDirty(options.repo) };
  if (git.dirty)
    options.log?.(
      '⚠ dirty working tree: `nx affected` counts uncommitted changes too (nx.json, lockfile → everything affected)',
    );

  const toucher = new FileToucher();
  const onSignal = () => {
    toucher.restore();
    process.exit(130);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  const results: ScenarioResult[] = [];
  try {
    for (const scenario of scenarios) {
      options.log?.(`▶ ${scenario.name}: ${scenario.command}`);
      const stateDir = options.workspaceState ? undefined : join(options.outDir, 'nx-state', scenario.name);
      results.push(await runScenario({ options, scenario, benchId, stateDir, metricsFile, toucher }));
      toucher.restore();
    }
  } finally {
    toucher.restore();
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  return {
    schema: 1,
    tool: 'nx-metrics-bench',
    name: options.name,
    benchId,
    startedAt,
    finishedAt: new Date().toISOString(),
    git,
    machine: machineInfo(options.repo),
    iterations: options.iterations ?? options.config.iterations,
    warmup: options.config.warmup,
    env: options.config.env,
    isolatedState: !options.workspaceState,
    pluginRecorded: results.some((scenario) => scenario.iterations.some((iteration) => iteration.nxRuns > 0)),
    scenarios: results,
  };
}
