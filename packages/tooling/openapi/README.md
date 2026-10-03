# @mo-transfer/tooling-openapi

Generierte OpenAPI-Clients: `project.json`-Vorlagen, Facade, Executoren, Generator `client`. Projekt `tooling-openapi` (`type:tooling`, `tooling:openapi`), importiert nur `@mo-transfer/tooling-conventions`. Übersicht: [`packages/tooling`](../README.md), Konzept: [`docs/nx-umsetzung.md` → OpenAPI-Clients](../../../docs/nx-umsetzung.md#openapi-clients).

| Teil | Datei(en) | Aufgabe |
|---|---|---|
| Projekt-Config | `src/project-config.ts` (Export `@mo-transfer/tooling-openapi`) | was der Generator in die `project.json` schreibt: Client-Projekt (nur Name + Tags), Teil-Libs (`implicitDependencies` Teil → Client → Teile darunter), Testing-Lib (`generate-api-testing`, `lint`/`typecheck` mit `dependsOn: ['generate-api-testing', '^generate-api-client', '^generate-api-testing']`); dazu `clientTargets` für das Plugin; Target-Namen als Konstanten `CLIENT_GENERATE_TARGET`/`TESTING_GENERATE_TARGET` |
| Plugin | `src/plugin/openapi-clients.ts` (Export `@mo-transfer/tooling-openapi/plugin`, `nx.json` → `plugins`) | `createNodesV2` auf `openapi-clients.json`: pro Eintrag `generate-api-client` (Spec-, `json`-Feld- und Adapter-Inputs aus `registry.json`) + `update-spec` am Client-Projekt. Nur Targets, keine Projekte; ein kaputter Eintrag bricht den Graphen nicht (Warnung, kein `generate-api-client`, `verify` meldet). Bewertung: [Inferierte Client-Targets](../../../docs/nx-umsetzung.md#inferierte-client-targets-plugin) |
| Facade | `src/facade/*` | Vertrag (`contract.d.ts`), Registry (`adapters/registry.json`), 3 Adapter, Split in types/api/core, Barrel, Header |
| Testing-Pipeline | `src/testing/testing.mjs` | openapi-typescript, orval (msw + Faker), openapi-msw, `<client>Http`, `<client>Handlers` |
| Executoren | `src/executors/*`, `executors.json` | `@mo-transfer/tooling-openapi:generate` (Target `generate-api-client`), `:update-spec`, `:generate-testing` (Target `generate-api-testing`). Option nur `client` (Pfad), der Rest kommt zur Laufzeit aus `openapi-clients.json` |
| Generator | `src/generators/client` | `nx g @mo-transfer/tooling-openapi:client <name> [--domain] --spec=<datei\|url> [--url] [--adapter]`: Spec, vier Libs mit `index.ts` + Config-Dateien, Client-`project.json` (Name + Tags), `paths`, Eintrag. Unbekannte Optionen → Fehler (`additionalProperties: false`) |
| Tree-Helfer | `src/clients.ts` (Export `@mo-transfer/tooling-openapi/clients`) | `openapi-clients.json` im Tree lesen/schreiben, Einträge bei move/remove nachziehen, Client-`project.json` umziehen (`relocateClientProject`), `<client>Http`/`Handlers` umbenennen — genutzt von `client` und von `move`/`rename`/`remove` (workspace) |
| Schema | `openapi-clients.schema.json` | `$schema` von `openapi-clients.json` |

Kurzfassung:

- `openapi-clients.json` (Root): ein Eintrag pro Client (`url`, `adapter`, `options`), Key = Pfad unter `libs/`. Default-Adapter `openapi-tools` (typescript-angular 7.25.0, Java), weitere: `hey-api` (0.83.x gepinnt), `nx-plugin-openapi`.
- Der Eintrag bleibt in `openapi-clients.json` und ist ein `json`-Input von `generate-api-client`, keine Target-Option: eine Änderung invalidiert nur diesen Client (Target-Optionen gingen über die `ProjectConfiguration` in den Hash aller Abhängigen). `update-spec` (nicht gecacht) hat die ganze Datei als Input, damit `nx affected` Änderungen sieht.
- Adapterwechsel: nur der Eintrag in `openapi-clients.json`, das Plugin leitet die Adapter-Inputs daraus ab (keine zweite Stelle, kein Drift).
- `generate-api-client`/`update-spec` stehen nicht in der Client-`project.json` (`verify` meldet sie dort); sichtbar per `nx show project generated-pet-client`.
- Zwei Target-Namen: `generate-api-client` (Client-Projekt, Adapter-Code types/api/core) und `generate-api-testing` (Testing-Lib, openapi-typescript/msw) — eindeutig in `dependsOn`, `nx run-many -t generate-api-client` erzeugt nur die Clients.
- Jede Lib wartet per `^generate-api-client` + `^generate-api-testing` auf den generierten Code ihrer Abhängigkeiten und hasht ihn (`dependentTasksOutputFiles`, beides in `nx.json` → `targetDefaults`), weil Nx gitignored Dateien nicht sieht.
- Der Header im generierten Code nennt weiter `@mo-transfer/tooling (openapi, <adapter>)`: er landet im dist, eine Änderung würde den dist-Snapshot brechen.
- Neuer Adapter: Modul in `src/facade/adapters/` (`generate`, `classify`, siehe `contract.d.ts`) + Eintrag in `registry.json` (Pakete, Inputs, Runtime) + `enum` in `openapi-clients.schema.json` und im `client`-Schema.

## Tests

| Target | Projekt (Vitest) | Inhalt | Dauer |
|---|---|---|---|
| `nx test tooling-openapi` (einziges Test-Target) | `unit`: `src/**/*.spec.{ts,mts}` | Projekt-Config (Client-`project.json`: Name/Tags; Client-Targets: `json`-Inputs, Adapter-Inputs; Plugin: Targets pro Eintrag, ohne `project.json` kein Knoten, kaputter Eintrag/Datei nur Warnung; Teil-Kanten, `generate-api-testing`; Fehler: unbekannter Adapter, fehlende/doppelte Spec, falscher Pfad), Tree-Helfer (`openapi-clients.json`, move/remove, Client-`project.json` umziehen, Umbenennen der Testing-Exporte), Generator `client` (shared/Domain, Datei/URL, alle Adapter, geschriebene Config + `paths`, Idempotenz, Validierung, Schema strikt), Split/Barrel auf synthetischem Roh-Output, Registry, Spec-Serialisierung, Adapter-Randfälle (nx-plugin-openapi gegen Stub-Backend, fehlende CLI) | ~3 s |
| (dito) | `integration`: `test/integration/**/*.spec.mts`, beide Projekte **mit Coverage** | Facade end-to-end pro Adapter (openapi-tools mit echter Jar, hey-api, nx-plugin-openapi mit beiden Backends) in einem Fixture-Workspace unter `tmp/openapi-it/`: Klassifizierung, Split, Import-Umschreibung auf Aliase, Barrels inkl. doppelter Exportnamen, Header, zweiter Lauf byte-identisch, `tsc` gegen die Aliase. Testing-Generierung (openapi-typescript, orval, openapi-msw) + die generierten Handler laufen in msw 3 (Node) und liefern Daten laut Spec. Executoren mit Executor-Kontext, `update-spec` gegen lokalen HTTP-Server (updated/unchanged/500/ohne url/nicht erreichbar, YAML/JSON normalisiert). Fehlerpfade: Generator-Prozess scheitert, Java fehlt (simuliert), ungültige Spec. `nx` selbst im Fixture-Workspace (`nx.json` des Repos): `nx g …:client` schreibt die Config, Nx liest sie (Tags, Kanten, Targets aus `project.json` + `targetDefaults`), `nx run …:generate-api-client` / `…-testing:generate-api-testing` + Cache | ~45 s (Java 11+) |

Coverage (V8) gilt für die Summe beider Projekte, gemessen im selben Lauf (`test`): Schwelle **95 %** für Lines, Branches, Functions, Statements (darunter rot). Ausgenommen nur `src/**/*.d.ts` (reine Typen, Vertrag) und die Specs; JSON-Schemas zählen nicht als Code. Stand: **100 % Statements/Lines/Functions, 98,4 % Branches** (97 Tests; die 4 offenen sind `??`-Fallbacks auf Werte, die nie nullish sind, z. B. `tree.read()` nach `tree.exists()`).

```sh
pnpm exec nx test tooling-openapi                     # alles (Unit + Integration) + Coverage, Output coverage/ gecacht
pnpm exec vitest run --config packages/tooling/openapi/vitest.config.mts --project unit   # nur Unit, ohne Nx/Coverage (~3 s)
open packages/tooling/openapi/coverage/index.html     # HTML-Report (auch lcov.info, coverage-summary.json)
```

Die Integrationstests brauchen Java (openapi-tools) und laufen in der CI (`run-many`/`affected -t … test`). Beweise: Test-Datei weg → 88 % → Target rot; eine Logikzeile in `split.mjs` invertiert → Test rot.
