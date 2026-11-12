import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { displayPath, resolveConsoleMode, summaryLine } from './plugin.ts';
import type { RunRecord } from './record.ts';
import { pushRecords } from './sinks.ts';

const record = (runId: string): RunRecord =>
  ({
    schema: 1,
    runId,
    command: 'affected -t test',
    startTime: 0,
    endTime: 4210,
    durationMs: 4210,
    summary: { total: 12, localHit: 8, remoteHit: 1, miss: 3, notCacheable: 0, notRun: 0, failed: 1, hitRate: 0.75 },
    tasks: [],
  }) as unknown as RunRecord;

describe('console output', () => {
  it('env beats option; true/1 mean summary', () => {
    expect(resolveConsoleMode({}, {})).toBe('off');
    expect(resolveConsoleMode({ console: 'json' }, {})).toBe('json');
    expect(resolveConsoleMode({ console: 'json' }, { NX_METRICS_CONSOLE: 'summary' })).toBe('summary');
    expect(resolveConsoleMode({}, { NX_METRICS_CONSOLE: '1' })).toBe('summary');
    expect(resolveConsoleMode({ console: 'summary' }, { NX_METRICS_CONSOLE: 'off' })).toBe('off');
  });

  it('shows paths relative inside, absolute outside the workspace', () => {
    expect(displayPath('/ws', '/ws/.nx/metrics/runs.jsonl')).toBe('.nx/metrics/runs.jsonl');
    expect(displayPath('/ws', '/tmp/runs.jsonl')).toBe('/tmp/runs.jsonl');
  });

  it('prints one line with cache outcome and destination', () => {
    expect(summaryLine(record('r'), '.nx/metrics/runs.jsonl')).toBe(
      '[nx-metrics] affected -t test · 12 tasks: 3 miss, 8 local, 1 remote (75.0 % hit), 1 failed · 4.21 s → .nx/metrics/runs.jsonl',
    );
  });
});

describe('pushRecords', () => {
  const received: string[][] = [];
  let auth: string | undefined;
  const server = createServer((request, response) => {
    let body = '';
    auth = request.headers.authorization;
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      const lines = body.split('\n');
      received.push(lines);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ inserted: lines.length - 1, duplicates: 1 }));
    });
  });
  let url = '';
  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/runs`;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('sends JSON lines in batches with the token and sums the results', async () => {
    const records = ['a', 'b', 'c', 'd', 'e'].map(record);
    const result = await pushRecords(url, records, { token: 't0k', batchSize: 2 });
    expect(received.map((batch) => batch.length)).toEqual([2, 2, 1]);
    expect(JSON.parse(received[0][0]).runId).toBe('a');
    expect(auth).toBe('Bearer t0k');
    expect(result).toEqual({ inserted: 2, duplicates: 3 });
  });
});
