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
