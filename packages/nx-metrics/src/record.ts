/**
 * The record one `nx` invocation writes: one line in runs.jsonl, one POST to the collector.
 * `schema` is bumped on breaking changes so collectors can migrate.
 */
import type { CiInfo, GitInfo, MachineInfo, RemoteCacheMode } from './environment.ts';

/** The subset of Nx' `PostTasksExecutionContext` this package reads (no runtime dependency on nx internals). */
export interface HookContext {
  readonly id: string;
  readonly argv: readonly string[];
  readonly startTime: number;
  readonly endTime: number;
  readonly taskResults: Readonly<Record<string, HookTaskResult>>;
}

export interface HookTaskResult {
  status: string;
  code: number;
  task: {
    id: string;
    target: { project: string; target: string; configuration?: string };
    hash?: string;
    cache?: boolean;
    startTime?: number;
    endTime?: number;
  };
}

/** What the cache did for a task — the key figure for the remote cache. */
export type CacheOutcome = 'local-hit' | 'remote-hit' | 'miss' | 'not-cacheable' | 'not-run';

export interface TaskRecord {
  id: string;
  project: string;
  target: string;
  configuration?: string;
  hash?: string;
  /** Raw Nx status (success, failure, local-cache, local-cache-kept-existing, remote-cache, skipped, stopped). */
  status: string;
  cache: CacheOutcome;
  exitCode: number;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
}

export interface RunSummary {
  total: number;
  localHit: number;
  remoteHit: number;
  miss: number;
  notCacheable: number;
  notRun: number;
  failed: number;
  /** hits / (hits + misses); undefined without cacheable tasks. */
  hitRate?: number;
}

export interface RunMeta {
  label?: string;
  tags: Record<string, string>;
  ci: CiInfo;
  git: GitInfo;
  machine: MachineInfo;
  remoteCache: RemoteCacheMode;
  envReliable: boolean;
}

export interface RunRecord extends RunMeta {
  schema: 1;
  runId: string;
  command: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  summary: RunSummary;
  tasks: TaskRecord[];
}

export const RUN_RECORD_SCHEMA = 1;

export function cacheOutcome(status: string, cacheable: boolean | undefined): CacheOutcome {
  switch (status) {
    case 'local-cache':
    case 'local-cache-kept-existing':
      return 'local-hit';
    case 'remote-cache':
      return 'remote-hit';
    case 'success':
    case 'failure':
      return cacheable === false ? 'not-cacheable' : 'miss';
    default:
      return 'not-run';
  }
}

export function toTaskRecord(result: HookTaskResult): TaskRecord {
  const { task } = result;
  const timed = typeof task.startTime === 'number' && typeof task.endTime === 'number';
  return {
    id: task.id,
    project: task.target.project,
    target: task.target.target,
    configuration: task.target.configuration,
    hash: task.hash,
    status: result.status,
    cache: cacheOutcome(result.status, task.cache),
    exitCode: result.code,
    startTime: task.startTime,
    endTime: task.endTime,
    durationMs: timed ? (task.endTime as number) - (task.startTime as number) : undefined,
  };
}

export function summarizeTasks(tasks: readonly TaskRecord[]): RunSummary {
  const count = (outcome: CacheOutcome) => tasks.filter((task) => task.cache === outcome).length;
  const localHit = count('local-hit');
  const remoteHit = count('remote-hit');
  const miss = count('miss');
  const cacheable = localHit + remoteHit + miss;
  return {
    total: tasks.length,
    localHit,
    remoteHit,
    miss,
    notCacheable: count('not-cacheable'),
    notRun: count('not-run'),
    failed: tasks.filter((task) => task.status === 'failure').length,
    hitRate: cacheable === 0 ? undefined : (localHit + remoteHit) / cacheable,
  };
}

/** `[node, .../nx.js, run-many, -t, build]` → `run-many -t build`. */
export function commandOf(argv: readonly string[]): string {
  return argv.slice(2).join(' ');
}

export function toRunRecord(context: HookContext, meta: RunMeta): RunRecord {
  const tasks = Object.values(context.taskResults).map(toTaskRecord);
  return {
    schema: RUN_RECORD_SCHEMA,
    runId: context.id,
    command: commandOf(context.argv),
    startTime: context.startTime,
    endTime: context.endTime,
    durationMs: context.endTime - context.startTime,
    ...meta,
    summary: summarizeTasks(tasks),
    tasks,
  };
}
