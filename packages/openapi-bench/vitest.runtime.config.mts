import { defineConfig } from 'vitest/config';

/**
 * runnerConfig für @nx/angular:unit-test der Generator-Projekte (Runtime-/Angular-Tests, Browser-Mode Chromium).
 * Ohne die MSW-Plugins der Root-vitest-base (Bench nutzt nur HttpTestingController).
 */
export default defineConfig({});
