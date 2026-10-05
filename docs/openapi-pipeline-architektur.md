# OpenAPI-Tooling: Pipeline-Architektur

Architektur von `@mo-transfer/tooling-openapi`: Owner-Entscheidungen 1–8 + Feature-Flag für Overlays. Bedienung und Consumer-Guide: [`packages/tooling/openapi/README.md`](../packages/tooling/openapi/README.md), Einbettung in den Blueprint: [`docs/nx-umsetzung.md` → OpenAPI-Clients](nx-umsetzung.md#openapi-clients).

## Architektur

```mermaid
flowchart LR
  CFG[("openapi-clients.json<br/>settings · adapters · clients")]
  subgraph GRAPH["Graph (jede Berechnung)"]
    PLUGIN["Plugin createNodes<br/>+ createDependencies"]
    REG["Registry (eine)<br/>built-ins + adapters-Map<br/>deklarativ, lädt keinen Code"]
  end
  subgraph RUN["Executor generate / generate-testing"]
    direction LR
    S1["spec<br/>Overlays*"] --> S2["generate<br/>Adapter / msw-Preset"] --> S3["classify"] --> S4["transform[]<br/>Code-Hooks"] --> S5["split<br/>Imports → Aliase"] --> S6["barrel<br/>in-memory"] --> S7["finalize[]<br/>prettier · Header"] --> S8["write"]
  end
  LOAD["Loader (einer)<br/>.ts-Hook · ESM-import · CJS · npm-exports"]
  CFG --> PLUGIN --> REG
  CFG --> RUN
  REG --> RUN
  LOAD -. Adapter, Transforms, Scaffold .-> S2 & S4
  VERIFY["verify<br/>liest metadata.openapi"] --> PLUGIN
```

`*` Overlays nur mit `settings.features.overlays: true` (experimentell, Default aus).

| Baustein | Datei | Aufgabe |
|---|---|---|
| Settings | `src/settings.ts`, `openapi-clients.json → settings` | Workspace-Annahmen mit Defaults: `libsDir`, `clientFolder`, `outputDir`, `aliasPrefix`, `sharedScope`, `specFiles`, `scaffold`, `features`, `testing`. Header, Tags und Tooling-Inputs sind fest (YAGNI; eigene Tags über den Scaffold) |
| Config | `src/config.ts` | Typen + Lesen von `openapi-clients.json` (frisch pro Aufruf), Layout, Parts, Overlay-/Feature-Helfer |
| Registry | `src/registry/registry.ts` | **ein** Resolver: Built-ins (`openapi-tools`, `hey-api`, `nx-plugin-openapi`, `command`) + `adapters`-Map; liefert Modul-Referenz, Pakete, Inputs, Runtime, Optionen, Probleme. Kein Memo |
| Modul-Referenz / Loader | `src/registry/module-ref.ts`, `loader.ts`, `load.ts` | wohin ein Specifier zeigt + Cache-Inputs (leicht, im Plugin); Laden für Adapter, Transforms, Scaffold (`.ts` via eigenem Require-Hook, `.mjs`/ESM via echtem `import()`, CJS via `require`, npm-`exports` von Hand) + SPI-Prüfung |
| SPI v1 | `src/adapter.ts` (Export `./adapter`) | `defineAdapter`, `defineTransform`, `defineScaffold`, Kontext-Typen, `listTsFiles` |
| Contract-Test | `src/adapter-testing.ts` (Export `./adapter-testing`) | `runAdapterContract(adapter, { specFile })` über die echten Stages |
| Pipeline | `src/pipeline/runner.ts` + Stages | feste Reihenfolge, typisierter Kontext, Fehler mit Phase |
| Presets | `pipeline/client-preset.ts`, `testing-preset.ts` | `generate-api-client` (Adapter → types/api/core) und `generate-api-testing` (openapi-typescript + orval-msw + openapi-msw) auf demselben Runner |
| Plugin | `src/plugin/openapi-clients.ts` | `createNodes` (Nx 23): `generate-api-client` + `update-spec` am Client, `generate-api-testing` an der Testing-Lib, `metadata.openapi`; `createDependencies`: Client → `npm:<pkg>` |
| Generator | `src/generators/client` | Spec, `index.ts`, Client-`project.json`, Eintrag; Lib-Config über Scaffold (Default eingebaut, hier `@mo-transfer/tooling-conventions/openapi-scaffold`) |

## Entscheidungen + Begründung

| # | Entscheidung | Umsetzung | Begründung |
|---|---|---|---|
| 1 | Publishable Library | `build`-Target (tsc → `dist/packages/tooling/openapi`, CJS + `.d.ts`), `scripts/prepare-dist.mts` schreibt `package.json` (Exports `.js` + `types`, ohne `private`/devDependencies), `peerDependencies` nx/@nx/devkit/typescript, `dependencies` yaml. `npm pack --dry-run` grün | Quellen bleiben im Workspace ohne Build ladbar (Nx/swc), dist für npm |
| 1 | Settings-Ort: `openapi-clients.json → settings` | Defaults = heutige Werte, `json`-Feld `settings` ist Input jedes Generate-Targets | Executoren, Generator, verify lesen sie zur Laufzeit (Plugin-Optionen sehen sie nicht); jede `nx.json`-Änderung invalidiert den ganzen Cache. In `nx.json` (Plugin-Optionen) nur Graph-Form: Target-Namen |
| 1 | Keine Abhängigkeit auf tooling-conventions | eigene Pfad-/Tree-Helfer parametrisiert über Settings; Lib-Config per **Scaffold-SPI** (`settings.scaffold`), hier `@mo-transfer/tooling-conventions/openapi-scaffold` (strukturell, ohne Import des openapi-Pakets) | Lib-Konventionen (ng-packagr, tsconfig*, Tags) sind Workspace-Sache. ESLint erzwingt es: tooling-openapi ist buildable, Import nicht-buildable Libs blockiert |
| 1 | Tooling als Cache-Input | nach Ort: im Workspace Globs der Quellen (je Target eng), unter `node_modules` `externalDependencies: [<paket>]`, verlinkt außerhalb keine | Kein hartcodierter `packages/tooling/openapi`-Pfad mehr |
| 2 | Alles TypeScript strict | Spike übernommen; Build-Skript `.mts` per Node-Type-Stripping | — |
| 3 | Consumer-Adapter | `adapters`-Map (Workspace-Pfad, npm-Paket inkl. ESM-only, `builtin:<id>`-Alias mit eigenen Defaults), deklarativ `packages`/`inputs`/`runtime`/`options`; Cache-Inputs: Modul-Ordner bzw. Paket + Kante → `npm:<pkg>`; `apiVersion`/`id` geprüft, Optionen gegen `optionsSchema` vor `generate`, `requires` (Pakete, Node) | Plugin importiert nie Adapter-Code (Graph schnell + robust); eine Registry statt zwei Kopien (Spike-Problem) |
| 3 | `.ts`-Adapter laden | eigener Require-Hook (TypeScript `transpileModule` → CJS) nur für den Modulordner und nur während des Ladens (M2); ESM per Function-erzeugtem `import()` (in Vitest: eigenes `import()` als Fallback) | Nx entfernt seinen swc-Hook nach dem Laden des Executors und macht aus `import()` ein `require()` (Spike-Befund). Getestet: `.ts`-Workspace-Adapter mit Helfer + SPI-Import, ESM-only Fake-npm-Paket, `.mjs`, CJS, TLA |
| 3 | Schema | `adapter`: `anyOf` (Built-in-`enum` ∪ Pattern) → Autocomplete + eigene IDs | — |
| 4 | Pipeline | `spec[] → generate → classify → transform[] → split → barrel → finalize[] → write`, Datei-Liste sortiert, Barrel aus In-Memory-Dateien (Compiler-Host), nur generate/write auf Platte | Determinismus, testbare Stages, ein Ort für Fehler |
| 4 | Overlays | OpenAPI Overlay 1.0, JSONPath-Teilmenge ohne Dependency, **hinter Feature-Flag** `settings.features.overlays` (Default aus). Aus + `pipeline.overlays` → Generate scheitert mit Hinweis, Plugin warnt, verify meldet (`metadata.openapi.disabledFeatures`); Overlay-Dateien nur mit Flag Cache-Input | Owner-Vorgabe: experimentell, nie stilles Ignorieren |
| 4 | Code-Hooks (`pipeline.transforms`) | Workspace-Modul/Paket via Loader, Modul-Ordner bzw. Paket = Cache-Input, `defineTransform`, Optionen per Schema | siehe Trade-off unten (Owner: bleibt aktiv) |
| 4 | `command`-Adapter | `command`/`args`/`env` mit Platzhaltern, Glob-Klassifizierung, `runtime` als Versions-Input | NSwag, Skripte, Docker ohne JS |
| 4 | Fehler | `OpenApiError` mit `phase`, `client`, `adapter`, `hint`, `cause`; Executor druckt Ursachen-Kette, `--verbose` (Option oder `NX_VERBOSE_LOGGING`) streamt Generator-Output + Stages + Stack | — |
| 5 | Testing als zweites Preset | gleicher Runner (Overlays, Transforms, Format, Header gelten auch); `pipeline.testing: false` → Generator ohne Testing-Lib, kein Target; `generate-api-testing` inferiert, Teil-Libs + Kanten + `lint`/`typecheck`-`dependsOn` bleiben explizit | — |
| 5 | Mocks-Engine `schema-faker` (Default) | Port des Spikes `spike/testing-without-orval` als Engine des Testing-Presets: Spec-Walk → `get<Op>ResponseMock`/`get<Op>MockHandler` (gleiche Namen wie orval), Schemas als Daten, `mock-runtime.ts` (faker + msw). Auswahl `settings.testing.mocks` (Default `schema-faker`) bzw. `pipeline.testing: { mocks }`; `orval` deprecated, eine Iteration wählbar, nur dann Cache-Input. Alle 3 Clients umgestellt | 0 neue Deps, schneller (pet: 722 vs. 992 ms Nx-Task), kleinerer generierter Code; orval entfernbar |
| 5 | Runtime kopieren statt importieren | `mock-runtime.ts` pro Testing-Lib (gitignored), Quelle als Asset im Paket (nicht kompiliert, in dist kopiert) | Import aus dem Tooling-Paket: Boundary-Verstoß (Libs → Tooling verboten) + Paket-Einstieg im Browser-Bundle; gemeinsame Lib: workspace-spezifischer Ort, eigenes Projekt/Kanten. Kopie importiert nur msw + faker |
| 5 | Stabile Fake-Daten | jede Zufallsentscheidung der Runtime mit eigenem Seed: Hash(Operation + Instanzpfad + Zweck + Fingerprint der eigenen Keywords), private Faker-Instanz (`en`, Mersenne 53), feste `MOCK_REF_DATE` (UTC). Details/Tabelle: packages/tooling/openapi/README.md → Stabile Fake-Daten | globaler Seed pro Test: Werte hängen von Aufruf-/Testreihenfolge, neuen Feldern/Operationen und dem Datum ab; Key = `$ref`-Name: alle `Pet`s gleich; eigener PRNG (sfc32, ~150× schnellerer Seed) statt Mersenne 53: nicht nötig (~35 µs/Seed, +~11 ms in `shared-data-access:test`), Mersenne bleibt Faker-Standard |
| 6 | Layout `merged-core` | `layout: 'merged-core'` → core-Dateien + -Entries in die api-Lib (relative Imports bleiben), Generator ohne core-Lib, Outputs/Inputs/Kanten ohne core, verify kennt es, move/rename/remove tragen den Eintrag mit | einzige Variante neben types/api/core |
| 7 | `createNodes` (Nx 23) | `createNodesV2` entfernt; Optionen `clientTargetName`, `testingTargetName`, `updateSpecTargetName` (Generator liest sie aus `nx.json` für `dependsOn`) | — |
| 8 | Target-Namen | `generate-api-client`, `generate-api-testing`, `update-spec` unverändert (Defaults) | — |

### Trade-off Code-Hooks (Veto möglich)

| | |
|---|---|
| Gewinn | Nachbearbeitung ohne eigenen Adapter (Header-Kommentare, Umbenennungen, Patches für Generator-Bugs), für beide Presets |
| Risiko Determinismus | ein Hook kann Uhrzeit, Env, Netz, Dateien außerhalb seines Ordners lesen — das sieht der Cache nicht: gleicher Hash, anderer Output (**Cache-Poisoning**), auch über Remote-Cache |
| Risiko Wartung | Hooks hängen am Roh-Output eines Generators; ein Generator-Update kann sie still brechen |
| Absicherung | Modul-Ordner/Paket ist Cache-Input, Optionen schema-geprüft, Kopien der Dateien (kein halber Zustand), Duplikate/ungültige Parts → Fehler, Doku „muss deterministisch sein“ |
| Alternative | nur deklarative Transforms (Regex-Replace aus JSON) oder eigener Adapter, der den Built-in wrappt |

## orval vs. schema-faker (Spike-Messung, pet-client)

| | orval | schema-faker |
|---|---|---|
| Generierung kalt / warm | ~690 ms / 45 ms | **~425 ms / 14 ms** |
| Nx-Task `generate-api-testing` | 992 ms | **722 ms** |
| Output pet / notification / booking | 23 Dateien 80,6 KiB / 10 · 9,8 KiB / 9 · 6,9 KiB | **7 · 60,9 KiB** / 7 · 18,1 KiB / 7 · 15,8 KiB (inkl. 9,7 KiB Runtime-Kopie) |
| Browser-Bundle generierter Code (min) | 11,2 KiB | **6,9 KiB** |
| Testlaufzeit `shared-data-access:test` | ~1,27 s | ~1,2–1,3 s (Rauschen) |
| Abhängigkeiten | orval + 15 `@orval/*` | **0 neue** |
| Grenzen | – | nur lokale `$ref`s, nie `null`, `default`/`not`/`if`/`patternProperties`/`prefixItems` ignoriert, keine orval-Inline-Typen, andere Werte als orval (pro Wert geseedet, kein globaler Seed) |

Verworfene Alternativen (Spike): hey-api-Faker/msw-Plugins (ignoriert `example`, 501-Defaults), kubb/`@mswjs/source` (msw 3 nicht im Peer-Range), `msw-auto-mock` (AI-SDK-Deps), `openapi-backend`/Prism/Scalar (kein faker bzw. kein msw). Testing-Output ändert sich gegenüber main bewusst (andere Dateien/Werte), generierter Client-Code bleibt byte-identisch.

## Review-Fixes (TDD, `test/integration/robustness.spec.ts` u. a.)

| Befund | Umsetzung |
|---|---|
| H1 kaputte `openapi-clients.json` | Abschnitte formgeprüft (falsche → leer), Registrierung ohne String-`module` → Problem, `transformsOf` validiert, Plugin: try/catch um Kontext + pro Client, `createDependencies` → `[]`. Der Graph überlebt jede getestete Form |
| H2 Pfadsicherheit | `settingsProblems`: `libsDir` relativ ohne `..`, `clientFolder`/`outputDir`/`sharedScope` ein kebab-Ordner, `specFiles` nur Dateinamen; Client-Pfade nur kebab-Segmente; Overlay- und Transform-Pfade relativ ohne `..`; write-Stage schreibt/löscht nur unter `<part>/src/<outputDir>` |
| M1 fehlende Pakete | `externalDependencies` nur, wenn in der Root-`package.json` deklariert (→ Lockfile → `npm:`-Knoten) **und** installiert; sonst `metadata.openapi.missingPackages`, Warnung, verify-Problem — statt Hasher-Abbruch |
| M2 `.ts`-Hook | Hook nur während des Ladens und nur für den Modulordner (bei npm-Paketen: Paketordner, auch unter `node_modules` — nie an Nodes Type Stripping), danach vorheriger Handler zurück. Folge: `.ts`-Helfer müssen statisch (Top-Level) importiert werden. Getestet unter Node 22.16 und 24.18 |
| M3 Cache-Lücken | Module außerhalb des Workspace → Problem (Scaffold ausgenommen); `generate-api-testing` mit `adapters/files.ts`; Package-Modus mit `yaml`; Require-Cache des ganzen Modulordners geleert |
| M4 Parallel-Race | effektive Spec je Preset (`tmp/openapi/<client>/<preset>/spec`) |
| Low | optionale Peers für alle Generator-Tools, `engines.node >=22.12`, dist ohne Source Maps, automatischer dist-Smoke-Test (Build → Exporte → Fixture mit installiertem dist), Target-Namen: Generator schreibt sie in `targetDefaults.dependsOn`, verify liest die Plugin-Optionen; Tooling-Inputs je Target eng (schema-faker/Testing-Preset nicht im Client-Hash, Adapter nicht im Testing-Hash) |

## Limitierungen

| Limitierung | Umgang |
|---|---|
| Adapter müssen **getrennte `.ts`-Dateien** liefern; eine Single-File-Ausgabe wird nicht aufgeteilt | alles in eine Kategorie (z. B. `apis`) oder Generator auf Split-Modus stellen |
| JSONPath nur Teilmenge (Namen, `*`, Index, `..`, Filter `==`/`!=`/Existenz) | unbekannte Syntax → Fehler, nie stiller Mismatch |
| `.ts`-Module: kein Typcheck beim Laden, keine tsconfig-`paths`, `.mts` nicht unterstützt, `.ts`-Helfer nur statisch importiert (der Hook ist nach dem Laden wieder weg) | `.ts`/`.mjs`/`.js` nutzen; SPI per Paketname importieren |
| `externalDependencies` nur für deklarierte + installierte Pakete | fehlende stehen in `metadata.openapi.missingPackages` (verify) |
| Target-Umbenennung: der Generator `client` passt `targetDefaults` an; bei manueller Umbenennung ohne Generator-Lauf meldet verify | — |
| Workspace-Adapter: der ganze Ordner ist Input | ein Ordner pro Adapter |
| `node_modules`-Auflösung von npm-Adaptern ab Workspace-Root, Conditions `node`/`require`/`import`/`default` | — |
| Projektnamen-Regel `/` → `-` und Part-Ordner `types`/`api`/`core`/`testing` sind fest | dokumentiert |
| Datei-Name `openapi-clients.json` fest (Plugin-Glob ist statisch) | — |
| schema-faker: nur lokale `$ref`s (externe Refs → Fehler beim Generieren) | Spec vorher bündeln (z. B. `@redocly/cli bundle`); Bündeln im spec-Stage ist eine mögliche Erweiterung |

## Vereinfachung (Branch `refactor/openapi-simplify`)

| Kandidat | Entscheidung |
|---|---|
| toter Code (`PIPELINE_STAGES`, `GENERATED_DEPENDS_ON`, `CLIENT/TESTING_GENERATE_TARGET`, `resolveClientAdapter`, `clientExportPrefix`, …) | entfernt |
| `settings.toolingInputs` (4 Modi) | entfernt, nur Erkennung nach Ort |
| `settings.header`, `clientTags`, `partTags` | entfernt (feste Werte; eigene Tags über `settings.scaffold`), Output byte-identisch |
| `vm`-Fallback des Loaders (nur Vitest) | ersetzt durch eigenes `import()` als Fallback |
| Duplikate Facade/Generator/Plugin/Contract-Helper | zusammengelegt: `stringifySpec`, `prettierFormatter`, `clientLocationOf`, `isRecord`, ein Root-Manifest-Leser, `buildBarrels`, `safeInfer` in `inferClientTargets` |
| JSONPath → Bibliothek | verworfen: `json-p3` ≥ 3 nur ESM (Plugin/Executor laden CJS), `jsonpath-plus` nicht RFC 9535, 3 Deps, stille Fehltreffer; Teilmenge bleibt (Overlays experimentell) |
| Options-Validator → ajv | verworfen: ~45 Zeilen gegen eine Runtime-Dependency (+4 transitive) im publizierten Paket, schlechtere Meldungen |
| eigener npm-`exports`-Resolver | bleibt: Node hat aus CJS keine API für `import`-only-Pakete eines fremden Roots |

`src/` 4 404 → 4 316 Zeilen, Specs 4 644 → 4 639, Coverage 99,08/96,68/99,75/99,57 → 99,35/97,07/100/99,78 (234 Tests). Generierter Code aller Clients (71 Dateien) byte-identisch.


## Offene Punkte für den Owner

1. Code-Hooks behalten (aktuell aktiv) oder auf deklarative Transforms beschränken?
2. Overlays aus dem Experimentalstatus holen, wann?
3. Paketname/Scope für npm (`@mo-transfer/tooling-openapi` vs. neutral), Registry, Lizenz, `nx release`-Konfiguration (Version, Changelog) — Build + `npm pack` sind bereit, `publishConfig`/Registry fehlen bewusst.
