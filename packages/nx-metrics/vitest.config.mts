import { defineConfig } from 'vitest/config';

/** Node tests of nx-metrics (pure record/stats/graph logic + bench runner against a temp dir). */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 30_000,
  },
});
