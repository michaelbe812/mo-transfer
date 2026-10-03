import { defineConfig } from 'vitest/config';

/**
 * Node tests of @mo-transfer/tooling-openapi, two projects:
 *   unit         src/**\/*.spec.ts — Tree/fixture based, fast
 *   integration  test/integration/**\/*.spec.ts — real adapters (openapi-generator jar + Java, hey-api,
 *                nx-plugin-openapi), orval/openapi-typescript/openapi-msw, tsc, local HTTP server, executors
 * Target `test` runs BOTH with coverage: the thresholds apply to their sum
 * (fast unit-only run without Nx: `pnpm exec vitest run --config packages/tooling/openapi/vitest.config.mts --project unit`).
 */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    environment: 'node',
    projects: [
      { extends: true, test: { name: 'unit', include: ['src/**/*.spec.ts'] } },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['test/integration/**/*.spec.ts'],
          // the jar (openapi-tools) takes 2–5 s per run
          testTimeout: 120_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        // types only (the adapter contract): no runtime code to cover
        'src/facade/contract.ts',
      ],
      reportsDirectory: 'coverage',
      reporter: ['text', 'html', 'json-summary', 'lcov'],
      // fails the run below 95 % (goal: as close to 100 % as sensible, see README)
      thresholds: { lines: 95, branches: 95, functions: 95, statements: 95 },
    },
  },
});
