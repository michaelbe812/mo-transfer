#!/usr/bin/env node
/**
 * Env: DATABASE_URL (postgres://…, required unless STORE=memory), PORT (4000), HOST (0.0.0.0),
 *      COLLECTOR_TOKENS (comma-separated, empty → no auth), COLLECTOR_MAX_BODY_BYTES (10 MiB), STORE (postgres|memory),
 *      COLLECTOR_READONLY_ROLE + COLLECTOR_READONLY_PASSWORD (optional: login role with SELECT only, for Grafana)
 */
import pg from 'pg';
import { createCollector } from './server.ts';
import { createMemoryStore, createPostgresStore, ensureReadOnlyRole, migrate, type RunStore } from './store.ts';

const env = process.env;
const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);

async function createStore(): Promise<RunStore> {
  if (env.STORE === 'memory') return createMemoryStore();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL missing (or STORE=memory)');
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });
  // Postgres may still be starting in a compose stack
  for (let attempt = 1; ; attempt++) {
    try {
      await migrate(pool);
      break;
    } catch (error) {
      if (attempt >= 30) throw error;
      log(`waiting for postgres (${error instanceof Error ? error.message : String(error)})`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  if (env.COLLECTOR_READONLY_ROLE && env.COLLECTOR_READONLY_PASSWORD) {
    await ensureReadOnlyRole(pool, env.COLLECTOR_READONLY_ROLE, env.COLLECTOR_READONLY_PASSWORD);
    log(`read-only role ${env.COLLECTOR_READONLY_ROLE} ready`);
  }
  return createPostgresStore(pool);
}

const store = await createStore();
const server = createCollector({
  store,
  tokens: (env.COLLECTOR_TOKENS ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean),
  maxBodyBytes: Number(env.COLLECTOR_MAX_BODY_BYTES ?? 10 * 1024 ** 2),
  log,
});
const port = Number(env.PORT ?? 4000);
server.listen(port, env.HOST ?? '0.0.0.0', () =>
  log(`nx-metrics collector on :${port} (store ${env.STORE ?? 'postgres'})`),
);

const shutdown = () => server.close(() => void store.close().then(() => process.exit(0)));
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
