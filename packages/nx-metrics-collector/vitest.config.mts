import { defineConfig } from 'vitest/config';

/** Node tests of the nx-metrics collector (record mapping, HTTP API with an in-memory store; Postgres when NX_METRICS_IT_DATABASE_URL is set). */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
