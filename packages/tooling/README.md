# packages/tooling

Werkzeug des Blueprints (übernommen aus sheriff-blue-print, Branch `feat/nx-reduced-blueprint`: explizite Config pro Lib; einziges Crystal-Plugin: `generate`/`update-spec` der OpenAPI-Clients), aufgeteilt in sechs Nx-Libs. `packages/tooling` selbst ist nur ein Gruppierungsordner, kein Projekt und kein Paket.

| Lib | Paket / Projekt | Tag | Inhalt | Details |
|---|---|---|---|---|
| `conventions` | `@mo-transfer/tooling-conventions` / `tooling-conventions` | `tooling:conventions` | Pfad → Name/Tags/Alias, Layer, reservierter Ordner `generated`, Client-Pfade, Scope-Liste (`lib-scopes.json`), Vorlage der Config-Dateien pro Lib, Tree-Helfer (Config + `paths` schreiben/verschieben), Fixture-Workspace für Specs | [README](conventions/README.md) |
| `openapi` | `@mo-transfer/tooling-openapi` / `tooling-openapi` | `tooling:openapi` | `project.json`-Vorlagen der Clients, Plugin (Client-Targets aus `openapi-clients.json`), Facade (Vertrag, Registry, Adapter, Split, Barrel), Testing-Generierung, Executoren `generate`/`update-spec`/`generate-testing`, Generator `client` | [README](openapi/README.md) |
| `workspace` | `@mo-transfer/tooling-workspace` / `tooling-workspace` | `tooling:workspace` | Generatoren domain/layer/feat/testing/move/rename/remove/component/service/store (schreiben/pflegen die Config-Dateien), Sync-Generator `app-routes` | [README](workspace/README.md) |
| `ng-lib` | `@mo-transfer/tooling-ng-lib` / `tooling-ng-lib` | `tooling:ng-lib` | Executor `test`: `@nx/angular:unit-test` durchgereicht, Vitest UI per `--ui` (Hasher) | [README](ng-lib/README.md) |
| `verify` | `@mo-transfer/tooling-verify` / `tooling-verify` | `tooling:verify` | `verify` (Boundaries, Namensregeln, Config pro Lib, Tag-Schema + Ordnerregel, Clients, Tooling-Libs, affected, Bundle-Scan), `verify:nx-internals`, dist-Snapshot | [README](verify/README.md) |
| `eslint-rules` | `@mo-transfer/tooling-eslint-rules` / `tooling-eslint-rules` | `tooling:eslint-rules` | ESLint-Regeln des Namensschemas (`blueprint/lib-file-naming`, `layer-symbol-naming`, `no-internal-export`), geladen von `eslint.config.mjs` | [README](eslint-rules/README.md) |

Alle tragen zusätzlich `type:tooling` (darf nur `type:tooling` importieren, Libs in `libs/` dürfen kein Tooling importieren).

## Abhängigkeiten

```
conventions  ◀── openapi  ◀── workspace        ng-lib        verify (liest Graph, Dateien, ESLint)
     ▲  ▲                         │
     │  └─────────────────────────┘
     └── eslint-rules (von eslint.config.mjs geladen)
```

| Lib | darf importieren | Grund |
|---|---|---|
| `conventions` | nichts | Basis: Pfad-Konventionen und Config-Vorlagen gelten für alle Generatoren; `lib-conventions.ts`/`lib-files.ts` ohne Runtime-Imports |
| `openapi` | `conventions` | Client-Pfade, Tags, Scope-Liste kommen aus den Konventionen. Kennt die Lib-Generatoren nicht |
| `workspace` | `conventions`, `openapi` | `move`/`rename`/`remove` halten `openapi-clients.json` und Client-`project.json` (Name, Tags) nach (`@mo-transfer/tooling-openapi/clients`). Die Abhängigkeit auf `ng-lib` ist entfallen: Targets stehen in `project.json` + `nx.json` |
| `ng-lib` | nichts | kapselt das eine verbliebene Nx-Interna (unit-test-Executor), weiß nichts von Konventionen oder OpenAPI |
| `verify` | nichts | prüft von außen (Projekt-Graph, Dateien, ESLint, git), leitet Tags und Ordnerregel unabhängig ab |
| `eslint-rules` | `conventions` | Layer/Scope/Feat und Datei-Kinds aus denselben Konventionen wie die Generatoren, keine doppelte Logik |

Durchgesetzt über `depConstraints` (`eslint.config.mjs`, `toolingConstraints`) und 20 Verify-Fälle (`tooling: …`), zyklenfrei (Zyklen meldet die Regel zusätzlich). Imports über Lib-Grenzen nur per Paketname, relative Pfade blockiert die Regel.

## Laden ohne Build

Nx lädt Generatoren und Executoren direkt aus den Quellen (`main`/`exports` zeigen auf `.ts`, Executoren sind CJS), mit eigenem Transpiler (swc). Die Root-`package.json` verlinkt die Pakete, die Nx per Namen auflöst (`@mo-transfer/tooling-workspace`, `-openapi`, `-ng-lib`), jede Lib verlinkt ihre Abhängigkeiten in ihrer eigenen `package.json` (`workspace:*`). Nach `git pull` einmal `pnpm install`.

**`paths` in `tsconfig.base.json`:** jeder importierte Export einer Tooling-Lib hat einen exakten Eintrag (wie jede Lib), swc und IDE landen so direkt auf den `.ts`-Quellen. `verify` prüft `exports` ↔ `paths` in beide Richtungen. `eslint-rules` importiert niemand per Paketname (`eslint.config.mjs` lädt die Quellen per Pfad), deshalb kein eigener Eintrag; ihr Import `@mo-transfer/tooling-conventions` läuft über den bestehenden.

**Kein Build-Schritt:** kein veraltetes `dist/`. Der Projekt-Graph entsteht aus `project.json`/`package.json`; einziges eigenes Plugin in `nx.json` ist `@mo-transfer/tooling-openapi/plugin` (nur Targets der Client-Projekte, aus den `.ts`-Quellen geladen, `paths`-Eintrag wie jeder Export).

## Generatoren

```sh
nx g @mo-transfer/tooling-workspace:domain payment
nx g @mo-transfer/tooling-workspace:layer payment utils
nx g @mo-transfer/tooling-workspace:feat payment checkout --state --ui
nx g @mo-transfer/tooling-workspace:testing checkin
nx g @mo-transfer/tooling-workspace:move booking/feat-rebook checkin/feat-rebook
nx g @mo-transfer/tooling-workspace:rename payment billing
nx g @mo-transfer/tooling-workspace:remove billing [--force]
nx g @mo-transfer/tooling-workspace:component|service|store libs/booking/ui/src/booking-badge
nx g @mo-transfer/tooling-openapi:client pet-client --spec=https://petstore3.swagger.io/api/v3/openapi.json
```

Alle schreiben bzw. pflegen die Config-Dateien der Libs und die `paths`. `component`/`service` delegieren an `@nx/angular:component` / `@schematics/angular:service` (die funktionieren mit `project.json` wieder). Executoren: `@mo-transfer/tooling-ng-lib:test`, `@mo-transfer/tooling-openapi:generate|update-spec|generate-testing`; Build und App nutzen `@nx/angular:ng-packagr-lite` / `:application`.

## Checks

| Befehl | prüft |
|---|---|
| `nx run-many -t lint test typecheck -p 'tooling-*'` | Specs pro Lib (Vitest, Node): conventions, workspace, openapi, eslint-rules (RuleTester). `tooling-openapi:test` = Unit + Integration (echte Adapter, msw, tsc, `nx` im Fixture-Workspace, Java) mit Coverage ≥ 95 %, siehe [openapi](openapi/README.md#tests) |
| `pnpm verify` (`nx run tooling-verify:verify`) | siehe [verify](verify/README.md) |
| `pnpm verify:nx-internals` | nach `nx migrate` / Angular-Update |

## `nx affected`

Die Libs haben keine Graph-Kante zum Tooling. Nötig ist sie nicht: jede Tooling-Datei, die eine Lib-Task nutzt, ist `{workspaceRoot}`-Input dieser Task, und `nx affected` folgt Inputs. Die CI braucht deshalb keinen Tooling-Fallback:

| Änderung in | betroffen |
|---|---|
| `ng-lib/src/**` | alle Libs mit `test` + Abhängige (App) |
| `openapi/src/facade/**`, `openapi/src/executors/**`, `openapi/src/plugin/**`, `openapi/src/project-config.ts` | Client-Projekte + Abhängige (Plugin + `project-config.ts` formen die inferierten Client-Targets) |
| `openapi/src/testing/**` | Testing-Libs der Clients + deren Nutzer |
| `openapi-clients.json` | alle Client-Projekte + Abhängige (Input von `update-spec`; der Cache von `generate` bleibt pro Eintrag) |
| `libs/<lib>/project.json` (Tags, Targets) | die Lib + Abhängige |
| `conventions/src/lib-conventions.ts`, `eslint-rules/src/**` | `lint` aller Projekte (Namensregeln lesen die Konventionen); Specs der Regeln sind aus dem Hash ausgenommen, `affected` ignoriert die Negation aber |
| übrige `conventions/**`, Generatoren, `verify` | nur Tooling-Libs (auf `feat/nx-blueprint` (extern) waren zusätzlich die Plugins `lint`-Input aller Libs) |

`verify` probt das mit `nx show projects --affected --files=…` (10 Proben, positiv und negativ). Implizite Kanten Lib → Tooling-Lib wären gröber und würden den Graphen mit ~50 Kanten füllen, deshalb nicht umgesetzt.
