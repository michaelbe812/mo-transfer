/**
 * Wire contract: `RunRecord` schema 1 of @berger-engineering/nx-metrics (plugin, `nx-metrics push`).
 * Duplicated on purpose — the collector has no dependency on the plugin and must accept records from older/newer
 * plugin versions; `validateRecord` checks what the database needs, unknown fields are ignored.
 */

export interface TaskRecord {
  id: string;
  project: string;
  target: string;
  configuration?: string;
  hash?: string;
  status: string;
  cache: string;
  exitCode: number;
  startTime?: number;
  endTime?: number;
  durationMs?: number;
}

export interface RunRecord {
  schema: number;
  runId: string;
  command: string;
  startTime: number;
  endTime: number;
  durationMs: number;
  label?: string;
  tags?: Record<string, string>;
  ci?: { isCi: boolean; provider?: string; pipelineId?: string; job?: string };
  git?: { sha?: string; branch?: string };
  machine?: {
    os?: string;
    arch?: string;
    cpus?: number;
    cpuModel?: string;
    memoryGb?: number;
    node?: string;
    nx?: string;
  };
  remoteCache?: string;
  envReliable?: boolean;
  summary?: {
    total: number;
    localHit: number;
    remoteHit: number;
    miss: number;
    notCacheable: number;
    notRun: number;
    failed: number;
    hitRate?: number;
  };
  tasks: TaskRecord[];
}

export const SUPPORTED_SCHEMA = 1;

const isString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** Returns the record or a reason why it is rejected (400). */
export function validateRecord(raw: unknown): RunRecord | string {
  if (typeof raw !== 'object' || raw === null) return 'record must be an object';
  const record = raw as Partial<RunRecord>;
  if (record.schema !== SUPPORTED_SCHEMA)
    return `unsupported schema ${String(record.schema)} (expected ${SUPPORTED_SCHEMA})`;
  if (!isString(record.runId)) return 'runId missing';
  if (!isNumber(record.startTime) || !isNumber(record.endTime)) return 'startTime/endTime missing';
  if (!Array.isArray(record.tasks)) return 'tasks missing';
  for (const task of record.tasks) {
    if (!isString(task?.id) || !isString(task.project) || !isString(task.target) || !isString(task.cache)) {
      return `task ${String(task?.id)} incomplete`;
    }
  }
  return {
    ...record,
    command: record.command ?? '',
    durationMs: isNumber(record.durationMs) ? record.durationMs : record.endTime - record.startTime,
  } as RunRecord;
}

/** Body → records: a JSON object, a JSON array, or JSON lines (`application/x-ndjson`, `nx-metrics push`). */
export function parseBody(body: string): unknown[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) return JSON.parse(trimmed) as unknown[];
  if (!trimmed.includes('\n')) return [JSON.parse(trimmed)];
  return trimmed
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as unknown);
}
