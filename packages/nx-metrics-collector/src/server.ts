/**
 * HTTP API:
 *   POST /v1/runs   one record (JSON), an array, or JSON lines → 200 { inserted, duplicates } | 400 | 401 | 413
 *   GET  /health    200 ok (no auth)
 * Auth: `Authorization: Bearer <token>` when tokens are configured (COLLECTOR_TOKENS), else open.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { parseBody, validateRecord, type RunRecord } from './run-record.ts';
import type { RunStore } from './store.ts';

export interface CollectorOptions {
  store: RunStore;
  tokens: readonly string[];
  maxBodyBytes: number;
  log?: (line: string) => void;
}

const digest = (value: string) => createHash('sha256').update(value).digest();

export function isAuthorized(header: string | undefined, tokens: readonly string[]): boolean {
  if (tokens.length === 0) return true;
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  if (!match) return false;
  const candidate = digest(match[1].trim());
  return tokens.reduce((found, token) => timingSafeEqual(candidate, digest(token)) || found, false);
}

class BodyTooLarge extends Error {}

function readBody(request: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        // stop buffering, drain the rest so the client still receives the 413
        request.removeAllListeners('data');
        request.resume();
        reject(new BodyTooLarge());
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    request.on('error', reject);
  });
}

const send = (response: ServerResponse, status: number, body: unknown) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

async function handleRuns(
  request: IncomingMessage,
  response: ServerResponse,
  options: CollectorOptions,
): Promise<void> {
  if (!isAuthorized(request.headers.authorization, options.tokens))
    return send(response, 401, { error: 'unauthorized' });
  let raw: unknown[];
  try {
    raw = parseBody(await readBody(request, options.maxBodyBytes));
  } catch (error) {
    if (error instanceof BodyTooLarge) return send(response, 413, { error: 'body too large' });
    return send(response, 400, { error: 'invalid JSON' });
  }
  const records: RunRecord[] = [];
  for (const [index, entry] of raw.entries()) {
    const result = validateRecord(entry);
    if (typeof result === 'string') return send(response, 400, { error: `record ${index}: ${result}` });
    records.push(result);
  }
  const result = await options.store.insert(records);
  options.log?.(`runs: +${result.inserted}${result.duplicates ? ` (${result.duplicates} duplicates)` : ''}`);
  send(response, 200, result);
}

export function createCollector(options: CollectorOptions): Server {
  return createServer((request, response) => {
    const path = (request.url ?? '/').split('?')[0];
    if (request.method === 'GET' && path === '/health') return send(response, 200, { status: 'ok' });
    if (request.method === 'POST' && path === '/v1/runs') {
      handleRuns(request, response, options).catch((error: unknown) => {
        options.log?.(`store failed: ${error instanceof Error ? error.message : String(error)}`);
        if (!response.headersSent) send(response, 500, { error: 'store failed' });
      });
      return;
    }
    send(response, 404, { error: 'not found' });
  });
}
