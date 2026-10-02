# openapi-bench

Benchmark für OpenAPI → Angular/TypeScript-Client-Generatoren. Fokus: **Typsicherheit**, **Korrektheit am Wire**,
**Angular First-Class-Support**. Eine Spec, ein Case-Katalog, je Generator dieselben Tests — Ergebnis ist eine
Vergleichsmatrix.

- 📊 **Matrix**: [results/MATRIX.md](results/MATRIX.md) · interaktiv: [results/matrix.html](results/matrix.html)
- 🧾 **Fazit & Empfehlung**: [Abschnitt unten](#fazit)
- 🔎 **Recherche** (Versionen, Pflege, Issues): [research/generators-research.md](research/generators-research.md)

## Kandidaten

| ID | Generator | Laufzeit | Art |
|---|---|---|---|
| `openapi-generator` | OpenAPI Generator `typescript-angular` 7.25.0 | Java | Angular-Services |
| `ng-openapi-gen` | ng-openapi-gen 1.1.0 | Node | Angular (Funktionen + Api-Service) |
| `ng-openapi` | ng-openapi 0.4.1 | Node | Angular-Services + httpResource |
| `orval` | Orval 8.39.0 (`client: angular`) | Node | Angular-Services |
| `hey-api` | @hey-api/openapi-ts 0.99.0 (`client-angular`, `@angular/common`) | Node | SDK-Funktionen + Angular-Plugin |
| `nswag` | NSwag 14.7.1 (Template `Angular`) | .NET | Angular-Services |
| `openapi-fetch` | openapi-typescript 7.13.0 + openapi-fetch 0.17.0 | Node | **Referenz** für Typsicherheit, nicht Angular |

Nicht aufgenommen (siehe Recherche): kubb, swagger-typescript-api (kein Angular-Client), ng-swagger-gen (tot,
nur Swagger 2), openapi-typescript-codegen (unmaintained → hey-api).

## Methodik

1. **Spec** – [`spec/bench.openapi.yaml`](spec/bench.openapi.yaml) (OAS 3.0.3, ~40 Operationen, ~45 Schemas) und
   [`spec/bench.openapi-3.1.yaml`](spec/bench.openapi-3.1.yaml) (nur 3.1-Konstrukte). Jede Operation/jedes Schema
   nennt in `x-bench-cases` die Cases, die es abdeckt.
2. **Case-Katalog** – [`spec/cases.json`](spec/cases.json): 135 Cases in 4 Dimensionen mit präziser Erwartung
   (`expect`) und Gewicht 1–3:
   - `types` (T-*, T31-*): Compile-Zeit-Tests mit `expectTypeOf` + `@ts-expect-error` (vitest typecheck).
   - `runtime` (R-*): Wire-Format im Browser (Angular-Builder, Vitest-Browser-Mode, `HttpTestingController`):
     Pfad-Encoding, Query-Styles, Bodies, Content-Types, responseType, Auth, Fehler.
   - `angular` (A-*): HttpClient, Interceptors, `inject()`, `provide…()`, HttpContext, `observe`, Progress,
     httpResource, zoneless, Tree-Shaking.
   - `static` (S-*): JSDoc/`@deprecated`, `any`-Freiheit, Strict-Compile, Laufzeit-Deps.
3. **Je Generator** (`generators/<id>/`): beste dokumentierte Konfiguration für Typsicherheit + Angular,
   generierter Code committet (nie editiert), je Case genau ein Test `[CASE-ID] …`. Ehrlichkeitsregel:
   vorhanden-aber-falsch = ❌, nicht vorhanden = ➖. Details: [GENERATOR-GUIDE.md](GENERATOR-GUIDE.md).
4. **Gemessen vom Skript** (`scripts/run-bench.mjs`): Generierungszeit (Median aus 3), Dateien/LOC/KB,
   `any`-Zähler (TS-AST) und `@ts-nocheck`, Fehler unter Angular-CLI-strict und max-strict
   (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noUnused*`),
   Laufzeit-Imports, Bundle-Größe (esbuild, minified+gzip, Angular/RxJS extern) für „nur getPet“ vs. „alles“.
5. **Score** – je Dimension gewichtete Case-Punkte in %, Gesamt = 35 % types + 35 % runtime + 20 % angular +
   10 % static.

Grenzen: Bundle-Messung mit esbuild statt Angular-Compiler (Dekoratoren bleiben stehen → Klassen-Services
etwas schlechter als in echter `ng build`-Ausgabe). Cookie-Parameter sind im Browser nicht setzbar. Konfigurationen
sind „best effort“ — Begründung je Generator in `generators/<id>/NOTES.md`.

## Ausführen

```bash
pnpm install
cd packages/openapi-bench
node scripts/run-bench.mjs              # alles (generieren, messen, testen) → results/<id>.json
node scripts/run-bench.mjs --only orval --runs 1
node scripts/build-matrix.mjs           # → results/MATRIX.md + results/matrix.html
# einzelne Suites
npx vitest run --config vitest.types.config.mts  generators/orval/
npx vitest run --config vitest.static.config.mts generators/orval/
npx nx run openapi-bench-orval:test-runtime      # im Repo-Root
```

Voraussetzungen: Node 22, Java ≥ 11 (OpenAPI Generator), .NET 8 (NSwag), Playwright-Chromium.

## Fazit

Stand 2026-10-02, TypeScript 6.0, Angular 22. Zahlen: [results/MATRIX.md](results/MATRIX.md), Audit der Test-Verdicts:
[results/AUDIT.md](results/AUDIT.md).

| | Gesamt | Typen | Wire | Angular | K.O.-Kriterium |
|---|---|---|---|---|---|
| ng-openapi-gen 1.1.0 | 85.0 | 88.1 | 84.6 | 88 | – (aber keine Discriminated Unions) |
| OpenAPI Generator 7.25 | 84.5 | 80.0 | **97.4** | 92 | `oneOf`+`discriminator` → `export type Shape = ;` (ungültiges TS) |
| Orval 8.39 | 83.8 | **97.8** | 73.1 | **100** | generierter Code nicht strict-kompilierbar bei Integer-Header / httpResource + Content-Negotiation |
| Hey API 0.99 | 81.8 | 97.0 | 74.4 | 64 | Angular-Client: Auth kommt nie am Request an, Blob/Text als JSON |
| ng-openapi 0.4.1 | 69.2 | 74.8 | 62.8 | 100 | Absturz bei `enum` mit `null` (3.0), `@ts-nocheck` versteckt fehlende Imports |
| NSwag 14.7 | 64.0 | 70.4 | 62.8 | 72 | oneOf kaputt (fehlender Typ), `[key: string]: any` überall, 3.1 bricht ab |
| openapi-fetch 0.17 (Referenz) | 61.0 | 96.3 | 56.4 | 8 | kein Angular; Runtime kennt keine Content-Types |

**Die Gesamtscores liegen eng beieinander – entscheidend sind die Fehlerbilder:**

- **Typsicherheit**: Orval und Hey API sind auf Referenz-Niveau (openapi-typescript): Discriminated Unions mit
  Mapping-Literalen, `readOnly` aus Requests entfernt, `null`-Unions, 3.1-`const`/Tupel, kaum `any`.
  ng-openapi-gen, OpenAPI Generator, ng-openapi und NSwag ignorieren den Discriminator (`kind: string`) und
  `readOnly`/`writeOnly`; OpenAPI Generator merged `oneOf` ohne Discriminator zu einem Interface mit allen
  Pflichtfeldern und typisiert 204 als `Observable<any>`.
- **Korrektheit am Wire**: OpenAPI Generator ist klar vorn (alle Query-Styles, Multipart mit JSON-Part,
  form-urlencoded, **alle** Security-Schemes). ng-openapi-gen ist fast gleichauf, hat aber keine Auth-Konfiguration.
  Orval ignoriert `style`/`explode` bei Arrays und setzt Media-Types nicht (form-urlencoded geht mit
  `Content-Type: application/json` raus, merge-patch als JSON, octet-stream ohne Typ). Hey API setzt kein
  `responseType`/`Accept` (Download/Text kaputt) und verliert Auth.
- **Angular First-Class**: Orval und ng-openapi liefern alles (inject, provide…(), HttpContext, observe,
  Progress, httpResource). OpenAPI Generator: alles außer httpResource, aber Konstruktor-DI. ng-openapi-gen: kein
  httpResource, kein Progress. Hey API: Promise-basiert (eager), kein HttpContext/Progress im SDK.

**Empfehlung (Typsicherheit + Korrektheit + Angular):**

1. **Orval** (`client: angular`, `retrievalClient: both`) – beste Kombination aus Typen und Angular-Integration.
   Bedingung: die Wire-Lücken betreffen nur Nicht-Standard-Fälle (Array-`style` ≠ form/explode, form-urlencoded,
   merge-patch, octet-stream, Vendor-JSON). Bei reinen JSON-APIs irrelevant; sonst per Interceptor/Mutator schließen.
   Den generierten Code im CI strict typechecken (Integer-Header-Bug). Auth über eigenen Interceptor.
2. **ng-openapi-gen** – konservative Wahl, wenn die Spec keine Polymorphie nutzt: sehr korrektes Wire-Format,
   keine Workarounds, kompiliert strict, bestes Tree-Shaking (Funktionen). Typlücken: Discriminator, readOnly, Multi-2xx.
3. **OpenAPI Generator** nur ohne `oneOf`+`discriminator` – sonst kompiliert der Client nicht. Wire-Korrektheit und
   Auth sind top, Typen und `any`-Anteil schwach, Java nötig.

Nicht empfohlen: **Hey API** (Angular-Client noch beta; Modelltypen exzellent – als reiner Typ-Generator ok),
**ng-openapi** (zu jung: Crash, `@ts-nocheck`, verworfene Bodies/Header), **NSwag** (Typsicherheit ungenügend),
**openapi-fetch** (kein Angular, Runtime nicht spec-treu).

**Bezug zu diesem Repo**: `openapi-clients.json` nutzt als Default-Adapter `openapi-tools` (= OpenAPI Generator).
Sobald eine Spec `oneOf` mit Discriminator enthält, bricht der Client – ein Wechsel des Default-Adapters auf Orval
(oder ng-openapi-gen) wäre zu prüfen.

### Bekannte Grenzen

- Konfiguration „best effort“ je Generator; andere Optionen können einzelne Cases kippen (siehe NOTES.md).
- T31-WEBHOOKS und T31-BINARY-CONTENT-MEDIA-TYPE sind zu schwach formuliert (bestehen auch bei ignorierten
  Webhooks bzw. `unknown`-Body), Gewicht 1.
- NSwag-3.1: Generierung bricht ab → T31-Cases ➖ (3.1 offiziell nicht unterstützt), nicht ❌.
- Bundle-Größen mit esbuild statt Angular-Compiler.
