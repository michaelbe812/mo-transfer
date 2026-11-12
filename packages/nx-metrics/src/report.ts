/**
 * Report over collected run records (CI artifacts, dev machines): durations p50/p90, cache hit rates local/remote
 * and an estimate of the time the cache saved, grouped by week, branch, CI vs. local, label or remote cache mode.
 *
 * Saved time per hit = median duration of the same task when it missed (any record in the input), minus the
 * time the hit itself took. Without a miss of that task, the target's median miss is used, else nothing is counted.
 */
import { summarizeTasks, type RunRecord, type RunSummary, type TaskRecord } from './record.ts';
import { formatMs, formatPercent, median, summarize, type Summary } from './stats.ts';

export const GROUP_BY = ['week', 'branch', 'ci', 'label', 'remote-cache', 'none'] as const;
export type GroupBy = (typeof GROUP_BY)[number];

export interface ReportOptions {
  groupBy: GroupBy;
  since?: number;
  until?: number;
  ciOnly?: boolean;
  /** Only records whose command matches (e.g. `affected`). */
  command?: RegExp;
  /** ROI: € per developer hour (applied to time saved in local runs). */
  ratePerHour?: number;
  /** ROI: € per CI minute (applied to time saved in CI runs). */
  ciPricePerMinute?: number;
}

export interface TargetStats {
  target: string;
  tasks: number;
  misses: number;
  localHits: number;
  remoteHits: number;
  hitRate?: number;
  missDuration?: Summary;
  savedMs: number;
}

export interface GroupStats {
  key: string;
  runs: number;
  failedRuns: number;
  runDuration?: Summary;
  tasks: RunSummary;
  savedMs: number;
  savedCiMs: number;
  savedLocalMs: number;
  targets: TargetStats[];
}

/**
 * Money value of the saved time. Local: saved hours × rate — an upper bound (not every saved minute was a minute a
 * developer waited). CI: saved minutes × price per minute (machine time; parallel agents all count).
 */
export interface Roi {
  ratePerHour?: number;
  ciPricePerMinute?: number;
  savedLocalHours: number;
  savedCiMinutes: number;
  localEur?: number;
  ciEur?: number;
  totalEur?: number;
}

export interface UsageReport {
  records: number;
  from?: string;
  to?: string;
  groupBy: GroupBy;
  groups: GroupStats[];
  roi: Roi;
}

/** ISO 8601 week, e.g. `2026-W46`. */
export function isoWeek(timestamp: number): string {
  const date = new Date(timestamp);
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7)); // Thursday decides the year
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${day.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function groupKey(record: RunRecord, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'week':
      return isoWeek(record.startTime);
    case 'branch':
      return record.git?.branch ?? '(unknown)';
    case 'ci':
      return record.ci?.isCi ? `ci:${record.ci.provider ?? 'generic'}` : 'local';
    case 'label':
      return record.label ?? '(none)';
    case 'remote-cache':
      return record.remoteCache ?? '(unknown)';
    case 'none':
      return 'all';
  }
}

export function filterRecords(records: readonly RunRecord[], options: ReportOptions): RunRecord[] {
  return records.filter(
    (record) =>
      (options.since === undefined || record.startTime >= options.since) &&
      (options.until === undefined || record.startTime < options.until) &&
      (!options.ciOnly || record.ci?.isCi) &&
      (!options.command || options.command.test(record.command)),
  );
}

/** Median miss duration per task id and per target name, the baseline for "time saved". */
export function missBaselines(records: readonly RunRecord[]): {
  byTask: Map<string, number>;
  byTarget: Map<string, number>;
} {
  const byTask = new Map<string, number[]>();
  const byTarget = new Map<string, number[]>();
  for (const task of records.flatMap((record) => record.tasks)) {
    if (task.cache !== 'miss' || task.status !== 'success' || task.durationMs === undefined) continue;
    byTask.set(task.id, [...(byTask.get(task.id) ?? []), task.durationMs]);
    byTarget.set(task.target, [...(byTarget.get(task.target) ?? []), task.durationMs]);
  }
  const medians = (source: Map<string, number[]>) =>
    new Map([...source].map(([key, values]) => [key, median(values) ?? 0]));
  return { byTask: medians(byTask), byTarget: medians(byTarget) };
}

export function savedByHit(task: TaskRecord, baselines: ReturnType<typeof missBaselines>): number {
  if (task.cache !== 'local-hit' && task.cache !== 'remote-hit') return 0;
  const estimate = baselines.byTask.get(task.id) ?? baselines.byTarget.get(task.target) ?? 0;
  return Math.max(0, estimate - (task.durationMs ?? 0));
}

function targetStats(tasks: readonly TaskRecord[], baselines: ReturnType<typeof missBaselines>): TargetStats[] {
  const byTarget = new Map<string, TaskRecord[]>();
  for (const task of tasks) byTarget.set(task.target, [...(byTarget.get(task.target) ?? []), task]);
  return [...byTarget]
    .map(([target, entries]) => {
      const summary = summarizeTasks(entries);
      return {
        target,
        tasks: entries.length,
        misses: summary.miss,
        localHits: summary.localHit,
        remoteHits: summary.remoteHit,
        hitRate: summary.hitRate,
        missDuration: summarize(
          entries
            .filter((task) => task.cache === 'miss' && task.durationMs !== undefined)
            .map((task) => task.durationMs as number),
        ),
        savedMs: entries.reduce((sum, task) => sum + savedByHit(task, baselines), 0),
      };
    })
    .sort((a, b) => (b.missDuration?.median ?? 0) - (a.missDuration?.median ?? 0));
}

export function computeRoi(groups: readonly GroupStats[], options: ReportOptions): Roi {
  const savedLocalHours = groups.reduce((sum, group) => sum + group.savedLocalMs, 0) / 3_600_000;
  const savedCiMinutes = groups.reduce((sum, group) => sum + group.savedCiMs, 0) / 60_000;
  const localEur = options.ratePerHour === undefined ? undefined : savedLocalHours * options.ratePerHour;
  const ciEur = options.ciPricePerMinute === undefined ? undefined : savedCiMinutes * options.ciPricePerMinute;
  return {
    ratePerHour: options.ratePerHour,
    ciPricePerMinute: options.ciPricePerMinute,
    savedLocalHours,
    savedCiMinutes,
    localEur,
    ciEur,
    totalEur: localEur === undefined && ciEur === undefined ? undefined : (localEur ?? 0) + (ciEur ?? 0),
  };
}

const savedIn = (records: readonly RunRecord[], baselines: ReturnType<typeof missBaselines>) =>
  records.flatMap((record) => record.tasks).reduce((sum, task) => sum + savedByHit(task, baselines), 0);

export function buildReport(allRecords: readonly RunRecord[], options: ReportOptions): UsageReport {
  const records = filterRecords(allRecords, options);
  const baselines = missBaselines(records);
  const groups = new Map<string, RunRecord[]>();
  for (const record of records) {
    const key = groupKey(record, options.groupBy);
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const starts = records.map((record) => record.startTime);
  const groupStats = [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entries]) => {
      const tasks = entries.flatMap((record) => record.tasks);
      return {
        key,
        runs: entries.length,
        failedRuns: entries.filter((record) => record.summary.failed > 0).length,
        runDuration: summarize(entries.map((record) => record.durationMs)),
        tasks: summarizeTasks(tasks),
        savedMs: tasks.reduce((sum, task) => sum + savedByHit(task, baselines), 0),
        savedCiMs: savedIn(
          entries.filter((record) => record.ci?.isCi),
          baselines,
        ),
        savedLocalMs: savedIn(
          entries.filter((record) => !record.ci?.isCi),
          baselines,
        ),
        targets: targetStats(tasks, baselines),
      };
    });
  return {
    records: records.length,
    from: starts.length ? new Date(Math.min(...starts)).toISOString() : undefined,
    to: starts.length ? new Date(Math.max(...starts)).toISOString() : undefined,
    groupBy: options.groupBy,
    groups: groupStats,
    roi: computeRoi(groupStats, options),
  };
}

const ratio = (part: number, whole: number) => (whole ? part / whole : undefined);
const euro = (value: number | undefined) =>
  value === undefined
    ? '–'
    : `${value.toLocaleString('de-DE', { maximumFractionDigits: 2, minimumFractionDigits: 2 })} €`;

export function roiToMarkdown(roi: Roi): string[] {
  const lines = [
    '## ROI (Schätzung)',
    '',
    '| | gespart | Satz | Wert |',
    '|---|---:|---:|---:|',
    `| lokal | ${roi.savedLocalHours.toFixed(2)} h | ${roi.ratePerHour === undefined ? '`--rate`' : `${roi.ratePerHour} €/h`} | ${euro(roi.localEur)} |`,
    `| CI | ${roi.savedCiMinutes.toFixed(1)} min | ${roi.ciPricePerMinute === undefined ? '`--ci-price`' : `${roi.ciPricePerMinute} €/min`} | ${euro(roi.ciEur)} |`,
    `| **gesamt** | | | **${euro(roi.totalEur)}** |`,
    '',
    'Lokal = Obergrenze (nicht jede gesparte Minute war Wartezeit). CI = Maschinenzeit, parallele Agents zählen einzeln.',
  ];
  return lines;
}

export function reportToMarkdown(report: UsageReport): string {
  const lines = [
    '# Nx runs',
    '',
    `${report.records} runs${report.from ? `, ${report.from.slice(0, 10)} – ${report.to?.slice(0, 10)}` : ''}, grouped by ${report.groupBy}.`,
    '',
    '| group | runs | failed | run p50 | run p90 | tasks | miss | local hit | remote hit | hit rate | saved (est.) |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const group of report.groups) {
    const cacheable = group.tasks.localHit + group.tasks.remoteHit + group.tasks.miss;
    lines.push(
      `| ${group.key} | ${group.runs} | ${group.failedRuns} | ${formatMs(group.runDuration?.median)} | ${formatMs(group.runDuration?.p90)} | ${group.tasks.total} | ${group.tasks.miss} | ${formatPercent(ratio(group.tasks.localHit, cacheable))} | ${formatPercent(ratio(group.tasks.remoteHit, cacheable))} | ${formatPercent(group.tasks.hitRate)} | ${formatMs(group.savedMs)} |`,
    );
  }
  lines.push('', ...roiToMarkdown(report.roi));
  for (const group of report.groups) {
    lines.push(
      '',
      `## ${group.key}: targets`,
      '',
      '| target | tasks | miss p50 | miss p90 | hit rate | remote hits | saved (est.) |',
      '|---|---:|---:|---:|---:|---:|---:|',
    );
    for (const target of group.targets) {
      lines.push(
        `| ${target.target} | ${target.tasks} | ${formatMs(target.missDuration?.median)} | ${formatMs(target.missDuration?.p90)} | ${formatPercent(target.hitRate)} | ${target.remoteHits} | ${formatMs(target.savedMs)} |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}
