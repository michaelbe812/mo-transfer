import type { AddressInfo } from 'node:net';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseBody, validateRecord, type RunRecord } from './run-record.ts';
import { createCollector } from './server.ts';
import { createMemoryStore, createPostgresStore, migrate, runRow, taskRows } from './store.ts';

const record = (runId: string, overrides: Partial<RunRecord> = {}): RunRecord => ({
  schema: 1,
  runId,
  command: 'affected -t test',
  startTime: Date.UTC(2026, 10, 12, 8),
  endTime: Date.UTC(2026, 10, 12, 8, 1),
  durationMs: 60_000,
  label: 'ci:pr',
  tags: { team: 'checkout' },
  ci: { isCi: true, provider: 'github', pipelineId: '42', job: 'ci' },
  git: { sha: 'abc', branch: 'main' },
  machine: { os: 'linux', arch: 'x64', cpus: 4, memoryGb: 16, node: 'v22', nx: '23.1.0' },
  remoteCache: 'enabled',
  envReliable: true,
  summary: { total: 2, localHit: 0, remoteHit: 1, miss: 1, notCacheable: 0, notRun: 0, failed: 0, hitRate: 0.5 },
  tasks: [
    {
      id: 'a:test',
      project: 'a',
      target: 'test',
      status: 'success',
      cache: 'miss',
      exitCode: 0,
      startTime: 1,
      endTime: 5001,
      durationMs: 5000,
    },
    {
      id: 'b:test',
      project: 'b',
      target: 'test',
      status: 'remote-cache',
      cache: 'remote-hit',
      exitCode: 0,
      durationMs: 100,
    },
  ],
  ...overrides,
});

describe('record contract', () => {
  it('accepts schema 1 and rejects incomplete records', () => {
    expect(validateRecord(record('r1'))).toMatchObject({ runId: 'r1' });
    expect(validateRecord({ ...record('r1'), schema: 2 })).toMatch(/unsupported schema/);
    expect(validateRecord({ ...record('r1'), runId: '' })).toMatch(/runId/);
    expect(validateRecord({ ...record('r1'), tasks: [{ id: 'x' }] })).toMatch(/task x incomplete/);
    expect(validateRecord('nope')).toMatch(/object/);
  });

  it('parses object, array and JSON lines', () => {
    expect(parseBody(JSON.stringify(record('a')))).toHaveLength(1);
    expect(parseBody(JSON.stringify([record('a'), record('b')]))).toHaveLength(2);
    expect(parseBody(`${JSON.stringify(record('a'))}\n\n${JSON.stringify(record('b'))}\n`)).toHaveLength(2);
    expect(parseBody('  ')).toEqual([]);
  });

  it('maps rows; hit rate recomputed over cacheable tasks', () => {
    const row = runRow(record('r1'));
    expect(row[0]).toBe('r1');
    expect(row.at(-1)).toBe(0.5);
    expect(taskRows(record('r1'))[1]).toEqual([
      'r1',
      'b:test',
      'b',
      'test',
      null,
      null,
      'remote-cache',
      'remote-hit',
      0,
      null,
      null,
      100,
    ]);
    const withoutSummary = runRow({ ...record('r2'), summary: undefined });
    expect(withoutSummary.slice(22)).toEqual([2, 0, 1, 1, 0, 0, 0, 0.5]);
  });
});

describe('HTTP API', () => {
  const store = createMemoryStore();
  const server = createCollector({ store, tokens: ['secret'], maxBodyBytes: 64 * 1024 });
  let base = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const post = (body: string, token = 'secret') =>
    fetch(`${base}/v1/runs`, { method: 'POST', body, headers: { authorization: `Bearer ${token}` } });

  it('serves /health without auth and 404 elsewhere', async () => {
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });

  it('requires the token', async () => {
    expect((await post(JSON.stringify(record('x')), 'wrong')).status).toBe(401);
  });

  it('stores records idempotently', async () => {
    const first = await post(`${JSON.stringify(record('h1'))}\n${JSON.stringify(record('h2'))}`);
    expect(await first.json()).toEqual({ inserted: 2, duplicates: 0 });
    const again = await post(JSON.stringify(record('h1')));
    expect(await again.json()).toEqual({ inserted: 0, duplicates: 1 });
    expect(store.records.map((entry) => entry.runId)).toEqual(['h1', 'h2']);
  });

  it('rejects invalid JSON, invalid records and too large bodies', async () => {
    expect((await post('{nope')).status).toBe(400);
    const invalid = await post(JSON.stringify({ ...record('i'), schema: 9 }));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: 'record 0: unsupported schema 9 (expected 1)' });
    expect((await post('x'.repeat(70 * 1024))).status).toBe(413);
  });
});

// against a real Postgres, e.g. the compose stack: NX_METRICS_IT_DATABASE_URL=postgres://nxmetrics:nxmetrics@localhost:5433/nxmetrics
const databaseUrl = process.env.NX_METRICS_IT_DATABASE_URL;

describe.skipIf(!databaseUrl)('Postgres store', () => {
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const store = createPostgresStore(pool);
  const runId = `it-${Date.now()}`;
  afterAll(async () => {
    await pool.query('delete from runs where run_id like $1', [`${runId}%`]);
    await store.close();
  });

  it('migrates idempotently, inserts runs + tasks once, computes saved time in task_facts', async () => {
    await migrate(pool);
    await migrate(pool);
    expect(await store.insert([record(runId), record(`${runId}-b`)])).toEqual({ inserted: 2, duplicates: 0 });
    expect(await store.insert([record(runId)])).toEqual({ inserted: 0, duplicates: 1 });
    const tasks = await pool.query('select count(*)::int as n from tasks where run_id = $1', [runId]);
    expect(tasks.rows[0].n).toBe(2);
    const facts = await pool.query("select saved_ms from task_facts where run_id = $1 and task_id = 'b:test'", [runId]);
    // b:test never missed → fallback to the median miss of target "test" (≥ 5000 from a:test) minus 100
    expect(Number(facts.rows[0].saved_ms)).toBeGreaterThan(0);
  });
});
