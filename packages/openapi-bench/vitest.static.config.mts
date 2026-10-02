import { defineConfig } from 'vitest/config';

/** Statische Tests (dimension: static): lesen generierten Code als Text, Node-Umgebung. */
export default defineConfig({
  test: {
    include: ['generators/*/tests/**/*.static.test.ts'],
    environment: 'node',
  },
});
