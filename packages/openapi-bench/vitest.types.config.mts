import { defineConfig } from 'vitest/config';

/**
 * Typ-Tests (dimension: types): `generators/<gen>/tests/*.test-d.ts`, nur `tsc` (vitest typecheck), kein Runtime.
 * Fehler im generierten Code selbst ignorieren (ignoreSourceErrors) — die misst S-STRICT-COMPILE separat.
 */
export default defineConfig({
  test: {
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: ['generators/*/tests/**/*.test-d.ts'],
      tsconfig: './tsconfig.types.json',
      ignoreSourceErrors: true,
    },
  },
});
