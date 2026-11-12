import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  cacheSizeToMarkdown,
  findWorkspaceDb,
  readCacheEntries,
  summarizeCacheSize,
  type CacheEntry,
} from './cache-size.ts';
import { formatBytes } from './stats.ts';

const entry = (project: string, target: string, bytes: number, createdAt: string): CacheEntry => ({
  hash: `${project}-${target}-${createdAt}`,
  project,
  target,
  bytes,
  createdAt,
});

describe('summarizeCacheSize', () => {
  const report = summarizeCacheSize('db', [
    entry('client', 'build', 3000, '2026-11-12 09:00:00'),
    entry('client', 'build', 5000, '2026-11-12 08:00:00'),
    entry('ui', 'build', 4000, '2026-11-12 08:00:00'),
  ]);

  it('groups per project/target, latest = newest entry', () => {
    expect(report.groups).toEqual([
      { project: 'ui', target: 'build', entries: 1, totalBytes: 4000, latestBytes: 4000, maxBytes: 4000 },
      { project: 'client', target: 'build', entries: 2, totalBytes: 8000, latestBytes: 3000, maxBytes: 5000 },
    ]);
    expect(report.totalBytes).toBe(12000);
  });

  it('renders markdown table', () => {
    expect(cacheSizeToMarkdown(report)).toContain('| client | build | 2 | 2.9 KiB | 4.9 KiB | 7.8 KiB |');
  });
});

describe('formatBytes', () => {
  it.each([
    [512, '512 B'],
    [1536, '1.5 KiB'],
    [5 * 1024 ** 3, '5.0 GiB'],
  ])('%d → %s', (bytes, expected) => expect(formatBytes(bytes)).toBe(expected));
});

describe('workspace db', () => {
  let repo: string;
  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it('reads entries joined with task details, unknown hashes kept', async () => {
    repo = mkdtempSync(join(tmpdir(), 'nx-metrics-cache-'));
    const dataDir = join(repo, '.nx', 'workspace-data');
    mkdirSync(dataDir, { recursive: true });
    const db = new DatabaseSync(join(dataDir, 'abc-v3.db'));
    db.exec(`
      create table cache_outputs (hash text, code integer, size integer, created_at timestamp, accessed_at timestamp);
      create table task_details (hash text, project text, target text, configuration text);
      insert into cache_outputs values ('h1', 0, 100, '2026-11-12 08:00:00', null), ('h2', 0, 7, '2026-11-12 08:00:00', null);
      insert into task_details values ('h1', 'client', 'build', 'production');
    `);
    db.close();

    const dbFile = findWorkspaceDb(repo, {});
    const entries = await readCacheEntries(dbFile);

    expect(entries).toEqual([
      {
        hash: 'h1',
        project: 'client',
        target: 'build',
        configuration: 'production',
        bytes: 100,
        createdAt: '2026-11-12 08:00:00',
      },
      {
        hash: 'h2',
        project: '(unknown)',
        target: '(unknown)',
        configuration: undefined,
        bytes: 7,
        createdAt: '2026-11-12 08:00:00',
      },
    ]);
  });

  it('fails clearly without db', () => {
    repo = mkdtempSync(join(tmpdir(), 'nx-metrics-cache-'));
    expect(() => findWorkspaceDb(repo, {})).toThrow(/no Nx workspace db/);
  });
});
