import { defineConfig } from 'vitest/config';

/** Node tests: routes against the in-memory backend; storage contract against MinIO/Azurite/Azure when configured. */
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
