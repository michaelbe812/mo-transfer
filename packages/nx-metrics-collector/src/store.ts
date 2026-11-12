/**
 * Postgres store: `runs` (one row per nx invocation) + `tasks` (one row per task), plus views Grafana reads.
 * The schema is created/updated idempotently on startup (`migrate`), no migration tool needed for this size.
 * Inserts are idempotent per runId (re-pushing a CI artifact does not double count).
 */
import pg from 'pg';
import type { RunRecord } from './run-record.ts';

export interface RunStore {
  insert(records: readonly RunRecord[]): Promise<{ inserted: number; duplicates: number }>;
  close(): Promise<void>;
}

export const SCHEMA_SQL = `
create table if not exists runs (
  run_id         text primary key,
  started_at     timestamptz not null,
  ended_at       timestamptz not null,
  duration_ms    integer not null,
  command        text not null,
  label          text,
  tags           jsonb not null default '{}',
  ci             boolean not null default false,
  ci_provider    text,
  pipeline_id    text,
  job            text,
  git_sha        text,
  git_branch     text,
  os             text,
  arch           text,
  cpus           integer,
  cpu_model      text,
  memory_gb      integer,
  node_version   text,
  nx_version     text,
  remote_cache   text,
  env_reliable   boolean,
  tasks_total    integer not null default 0,
  local_hit      integer not null default 0,
  remote_hit     integer not null default 0,
  miss           integer not null default 0,
  not_cacheable  integer not null default 0,
  not_run        integer not null default 0,
  failed         integer not null default 0,
  hit_rate       double precision,
  received_at    timestamptz not null default now()
);
create index if not exists runs_started_at on runs (started_at);
create index if not exists runs_branch on runs (git_branch);

create table if not exists tasks (
  run_id         text not null references runs (run_id) on delete cascade,
  task_id        text not null,
  project        text not null,
  target         text not null,
  configuration  text,
  hash           text,
  status         text not null,
  cache          text not null,
  exit_code      integer not null default 0,
  started_at     timestamptz,
  ended_at       timestamptz,
  duration_ms    integer,
  primary key (run_id, task_id)
);
create index if not exists tasks_target on tasks (target);
create index if not exists tasks_task_id on tasks (task_id);
create index if not exists tasks_started_at on tasks (started_at);

-- median duration of successful misses = what a hit of that task saves (fallback: per target)
create or replace view task_miss_baseline as
  select task_id, percentile_cont(0.5) within group (order by duration_ms) as median_ms, count(*) as samples
  from tasks where cache = 'miss' and status = 'success' and duration_ms is not null group by task_id;
create or replace view target_miss_baseline as
  select target, percentile_cont(0.5) within group (order by duration_ms) as median_ms, count(*) as samples
  from tasks where cache = 'miss' and status = 'success' and duration_ms is not null group by target;

-- one row per task with run context and the estimated time a hit saved
create or replace view task_facts as
  select t.*, r.started_at as run_started_at, r.ci, r.ci_provider, r.git_branch, r.label, r.remote_cache, r.command,
    case when t.cache in ('local-hit', 'remote-hit')
      then greatest(0, coalesce(tb.median_ms, gb.median_ms, 0) - coalesce(t.duration_ms, 0))
      else 0 end as saved_ms
  from tasks t
  join runs r using (run_id)
  left join task_miss_baseline tb on tb.task_id = t.task_id
  left join target_miss_baseline gb on gb.target = t.target;
`;

const toDate = (ms: number | undefined) => (typeof ms === 'number' ? new Date(ms) : null);

/** Row values for `runs`, in column order of INSERT_RUN. Exported for tests. */
export function runRow(record: RunRecord): unknown[] {
  const summary = record.summary;
  const count = (outcome: string) => record.tasks.filter((task) => task.cache === outcome).length;
  const localHit = summary?.localHit ?? count('local-hit');
  const remoteHit = summary?.remoteHit ?? count('remote-hit');
  const miss = summary?.miss ?? count('miss');
  const cacheable = localHit + remoteHit + miss;
  return [
    record.runId,
    new Date(record.startTime),
    new Date(record.endTime),
    Math.round(record.durationMs),
    record.command,
    record.label ?? null,
    JSON.stringify(record.tags ?? {}),
    record.ci?.isCi ?? false,
    record.ci?.provider ?? null,
    record.ci?.pipelineId ?? null,
    record.ci?.job ?? null,
    record.git?.sha ?? null,
    record.git?.branch ?? null,
    record.machine?.os ?? null,
    record.machine?.arch ?? null,
    record.machine?.cpus ?? null,
    record.machine?.cpuModel ?? null,
    record.machine?.memoryGb ?? null,
    record.machine?.node ?? null,
    record.machine?.nx ?? null,
    record.remoteCache ?? null,
    record.envReliable ?? null,
    summary?.total ?? record.tasks.length,
    localHit,
    remoteHit,
    miss,
    summary?.notCacheable ?? count('not-cacheable'),
    summary?.notRun ?? count('not-run'),
    summary?.failed ?? record.tasks.filter((task) => task.status === 'failure').length,
    cacheable ? (localHit + remoteHit) / cacheable : null,
  ];
}

export function taskRows(record: RunRecord): unknown[][] {
  return record.tasks.map((task) => [
    record.runId,
    task.id,
    task.project,
    task.target,
    task.configuration ?? null,
    task.hash ?? null,
    task.status,
    task.cache,
    task.exitCode ?? 0,
    toDate(task.startTime),
    toDate(task.endTime),
    typeof task.durationMs === 'number' ? Math.round(task.durationMs) : null,
  ]);
}

const RUN_COLUMNS = [
  'run_id',
  'started_at',
  'ended_at',
  'duration_ms',
  'command',
  'label',
  'tags',
  'ci',
  'ci_provider',
  'pipeline_id',
  'job',
  'git_sha',
  'git_branch',
  'os',
  'arch',
  'cpus',
  'cpu_model',
  'memory_gb',
  'node_version',
  'nx_version',
  'remote_cache',
  'env_reliable',
  'tasks_total',
  'local_hit',
  'remote_hit',
  'miss',
  'not_cacheable',
  'not_run',
  'failed',
  'hit_rate',
];
const TASK_COLUMNS = [
  'run_id',
  'task_id',
  'project',
  'target',
  'configuration',
  'hash',
  'status',
  'cache',
  'exit_code',
  'started_at',
  'ended_at',
  'duration_ms',
];

const placeholders = (rows: number, columns: number) =>
  Array.from(
    { length: rows },
    (_, row) => `(${Array.from({ length: columns }, (_, column) => `$${row * columns + column + 1}`).join(',')})`,
  ).join(',');

export const INSERT_RUN = `insert into runs (${RUN_COLUMNS.join(',')}) values ${placeholders(1, RUN_COLUMNS.length)} on conflict (run_id) do nothing`;

export async function migrate(pool: pg.Pool): Promise<void> {
  await pool.query(SCHEMA_SQL);
}

/** Tasks in chunks: Postgres allows 65535 bind parameters per statement. */
const TASK_CHUNK = 1000;

export function createPostgresStore(pool: pg.Pool): RunStore {
  return {
    async insert(records) {
      let inserted = 0;
      const client = await pool.connect();
      try {
        for (const record of records) {
          await client.query('begin');
          const result = await client.query(INSERT_RUN, runRow(record));
          if (result.rowCount === 1) {
            const rows = taskRows(record);
            for (let offset = 0; offset < rows.length; offset += TASK_CHUNK) {
              const chunk = rows.slice(offset, offset + TASK_CHUNK);
              await client.query(
                `insert into tasks (${TASK_COLUMNS.join(',')}) values ${placeholders(chunk.length, TASK_COLUMNS.length)} on conflict do nothing`,
                chunk.flat(),
              );
            }
            inserted++;
          }
          await client.query('commit');
        }
      } catch (error) {
        await client.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      return { inserted, duplicates: records.length - inserted };
    },
    close: () => pool.end(),
  };
}

/** For tests and `STORE=memory`: keeps records in memory, same idempotency. */
export function createMemoryStore(): RunStore & { records: RunRecord[] } {
  const records: RunRecord[] = [];
  return {
    records,
    async insert(batch) {
      let inserted = 0;
      for (const record of batch) {
        if (records.some((existing) => existing.runId === record.runId)) continue;
        records.push(record);
        inserted++;
      }
      return { inserted, duplicates: batch.length - inserted };
    },
    async close() {
      // nothing to release
    },
  };
}
