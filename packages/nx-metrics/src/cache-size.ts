/**
 * Size of the local Nx cache per project/target, read from Nx's workspace database
 * (`<workspace-data>/*.db`: `cache_outputs` = hash + bytes, `task_details` = hash → project/target).
 * A remote cache entry is the archive of the same files, so the sizes are a good estimate for the remote cache too.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { formatBytes } from './stats.ts';

export interface CacheEntry {
  hash: string;
  project: string;
  target: string;
  configuration?: string;
  /** Outputs + terminal output, as recorded by Nx. */
  bytes: number;
  createdAt: string;
}

export interface CacheSizeGroup {
  project: string;
  target: string;
  entries: number;
  totalBytes: number;
  /** Size of the most recent entry = current state of the code. */
  latestBytes: number;
  maxBytes: number;
}

export interface CacheSizeReport {
  dbFile: string;
  entries: number;
  totalBytes: number;
  groups: CacheSizeGroup[];
}

const UNKNOWN_PROJECT = '(unknown)';

/** Honors NX_WORKSPACE_DATA_DIRECTORY like Nx does; picks the most recently written db if there are several. */
export function findWorkspaceDb(repo: string, env: NodeJS.ProcessEnv = process.env): string {
  const dataDir = resolve(repo, env.NX_WORKSPACE_DATA_DIRECTORY ?? join('.nx', 'workspace-data'));
  const dbFiles = existsSync(dataDir) ? readdirSync(dataDir).filter((file) => file.endsWith('.db')) : [];
  if (!dbFiles.length) throw new Error(`no Nx workspace db in ${dataDir} — run an nx task first`);
  return dbFiles.map((file) => join(dataDir, file)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

export async function readCacheEntries(dbFile: string): Promise<CacheEntry[]> {
  const { DatabaseSync } = await import('node:sqlite').catch(() => {
    throw new Error(`cache-size needs node:sqlite (Node ≥ 22.5), running ${process.version}`);
  });
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const rows = db
      .prepare(
        `select c.hash, d.project, d.target, d.configuration, c.size, c.created_at
         from cache_outputs c left join task_details d on d.hash = c.hash`,
      )
      .all() as Array<Record<string, string | number | null>>;
    return rows.map((row) => ({
      hash: String(row.hash),
      project: row.project ? String(row.project) : UNKNOWN_PROJECT,
      target: row.target ? String(row.target) : UNKNOWN_PROJECT,
      configuration: row.configuration ? String(row.configuration) : undefined,
      bytes: Number(row.size ?? 0),
      createdAt: String(row.created_at ?? ''),
    }));
  } finally {
    db.close();
  }
}

export function summarizeCacheSize(dbFile: string, entries: readonly CacheEntry[]): CacheSizeReport {
  const byTask = new Map<string, CacheEntry[]>();
  for (const entry of entries) {
    const key = `${entry.project}:${entry.target}`;
    byTask.set(key, [...(byTask.get(key) ?? []), entry]);
  }
  const groups = [...byTask.values()].map((group): CacheSizeGroup => {
    const newestFirst = [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      project: group[0].project,
      target: group[0].target,
      entries: group.length,
      totalBytes: sum(group.map((entry) => entry.bytes)),
      latestBytes: newestFirst[0].bytes,
      maxBytes: Math.max(...group.map((entry) => entry.bytes)),
    };
  });
  groups.sort((a, b) => b.latestBytes - a.latestBytes || a.project.localeCompare(b.project));
  return { dbFile, entries: entries.length, totalBytes: sum(entries.map((entry) => entry.bytes)), groups };
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function cacheSizeToMarkdown(report: CacheSizeReport): string {
  return [
    '# Nx cache size (local)',
    '',
    `- entries: **${report.entries}**, total: **${formatBytes(report.totalBytes)}**`,
    `- source: \`${report.dbFile}\``,
    '',
    '| project | target | entries | latest | max | total |',
    '|---|---|---:|---:|---:|---:|',
    ...report.groups.map(
      (group) =>
        `| ${group.project} | ${group.target} | ${group.entries} | ${formatBytes(group.latestBytes)} | ${formatBytes(group.maxBytes)} | ${formatBytes(group.totalBytes)} |`,
    ),
    '',
  ].join('\n');
}
