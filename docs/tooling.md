# Tooling & Generatoren

Das Werkzeug liegt in **`packages/tooling`**, aufgeteilt in sechs Nx-Libs (je eigenes Projekt und Workspace-Paket, `type:tooling` + `tooling:<lib>`). Details, Optionen und Begründungen: [`packages/tooling/README.md`](../packages/tooling/README.md) und die README jeder Lib.

| Lib (Paket) | Inhalt |
|---|---|
| `conventions` (`@mo-transfer/tooling-conventions`) | Pfad → Name/Tags/Alias, `generated`, Client-Pfade, Scope-Liste (`lib-scopes.json`), Vorlage der Config-Dateien (`lib-files.ts`), Tree-Helfer (schreiben/verschieben Config + `paths`), Spec-Fixture |
| `workspace` (`@mo-transfer/tooling-workspace`) | Generatoren, Sync-Generator `app-routes` (`nx.json` → `sync.globalGenerators`) |
| `openapi` (`@mo-transfer/tooling-openapi`) | publishable: Pipeline + Presets, Adapter-SPI/Registry/Loader, Plugin, Executoren `generate`/`generate-testing`/`update-spec`, Generator `client` |
| `ng-lib` (`@mo-transfer/tooling-ng-lib`) | Executor `test` (durchgereicht, Vitest UI per `--ui` + Hasher) |
| `verify` (`@mo-transfer/tooling-verify`) | `verify` (Nx-Target `tooling-verify:verify`, gecacht), `verify:nx-internals`, dist-Snapshot |
| `eslint-rules` (`@mo-transfer/tooling-eslint-rules`) | ESLint-Regeln des [Namensschemas](namensschema.md), geladen von `eslint.config.mjs` |

Abhängigkeiten (Paket-Imports, `depConstraints` + 20 Verify-Fälle, zyklenfrei): `openapi` → `conventions`; `eslint-rules` → `conventions`; `workspace` → `conventions`, `openapi` (move/remove pflegen `openapi-clients.json` und Client-`project.json`); `conventions`, `ng-lib`, `verify` → nichts. `workspace` → `ng-lib` ist entfallen (keine inferierten Targets mehr).

**Kein Build-Schritt:** Nx lädt Generatoren und Executoren als TypeScript/JS aus den Quellen (eigener swc-Transpiler), aufgelöst über die Workspace-Links in der Root-`package.json` (`@mo-transfer/tooling-workspace`, `-openapi`, `-ng-lib`) und in den `package.json` der Libs. Jeder importierte Tooling-Export hat einen exakten `paths`-Eintrag (`verify` prüft `exports` ↔ `paths`). Einziges Plugin, das bei jeder Graph-Berechnung geladen wird: `@mo-transfer/tooling-openapi/plugin` (liest `openapi-clients.json`, Registry deklarativ, prüft Dateien per `existsSync`, lädt keinen Adapter-Code). `tooling-openapi` ist durchgehend TypeScript; Nx lädt es als CommonJS per swc und entfernt den Hook danach — Consumer-Module (`.ts`-Adapter, Transforms, Scaffold) lädt deshalb ein eigener Loader ([Pipeline-Architektur](openapi-pipeline-architektur.md)). Ausnahme vom Prinzip „kein Build“: `tooling-openapi:build` erzeugt das npm-Paket.

## Anleitungen

```sh
# neue Domain: types, data-access, state, ui, shell + testing-Gerüst, je mit Config-Dateien + paths, Lazy-Route, Scope in lib-scopes.json
nx g @mo-transfer/tooling-workspace:domain payment
# … mit Beispiel-Fixtures/-Handlern/-Szenarien + Beispiel-Spec (state/src/payment.store.spec.ts)
nx g @mo-transfer/tooling-workspace:domain payment --examples
# neue Lib in bestehender Domain (Layer-Liste aus den Konventionen)
nx g @mo-transfer/tooling-workspace:layer payment utils
# neues Feat: feature-Container + optional state, ui; Lazy-Route in den Shell-Routes
nx g @mo-transfer/tooling-workspace:feat payment checkout --state --ui
# testing-Gerüst für eine bestehende Domain (leere, typisierte Handler/Szenarien auf der Baseline der eigenen Clients); --examples für Beispieldaten
nx g @mo-transfer/tooling-workspace:testing payment
# generierter OpenAPI-Client (shared oder --domain), Spec als Datei oder URL
nx g @mo-transfer/tooling-openapi:client weather-client --spec=https://example.org/openapi.json
nx g @mo-transfer/tooling-openapi:client billing-client --domain=booking --spec=./specs/billing.yaml --adapter=hey-api
# verschieben / umbenennen (Importe inkl. import() in Routes, Route-Pfade, Scope-Liste, project.json/package.json/tsconfig, paths)
nx g @mo-transfer/tooling-workspace:move booking/feat-rebook checkin/feat-rebook
nx g @mo-transfer/tooling-workspace:rename payment billing
# löschen (bricht bei Importen ab, außer --force; Routen, paths, Kanten + Scope raus)
nx g @mo-transfer/tooling-workspace:remove billing
# Komponente / Service / Store in einer Lib
nx g @mo-transfer/tooling-workspace:component libs/booking/ui/src/booking-badge   # → @nx/angular:component
nx g @mo-transfer/tooling-workspace:service libs/payment/data-access/src/payment-cache
nx g @mo-transfer/tooling-workspace:store libs/payment/state/src/payment-filter      # nur state/ui/feature
nx g @nx/angular:component libs/booking/ui/src/booking-badge --export          # geht jetzt auch direkt (ohne Layer-Prüfung)
```

`@nx/angular:component` funktioniert mit `project.json` wieder (getestet: erzeugt `booking-badge.ts` und exportiert es aus `index.ts`). Nx hat keinen Service-Generator; `@schematics/angular:service` läuft über Nx' Angular-CLI-Adapter mit `--project booking-state --path libs/booking/state/src` (getestet). Die Blueprint-Generatoren `component`/`service` bleiben als **dünne Vorbelegung**: Layer-Prüfung (component nur in ui/feature/shell, service in data-access/state/feature/shell, store in state/ui/feature, nie in generierten Clients), Pfad statt Projekt + Name, inline Template/Styles, `app`-Präfix, ohne Spec, Export aus `index.ts`, dann delegieren sie an den Nx- bzw. Angular-Generator (Templates von dort, z.B. Angular 22 `@Service()`). `store` behält sein Template (Nx kennt keinen Signal-Store-Generator). `nx.json` → `generators["@nx/angular:component"].style` ist gesetzt, sonst schreibt der Nx-Generator ihn beim ersten Aufruf in `nx.json` (Cache-Invalidierung).

## Wächter

- **Config pro Lib:** `tooling-verify:verify` meldet jede fehlende oder falsche Datei (`project.json`, `tsconfig.json`, bei buildable Libs `package.json`, `ng-package.json`, `tsconfig.lib*.json`, bei Specs `tsconfig.spec.json`; Name, `sourceRoot`, Targets, Alias, `dest`, `extends`, peers), Build-Dateien in Testing-Libs, Config-Dateien außerhalb einer Lib/eines Client-Ordners, fehlende/falsche/veraltete `paths`-Einträge und einen Wildcard.
- **Tags + Scope-Liste:** Tags jeder `project.json` = aus dem Pfad abgeleitete Tags (`nx sync` schreibt sie per Sync-Generator `lib-tags` neu, `nx sync:check` meldet Abweichungen), Scope in `lib-scopes.json`, keine Listeneinträge ohne Lib. `domain`, `move`/`rename`, `remove` pflegen die Liste.
- **Namen:** Lib-Ordner (Form, Layer, kebab-case für Scope/Feat/Client) → `tooling-verify:verify` (Ordnerregel), Generatoren lehnen ab; Datei-, Ordner- und Symbolnamen in den Libs → `nx lint` (`blueprint/*`, `@angular-eslint/*-selector`, `@typescript-eslint/naming-convention`), siehe [Namensschema](namensschema.md).
- **Routen:** `nx sync:check` (globaler Sync-Generator `@mo-transfer/tooling-workspace:app-routes`): jede Slice-Shell mit `Routes` ist in `app.routes.ts` registriert, keine Lazy-Route zeigt auf eine fehlende Lib. `nx sync` repariert.
