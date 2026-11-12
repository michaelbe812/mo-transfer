/** Where run records go: a local JSON-lines file (CI artifact, bench) and/or an HTTP collector. */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RunRecord } from './record.ts';

export function appendJsonl(file: string, record: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify(record)}\n`);
}

/** Reads records, skipping blank and broken lines (a run killed mid-write must not break the report). */
export function readJsonl<T = RunRecord>(file: string): T[] {
  if (!existsSync(file)) return [];
  const records: T[] = [];
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as T);
    } catch {
      // ignore partial line
    }
  }
  return records;
}

export interface PostOptions {
  token?: string;
  timeoutMs: number;
}

export async function postJson(url: string, body: unknown, options: PostOptions): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) throw new Error(`collector answered ${response.status} ${response.statusText}`);
}

export interface PushResult {
  inserted: number;
  duplicates: number;
}

/** Sends records as JSON lines in batches (collector: POST /v1/runs, idempotent per runId). */
export async function pushRecords(
  url: string,
  records: readonly unknown[],
  options: { token?: string; batchSize?: number; timeoutMs?: number },
): Promise<PushResult> {
  const total: PushResult = { inserted: 0, duplicates: 0 };
  const batchSize = options.batchSize ?? 200;
  for (let offset = 0; offset < records.length; offset += batchSize) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-ndjson',
        ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      },
      body: records
        .slice(offset, offset + batchSize)
        .map((record) => JSON.stringify(record))
        .join('\n'),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    if (!response.ok) throw new Error(`collector answered ${response.status}: ${await response.text()}`);
    const result = (await response.json()) as PushResult;
    total.inserted += result.inserted;
    total.duplicates += result.duplicates;
  }
  return total;
}
