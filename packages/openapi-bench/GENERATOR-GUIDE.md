# Generator hinzufügen / bewerten

Regeln für jeden Generator unter `generators/<id>/`. Ziel: faire, reproduzierbare, ehrliche Messung von
**Typsicherheit**, **Korrektheit (Wire-Format)** und **Angular-First-Class-Support**.

## Layout

```
generators/<id>/
  project.json          Nx-Projekt "openapi-bench-<id>": generate, build (nur für unit-test), test-runtime
  ng-package.json       nur für @nx/angular:unit-test nötig (entryFile bundle/all-ops.ts)
  tsconfig.json         include client/** + client-31/** (extends ../../tsconfig.base.json = Angular-CLI-strict)
  tsconfig.spec.json    Runtime-Tests (Angular-Builder)
  generate.mjs          erzeugt client/ (spec/bench.openapi.yaml) und client-31/ (spec/bench.openapi-3.1.yaml)
  <generator-config>    z. B. orval.config.ts, openapi-ts.config.ts, nswag.json, ng-openapi-gen.json
  client/  client-31/   generierter Code (committet, NIE von Hand editiert)
  tests/types.test-d.ts         dimension types (T-*)  – vitest typecheck
  tests/types-31.test-d.ts      dimension types (T31-*)
  tests/runtime.spec.ts         dimension runtime + angular (R-*, A-*) – Angular unit-test, Browser
  tests/generated.static.test.ts dimension static (S-*) – Node, liest generierten Code als Text
  bundle/one-op.ts      minimaler App-Code, der NUR getPet aufruft (export einer Funktion/Klasse)
  bundle/all-ops.ts     re-exportiert die gesamte öffentliche API des Clients
  meta.json             Metadaten (Schema unten)
  NOTES.md              qualitative Befunde (deutsch, knapp)
```

## Regeln

1. **Konfiguration**: die vom Generator dokumentierte/empfohlene Einstellung, die Typsicherheit und
   Angular-Integration maximiert (z. B. Union-Enums, Date-Transformer nur wenn konsistent, Angular-HttpClient,
   httpResource falls angeboten). In `meta.json.config` + `NOTES.md` begründen. Kein Patchen des Outputs,
   keine Post-Processing-Skripte (Formatter ok).
2. **Ein Test pro Case**: Für jede Case-ID aus `spec/cases.json` (außer `measured: true`) genau ein Test,
   dessen Titel mit `[CASE-ID]` beginnt. Erwartung = Feld `expect`, wörtlich und streng.
3. **Ehrlichkeit vor Grün**: Ist ein Feature vorhanden, aber falsch → Test mit korrekter Erwartung schreiben,
   er schlägt fehl (das ist das Ergebnis!). Gibt es gar keine API dafür → `test.skip('[ID] … — unsupported: <Grund>')`.
   Erwartungen nie aufweichen, um grün zu werden. Keine `as any`/Casts, um Typfehler zu umgehen
   (Ausnahme: Test-Fixtures für Response-Bodies).
4. **Negative Typ-Tests präzise**: `@ts-expect-error` nur auf der Zeile mit genau EINEM Fehlergrund; daneben eine
   positive Kontrolle mit sonst identischer Form (sonst passt der Test aus falschem Grund).
5. **Runtime**: `setupHttp()` aus `testing/http-harness.ts`, Base-URL `TEST_BASE_URL`, Requests mit
   `HttpTestingController` prüfen (URL, Query, Header, `serializeBody()`, `responseType`), Response flushen,
   Ergebnis prüfen. Idiomatische Angular-API des Generators verwenden (Service-Methode / Funktion / Resource).
   Nicht-Angular-Clients: `fetch` stubben; Angular-Cases (A-*) dann ehrlich `fail`/`skip`.
6. **Keine Abhängigkeiten installieren** (kein `pnpm add`) – fehlende Pakete im Abschlussbericht melden.
7. Nur Dateien in `generators/<id>/` ändern. Keine git-Befehle.

## Befehle

```bash
# in packages/openapi-bench
(cd generators/<id> && node generate.mjs)
npx vitest run --config vitest.types.config.mts  generators/<id>
npx vitest run --config vitest.static.config.mts generators/<id>
npx tsc -p generators/<id>/tsconfig.json          # Strict-Compile des generierten Codes (Info)
# im Repo-Root
npx nx run openapi-bench-<id>:test-runtime --skip-nx-cache
```

## meta.json

```json
{
  "id": "orval",
  "name": "Orval",
  "package": "orval",
  "version": "8.39.0",
  "runtime": "node | java | dotnet",
  "license": "MIT",
  "repo": "https://github.com/…",
  "docs": "https://…",
  "outputStyle": "class-services | functions | functions+services | resources",
  "config": { "kurz": "wichtigste Optionen und warum" },
  "angular": {
    "httpClient": true,
    "injectFn": true,
    "provideFn": "provideApi(...) | null",
    "httpResource": true,
    "httpContext": true,
    "observeResponse": true,
    "minAngular": "≥ 17 | unbekannt"
  },
  "validation": "none | zod | valibot | …",
  "generation31": "ok | partial: … | failed: …",
  "runtimeDeps": ["…"],
  "highlights": ["…"],
  "issues": ["…"]
}
```
