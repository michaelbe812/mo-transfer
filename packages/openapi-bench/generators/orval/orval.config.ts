import { defineConfig } from 'orval';

/**
 * Orval 8.39 — Angular-Client, Konfiguration für max. Typsicherheit + modernes Angular.
 * Begründung siehe NOTES.md / meta.json.config.
 */
const output = (target: string, schemas: string) => ({
  target,
  schemas,
  client: 'angular' as const,
  mode: 'tags-split' as const,
  namingConvention: 'kebab-case' as const,
  indexFiles: true,
  clean: true,
  headers: true,
  urlEncodeParameters: true,
  override: {
    enumGenerationType: 'const' as const,
    preserveReadonlyRequestBodies: 'strip' as const,
    useDeprecatedOperations: true,
    angular: {
      provideIn: 'root' as const,
      retrievalClient: 'both' as const,
      baseUrl: { apiId: 'bench' },
    },
  },
});

export default defineConfig({
  bench: {
    input: { target: '../../spec/bench.openapi.yaml', unsafeDisableValidation: true },
    output: output('./client/api.ts', './client/model'),
  },
  bench31: {
    input: { target: '../../spec/bench.openapi-3.1.yaml' },
    output: output('./client-31/api.ts', './client-31/model'),
  },
});
