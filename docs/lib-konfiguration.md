# Lib-Konfiguration, Build und Cache

Jede Lib trägt ihre Config-Dateien selbst (kein Plugin inferiert Projekte oder Targets, Ausnahme: die [OpenAPI-Client-Targets](openapi-clients.md#inferierte-client-targets-plugin)). Target-Bodies stehen in `nx.json` → `targetDefaults`. Angelegt und gepflegt werden die Dateien von den [Generatoren](tooling.md), geprüft von `verify`.

## Dateien pro Lib

Von den Generatoren geschrieben, Vorlage `packages/tooling/conventions/src/lib-files.ts`, von `verify` geprüft:

| Datei | wer | Inhalt |
|---|---|---|
| `project.json` | alle | Name (Pfad mit `-`), Tags aus dem Pfad, `targets` `{ build?, lint, typecheck, test? }` (leer, Bodies in `targetDefaults`), bei Client-Teilen `implicitDependencies` |
| `tsconfig.json` | alle | `extends` `tsconfig.base.json`, strict, es2022, `module: preserve`, `include: src/**/*.ts` (IDE + `typecheck`) |
| `package.json` | buildable (nicht `testing`) | `name` = Alias, `private`, `peerDependencies` = npm-Imports des Produktionscodes, `sideEffects: false` |
| `ng-package.json` | buildable | `dest` `dist/<root>`, `entryFile` `src/index.ts` |
| `tsconfig.lib.json`, `tsconfig.lib.prod.json` | buildable | Build ohne Specs, production ohne `declarationMap` |
| `tsconfig.spec.json` | Libs mit Specs | nur `src/**/*.spec.ts` + `*.d.ts` |

Dazu pro Client-Ordner `libs/[<d>/]generated/<client>/project.json`. Summe: 267 Dateien (47 Libs + 3 Client-Projekte) statt 0, `tsconfig.base.json` 52 statt 6 `paths`.

## Vor- und Nachteile der expliziten Config

**Vorteile:**
- Keine Nx-Interna mehr für Build und App: Standard-Executoren, keine temporären Dateien; `@nx/angular:component` und `@schematics/angular:service` funktionieren wieder.
- Sichtbar: Tags und Targets stehen in der Lib (`project.json`), IDE, Nx Console und fremde Tools (`tsc -p`, ng-packagr) finden die Dateien, die sie erwarten.
- Keine Graph-Berechnung durch eigenen Code (kein Plugin-Worker, kein Dateisystem-Scan pro Lib); ein Tippfehler im Ordner bricht nicht mehr den ganzen Graph.
- Feiner für `affected`/Cache: Generatoren und Plugins sind kein Input der Lib-Tasks mehr (`lint` hing vorher an beiden Plugins); `lib-conventions.ts` nur noch für `lint` (Namensregeln), nicht für `build`/`test`/`typecheck`.
- Einzelne Lib kann abweichen (eigene Compiler-Optionen, zusätzliches Target), ohne Plugin-Option.

**Nachteile:**
- 267 Dateien Boilerplate, fast alle gleich; Pflege über Generatoren (`move`/`rename`/`remove` ziehen Name, Tags, Alias, relative Pfade, `paths`, `implicitDependencies` nach).
- Tags sind wieder handeditierbar: Tippfehler fängt nicht mehr der Graph, sondern `nx sync:check` (Sync-Generator `lib-tags`, `nx sync` repariert) und `tooling-verify:verify` (Tags ↔ Pfad ↔ `lib-scopes.json`).
- `peerDependencies` sind statisch: der Generator leitet sie einmal aus den Imports ab, danach prüft `verify` die Übereinstimmung (rot statt still veraltet).
- ~~Adapterwechsel eines Clients = `openapi-clients.json` + Adapter-Inputs in `project.json`~~ — entfallen: die Client-Targets inferiert das Plugin aus dem Eintrag ([Bewertung](openapi-clients.md#inferierte-client-targets-plugin)).
- Nx liest die lib-`package.json` mit: jede buildable Lib trägt zusätzlich das Tag `npm:private` (ohne Constraint, harmlos).
- Neue Lib nur per Generator bequem; von Hand müssen alle Dateien + `paths`-Eintrag stimmen.

## Buildable Libs

Jede Lib außer den Testing-Libs hat ein `build`-Target: `@nx/angular:ng-packagr-lite` (`ng-packagr` ~22.0, incremental buildable). Die Target-Config steht in `nx.json` → `targetDefaults.build` (`dependsOn: ["^build", "^generate-api-client", "^generate-api-testing"]`, cache, Output `dist/{projectRoot}`, `project: {projectRoot}/ng-package.json`, `tsConfig: {projectRoot}/tsconfig.lib.json`, production → `tsconfig.lib.prod.json`), die `project.json` der Lib trägt nur `"build": {}`.

- **Dateien der Lib:** `ng-package.json` (`dest`, `entryFile`), `package.json` (`name` = Alias, `private`, `peerDependencies`, `sideEffects: false`), `tsconfig.lib.json` (erweitert `tsconfig.json`, Declarations, ohne Specs), `tsconfig.lib.prod.json` (ohne `declarationMap`).
- **Alias → dist:** Nx (`@nx/js` `calculateProjectBuildableDependencies`) nimmt den Import-Namen einer Abhängigkeit aus deren `package.json` (`metadata.js.packageName`). Beim Lib-Build und beim App-Build mit `buildLibsFromSource: false` schreibt Nx die Paths der gebauten Abhängigkeiten deshalb selbst auf `dist/` um. Auf `feat/nx-blueprint` fehlte die lib-`package.json`, dafür gab es die Wrapper `ng-lib:build`/`:application`; hier entfallen sie.
- **peerDependencies nur aus Produktionscode:** der Generator leitet sie aus den Imports der Quellen ohne Specs ab (`^<major>.0.0` der Root-`package.json`, ohne `tslib`), `verify` prüft die Übereinstimmung bei jedem Lauf (sonst stand z.B. `vitest` aus Spec-Imports drin). Generierte Client-Teile haben keine (gitignored Code, dist wie vorher).
- **dist ist byte-identisch** zu `feat/nx-blueprint` (580 Dateien, Snapshot `packages/tooling/verify/nx-internals/dist-hashes.json` unverändert), inkl. der `package.json` in dist (gleiche Schlüsselreihenfolge und peers). Messung in sheriff-blue-print vor der Reduktion; hier nach der Übernahme neu geschrieben: 532 Dateien.
- **Incremental:** Beim Lib-Build schreibt Nx die Pfade abhängiger Libs auf `dist/` um. Ohne gebaute Abhängigkeit schlägt der Build fehl (`TS2307`), `dependsOn: ^build` sorgt für die Reihenfolge.
- **App:** `client:build` nutzt `@nx/angular:application` mit `buildLibsFromSource: false`, bündelt also die gebauten Libs aus `dist/`. Beleg (Marker-Test, auch in `verify:nx-internals`): Text in `dist/libs/layout/ui/esm2022/nav-bar.js` ersetzt, `nx run client:build --skip-nx-cache --exclude-task-dependencies` → Marker im `main-*.js`, nicht in den Quellen. `serve` (`@angular/build:dev-server`) baut weiterhin aus den Sources. Für `serve` gegen `dist/` bräuchte es `@nx/angular:dev-server` und damit `@angular-devkit/build-angular`, deshalb bewusst nicht umgesetzt.
- **Source-Aliase bleiben:** `tsconfig.base.json` zeigt weiter auf `src/index.ts` (IDE, `typecheck`, Lint).
- **Output:** `ng-packagr-lite` erzeugt `esm2022/` (eine Datei pro Quelldatei) + `.d.ts`, in *full compilation mode*, ohne FESM-Bundle. Das reicht für das App-Bundling, ist aber nicht publizierbar (deshalb `private: true`). Publizierbar wäre `@nx/angular:package` (FESM2022 + partial compilation).
- **`enforceBuildableLibDependency`** bleibt an. Jede Lib außer den Testing-Libs hat `build`, die Regel greift also bei Imports von Testing-Libs in Produktionscode.

## Explizite Config pro Lib

Jede Lib trägt ihre Config selbst, kein Plugin leitet etwas ab. Eine neue Lib legt ein Generator an:

```sh
nx g @mo-transfer/tooling-workspace:layer checkin utils
# → libs/checkin/utils/src/{index.ts,checkin.utils.ts}
#   + project.json (checkin-utils, Tags scope:checkin type:utils feat:none, Targets build/lint/typecheck),
#     package.json, ng-package.json, tsconfig.json, tsconfig.lib.json, tsconfig.lib.prod.json
#   + tsconfig.base.json paths["@mo-transfer/checkin/utils"]
```

Von Hand geht es auch: alle Dateien wie in einer Nachbar-Lib, Tags passend zum Pfad, Scope in `lib-scopes.json`, `paths`-Eintrag. Specs dazulegen (`src/**/*.spec.ts`) braucht zusätzlich `tsconfig.spec.json` + `"test": {}` (der Domain-Generator macht das für die Beispiel-Spec). Ein Ordner `testing` statt eines Layers ist eine Testing-Lib (`type:testing`, kein `build`, keine Build-Dateien). `tooling-verify:verify` beweist bei jedem Lauf mit zwei temporären Libs in `libs/booking/feat-tmpverify/` (`ui`, `types`, mit den Dateien der Generatoren): Projekt, Tags und Targets stimmen, 8 Lint-Fälle gegen und von ihnen greifen; eine dritte Lib nur mit `src/index.ts` meldet der Config-Wächter (7 Meldungen). Danach wird alles entfernt und `tsconfig.base.json` wiederhergestellt.

### Bausteine

| Baustein | Aufgabe |
|---|---|
| `libs/**/project.json` | Name, Tags, `implicitDependencies` (Client-Teile), Targets als leere Einträge |
| `nx.json` → `targetDefaults` | Bodies von `lint`, `typecheck`, `build`, `test` (per Target-Name) und `@nx/angular:application` (App): Executor, Optionen mit `{projectRoot}`, Inputs, `dependsOn` inkl. `^generate-api-client`/`^generate-api-testing`, Cache |
| `tsconfig.base.json` | ein exakter `paths`-Eintrag pro Lib (47) und pro Tooling-Export (5) |
| `lib-scopes.json` | Scope-Liste (`{ "scopes": [...] }`), gegen Ordner-Tippfehler, von den Generatoren gepflegt, von `verify` geprüft. Eigene Datei statt `nx.json`: jede `nx.json`-Änderung invalidiert den ganzen Cache |
| `packages/tooling/conventions/src/lib-files.ts` | Vorlage aller Config-Dateien (`libConfigFiles`), Umzug (`relocateConfig`); `src/tree.ts` schreibt sie samt `paths` (`writeLibConfig`, `relocateLibConfig`, `removeLibPaths`, `updateImplicitDependencies`) |
| `packages/tooling/ng-lib/src/test.js` | einziger verbliebener Executor-Wrapper: `@nx/angular:unit-test` + Vitest UI per `--ui` (unten) |
| `eslint.config.mjs` | Tags aus dem Projekt-Graph (= `project.json`), Deep-Import-Verbot aus den `paths` |

`targetDefaults` per Target-Name gelten für jedes Projekt mit gleichnamigem Target, aber nur, wenn Executor/Kommando kompatibel sind: `client:build` (`@nx/angular:application`) und die `test`-Targets der Tooling-Libs bleiben unberührt. Die `typecheck`-Targets der Tooling-Libs sind ebenfalls `nx:run-commands`; Nx mischt dort `dependsOn` hinein, deshalb setzen sie `"dependsOn": []` explizit.

Targets (Bodies in `targetDefaults`):

| Target | Executor | Wann |
|---|---|---|
| `lint` | `nx:run-commands` → `eslint .` im Lib-Ordner | immer |
| `typecheck` | `nx:run-commands` → `tsc -p {projectRoot}/tsconfig.json` | immer |
| `build` | `@nx/angular:ng-packagr-lite` | nicht für `testing` |
| `test` | `@mo-transfer/tooling-ng-lib:test` (→ `@nx/angular:unit-test`, headless, einmalig, gecacht). Vitest UI über dasselbe Target: `nx run <lib>:test --ui` | nur Libs mit `*.spec.ts` (`tsconfig.spec.json`) |

Es gibt genau ein Test-Target. **Vitest UI** ist ein Flag, keine Configuration: `--ui` schaltet im Executor watch und headed Chromium ein (`chromiumHeadless` → `chromium`, `--headless` erzwingt weiter headless). Eine Configuration `test:ui` wäre eine zweite Optionsmenge pro Lib im Graphen; das Flag hält die UI-Logik an einer Stelle (Executor). **Cache:** Nx hasht Overrides mit, ein `--ui`-Lauf trifft also nie den Eintrag des normalen `test` (und umgekehrt). Beendet man die UI regulär (Vitest `q`), meldet der Builder aber Erfolg, und Nx cachte den Lauf unter dem UI-Hash, der nächste `--ui`-Aufruf spielte nur die alte Ausgabe ab. Dagegen hat der Executor einen eigenen Hasher (`executors.json` → `hasher`, `src/test-hasher.js`): mit `ui` ein einmaliger Hash (nie ein Treffer), ohne `ui` unverändert der Nx-Hash. `verify:nx-internals` prüft, dass Nx den Hasher lädt.

### Executor-Wrapper (`packages/tooling/ng-lib`)

Von den drei Wrappern auf `feat/nx-blueprint` bleibt einer:

| Wrapper auf `feat/nx-blueprint` | hier | Grund |
|---|---|---|
| `build` (temporäre `ng-package.json`, `package.json`, tsconfig mit dist-Paths) | entfernt → `@nx/angular:ng-packagr-lite` | die Dateien liegen in der Lib, den dist-Remap macht Nx über die lib-`package.json` |
| `application` (tsconfig mit dist-Paths der Libs) | entfernt → `@nx/angular:application` | Nx kennt den Alias aus der lib-`package.json`, Marker-Test grün |
| `test` (Build-Target als `@angular/build:ng-packagr` im Builder-Context, spec-tsconfig pro Lib) | geschrumpft auf Durchreichen + `--ui` | echte `ng-package.json` und `tsconfig.spec.json`; `@nx/angular:unit-test` mappt `ng-packagr-lite` selbst. Ein Hasher lässt sich nur an einen eigenen Executor hängen, deshalb bleibt der Wrapper für die UI |
| Skript `typecheck-lib.mjs` | entfernt → `tsc -p` | lib-eigene `tsconfig.json` |

`@nx/angular:unit-test` direkt einzutragen geht (getestet, Tests grün); dann wäre die UI `nx run <lib>:test --ui --watch --browsers=chromium --skip-nx-cache` und ein regulär beendeter UI-Lauf landete im Cache.

Browser Mode, MSW-Worker und die Workarounds in `vitest-base.config.mts` sind unberührt (`runnerConfig` wie bisher).

### Cache-Inputs

Gemeinsame Dateien liegen außerhalb von `{projectRoot}` und stehen deshalb explizit in den Inputs (`targetDefaults`); die lib-eigenen Config-Dateien sind über `default`/`production` dabei:

| Target | zusätzliche Inputs |
|---|---|
| `lint` (Libs) | `eslint.config.mjs`, `tsconfig.base.json` (Deep-Import-Verbot aus den `paths`), `packages/tooling/conventions/src/lib-conventions.ts` + `packages/tooling/eslint-rules/src/**` ohne Specs (Namensregeln), `eslint`, `angular-eslint`, `typescript-eslint` |
| `@nx/eslint:lint` (`client`, Tooling) | `eslint.config.mjs`, dieselben Namensregel-Inputs (die Config lädt die Regeln für jeden Lint-Lauf) |
| `typecheck` | `tsconfig.base.json`, `typescript` |
| `build` | `production`, `^production`, `tsconfig.base.json`, `ng-packagr`, `@angular/compiler-cli`, `typescript` |
| `test` | `default`, `^production`, `tsconfig.base.json`, `vitest-base.config.mts`, `packages/tooling/ng-lib/src/**`, `vitest`, `@vitest/browser-playwright`, `msw`, `openapi-msw`, `@angular/build` |
| `client:build` (`targetDefaults`) | `production`, `^production`, `tsconfig.base.json` |
| `tooling-verify:verify` | `libs/**`, `apps/**`, `eslint.config.mjs`, `nx.json`, `openapi-clients.json`, `lib-scopes.json`, `tsconfig.base.json`, Skript, Output von `client:build` (dependsOn), `eslint`, `@nx/eslint-plugin`, `nx` |

Alle Lib-Targets hashen zusätzlich den generierten Code ihrer Abhängigkeiten (`dependentTasksOutputFiles`, siehe [OpenAPI-Clients](openapi-clients.md#targets-und-abhängigkeiten)). `production` schließt `tsconfig.spec.json` aus. Die Plugins sind kein Input mehr: Tags stehen in `project.json` (Input über `default`). `lib-conventions.ts` ist nur `lint`-Input, weil die Namensregeln daraus lesen. `nx show target booking-state:test --inputs` zeigt die aufgelösten Inputs.

### Kosten und Trade-offs

- **Boilerplate:** 267 fast gleiche Dateien. Generatoren schreiben und pflegen sie (`move`/`rename` ziehen Name, Tags, Alias, `dest`, relative `extends`, Pfade in Client-Targets, `paths` und `implicitDependencies` anderer Projekte nach; `remove` nimmt `paths` und Kanten mit). Von Hand bearbeitet, hält `verify` sie ehrlich.
- **Weniger Nx-Interna:** nur noch `@nx/angular/src/executors/unit-test/unit-test.impl` (Import im Test-Wrapper) und das Laden eines Executor-`hasher`. Build und App laufen über die öffentlichen Executoren.
- **Nach jedem `nx migrate` (und Angular-Update) die Beweise neu laufen lassen:** `pnpm verify:nx-internals` (run-many mit `--skip-nx-cache`, dist-Äquivalenz gegen Snapshot oder `--reference`, Marker-Test App-gegen-dist, MSW-Probe fehlender Handler, MSW-Worker aus dem msw-Paket, UI-Hasher, `tooling-verify:verify`), siehe [Tooling & Generatoren](tooling.md).
- **Nx-Standardgeneratoren funktionieren wieder:** `@nx/angular:component` findet die Lib über `project.json`, `@schematics/angular:service` mit `--project`. Die eigenen `component`/`service` sind nur noch Vorbelegung + Layer-Prüfung, siehe [Tooling & Generatoren](tooling.md).
- **Tags wieder in Dateien:** Tippfehler (`scope:bookng`, `libs/bokking/…`) bricht nicht mehr den Graph, sondern `tooling-verify:verify` (CI, Probe: 5 Meldungen für Tag-Tippfehler, fehlenden `paths`-Eintrag, fehlende peers, Scope nicht in der Liste, veralteten Listeneintrag). `nx lint` erkennt ihn nicht als Tippfehler: `scope:bookng` wäre einfach ein neuer Scope mit eigener generierter Constraint.
- **`npm:private`:** Nx liest die lib-`package.json` mit und vergibt jeder buildable Lib zusätzlich dieses Tag. Keine Constraint nutzt es.
- `typecheck` prüft Specs mit (wie vorher mit `include: src/**/*.ts`).
