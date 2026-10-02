// Hey API (@hey-api/openapi-ts 0.99.0) – Bench-Konfiguration.
// Ein Job je Spec (3.0 → client/, 3.1 → client-31/). Begründung: siehe NOTES.md / meta.json.
import { defineConfig, type UserConfig } from '@hey-api/openapi-ts';

const plugins: UserConfig['plugins'] = [
  // Angular-HttpClient-basierter Client (gebündelt in client/client/, keine npm-Runtime-Dep).
  // throwOnError: false (Default) → Ergebnis ist typisierte Union { data } | { error }.
  { name: '@hey-api/client-angular' },
  // Typen: Enums zusätzlich als JS-Konstanten-Objekte (x-enum-varnames → Priority.LOW), Typ bleibt Literal-Union.
  { name: '@hey-api/typescript', enums: 'javascript' },
  // KEIN @hey-api/transformers (dates): Schema `Date` der Spec überschattet das globale Date in types.gen.ts →
  // Typ würde lügen (siehe NOTES.md). Ohne Transformer: date/date-time = string, konsistent zur Laufzeit.
  // SDK: flache, tree-shakeable Funktionen (kein asClass → tree-shaking), Auth-Wiring aus securitySchemes.
  { name: '@hey-api/sdk', operations: 'flat', auth: true },
  // Angular-spezifisch: HttpRequest-Factories + httpResource-Funktionen je Operation.
  { name: '@angular/common', httpRequests: true, httpResources: true },
];

export default defineConfig([
  { input: '../../spec/bench.openapi.yaml', output: { path: 'client', clean: true }, plugins },
  { input: '../../spec/bench.openapi-3.1.yaml', output: { path: 'client-31', clean: true }, plugins },
]);
