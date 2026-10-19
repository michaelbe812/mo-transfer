# Herkunft und Historie

Woher der Blueprint kommt und wie er zum heutigen Stand wurde. Für die Arbeit im Repo nicht nötig; die geltenden Regeln stehen in den Themen-Dokumenten ([Übersicht](README.md)).

> **Übernommen aus `sheriff-blue-print`, Branch `feat/nx-reduced-blueprint`: reduziertes Regelwerk.** Import-Präfix hier `@mo-transfer/`. Verweise auf Branches (`feat/nx-blueprint`, `feat/nx-blueprint-explicit-config`) und Commits beschreiben die Herkunft dort (extern, nicht in diesem Repo). Layer nur `types`/`utils`/`data-access`/`state`/`ui`/`feature` (+ `testing`), HTTP nur in `data-access`, keine Ports (`port`/`feat-port`), keine Cross-Slice- und Geschwister-Feat-Imports, Auth in `shared/state`. Abschnitte mit Messwerten aus früheren Branches (Dateizählung, Cache-Experimente, Adapter-Tauschbeweis) sind als solche markiert.

Branch `feat/nx-blueprint-explicit-config` (abgezweigt von `feat/nx-blueprint` bei `8578b83`): das Regelwerk aus `architecture.md` (extern, sheriff-blue-print; Ausgangs-Blueprint, ohne `infra/`), aber **ohne Sheriff**. Die Grenzen erzwingen nur Nx-Libs, Tags und `@nx/enforce-module-boundaries` (Nx 23.1). Sheriff wird auch für Regeln *innerhalb* einer Lib nicht gebraucht (Begründung in [Entscheidung: Feat-Buckets als eigene Libs](architektur.md#entscheidung-feat-buckets-als-eigene-libs)).

## Zero-Config (`feat/nx-blueprint`) vs. explizite Config

Dieser Stand ist `feat/nx-blueprint` (extern) **ohne Crystal-Magie**: kein lokales Nx-Plugin inferiert Projekte oder Targets, jede Lib trägt ihre Config-Dateien wieder selbst. Regelwerk, Libs, Tags, Constraints, Testing/MSW und OpenAPI-Clients sind unverändert, dist ist byte-identisch (580 Dateien, Snapshot unverändert).

**Unterschiede zu `feat/nx-blueprint`:**

| | `feat/nx-blueprint` (extern, Zero-Config) | dieser Stand (explizit) |
|---|---|---|
| Projekte, Tags, Targets | Crystal-Plugins `@mo-transfer/tooling-workspace` + `@mo-transfer/tooling-openapi` in `nx.json` → `plugins` | `project.json` pro Lib (Name, Tags, `implicitDependencies`), Target-Bodies in `nx.json` → `targetDefaults`; keine `plugins` |
| Build | `@mo-transfer/tooling-ng-lib:build` erzeugt `ng-package.json`/`package.json`/tsconfig temporär | `@nx/angular:ng-packagr-lite` mit den Dateien der Lib |
| App gegen dist | `@mo-transfer/tooling-ng-lib:application` schreibt dist-Paths selbst | `@nx/angular:application` (`buildLibsFromSource: false`): Nx mappt den Alias über `name` der lib-`package.json` auf dist (Marker-Test grün) |
| Test | `@mo-transfer/tooling-ng-lib:test` mappt Build-Target + verengt spec-tsconfig | `@mo-transfer/tooling-ng-lib:test` reicht nur noch an `@nx/angular:unit-test` durch; bleibt wegen `--ui` (watch + headed + Hasher „nie aus dem Cache“) |
| typecheck | `typecheck-lib.mjs` verengt `libs/tsconfig.json` im Speicher | `tsc -p {projectRoot}/tsconfig.json` |
| `tsconfig.base.json` | ein Wildcard `@mo-transfer/*` | ein exakter Eintrag pro Lib (47) + Tooling (5); Deep-Import-Verbot daraus generiert |
| Scope-Liste | Plugin-Option in `nx.json`, Graph-Fehler bei Tippfehler | `lib-scopes.json`, `tooling-verify:verify` prüft Tags ↔ Pfad ↔ Liste |
| OpenAPI-Clients | Client-Projekte, Kanten und Testing-`generate` vom Plugin | `project.json` des Clients (Name, Tags) und der Teil-Libs (Kanten, `generate-api-testing`), vom Generator geschrieben; `generate-api-client`/`update-spec` des Clients inferiert `@mo-transfer/tooling-openapi/plugin` aus `openapi-clients.json` ([Bewertung](openapi-clients.md#inferierte-client-targets-plugin)) |
| Config-Wächter | jede Config-Datei in `libs/` ist rot | jede fehlende oder falsche ist rot |
| component/service | eigene Templates (Nx findet inferierte Projekte nicht) | dünne Vorbelegung für `@nx/angular:component` / `@schematics/angular:service` |
| Namensregeln | Lib-Ordner (Layer, Scope, kebab-case) per Plugin (`libPathError`) → Graph-Fehler; Datei-/Symbolnamen per ESLint | Lib-Ordner per `tooling-verify:verify` (Ordnerregel im Tag-Schema) + Generatoren; ESLint-Regeln identisch. Lint-Inputs (`eslint-rules/src/**`, `lib-conventions.ts`) in `nx.json` → `targetDefaults` statt im Plugin, siehe [Namensschema](namensschema.md) |

## Dateizählung

| | explizit vor dem Plugin (`2857237`) | `feat/nx-blueprint` (extern, Zero-Config) | dieser Stand |
|---|---|---|---|
| Config-Dateien in `libs/` außerhalb `src/` | 202 (35 Libs: 35 `project.json`, 35 `tsconfig.json`, 32 `package.json`, 32 `ng-package.json`, 32 `tsconfig.lib.json`, 32 `tsconfig.lib.prod.json`, 4 `tsconfig.spec.json`) | 0 (+ 3 gemeinsame `libs/tsconfig*.json`) | 267 (47 Libs + 3 Client-Projekte: 50 `project.json`, 47 `tsconfig.json`, 41 `package.json`, 41 `ng-package.json`, 41 `tsconfig.lib.json`, 41 `tsconfig.lib.prod.json`, 6 `tsconfig.spec.json`) |
| `paths` in `tsconfig.base.json` | 35 | 1 Wildcard + 5 Tooling | 47 + 5 Tooling |
| lokale Nx-Plugins / Executor-Wrapper | 0 / 0 | 2 / 3 (+ typecheck-Skript) | 0 / 1 (`test`, nur für `--ui`) |
| Tasks `run-many -t build lint test typecheck` | 111 | 157 + 6 Generate-Tasks | 157 + 6 Generate-Tasks (dieselben) |
| dist (32 Libs + 12 Client-Libs + App) | – | 580 Dateien | byte-identisch |

## Paket `packages/sheriff-blueprint`

> **Nicht übernommen.** Das Sheriff-Paket (`@berger-engineering/sheriff-blueprint`, Sheriff-Layout mit Ordnern statt Libs) lebt nur in `sheriff-blue-print` (extern). Hier gelten `@mo-transfer/tooling-workspace` / `@mo-transfer/tooling-openapi`, siehe [Tooling & Generatoren](tooling.md).

## Reduktion des Regelwerks

Übernommen aus `sheriff-blue-print`, Branch `feat/nx-reduced-blueprint` (dort abgezweigt von `feat/nx-blueprint-explicit-config` bei `f490c0f`; beide Branches extern, nicht in diesem Repo). Import-Präfix hier `@mo-transfer/`. Gleiches Setup wie im Vorgänger (eine Nx-Lib pro Slice × Layer, explizite Config pro Lib, buildable Libs, Testing/MSW, OpenAPI-Facade, Workspace-Generatoren, Verify), aber mit **reduziertem Regelwerk**:

| | `feat/nx-blueprint-explicit-config` (extern) | dieser Stand |
|---|---|---|
| Layer | types, utils, events, api, state, ui, feature | types, utils, data-access, state, ui, feature |
| Marker | `port`, `feat-port`, `entry`, `generated` | `entry`, `generated` |
| fremder Slice | nur über `port` (`<slice>/api`) | nie |
| Geschwister-Feat | nur über `feat-port` (`feat-x/api`) | nie, geteilt wird über Slice-Root-Libs |
| App-Shell | entry, port, shared | entry, shared |
| Events | eigene Lib `events`, ui darf sie werfen | Datei-Kind `.events.ts` in `state`, ui emittiert Werte |
| HTTP (`@angular/common/http`) | nur `api` (Port + HTTP) | nur `data-access` (kein Port, nur HTTP) |
| Stores | `state` | `state` |
| generierte `api`/`core` | `type:api` | `type:data-access` |
| Specs → fremdes Domain-testing | erlaubt | blockiert |
| Inversion (auth) | `AUTH_API`-Token in `auth/api`, `AuthStore` in `auth/state`, `provideAuth()` in `auth/shell` | `AuthStore` in `shared/state`, `providedIn: 'root'`, direkt injiziert |

## Umbau der Demo

Gegenüber `feat/nx-blueprint-explicit-config` (extern, sheriff-blue-print; Endstand, Schritt 1 = ohne Ports mit `data`, Schritt 2 = Split in `data-access` + `state`):

| vorher | jetzt | warum |
|---|---|---|
| `booking/api`, `booking/events` | HTTP in `booking/data-access`, Events + Store in `booking/state` | Layer entfallen, HTTP getrennt von Zustand |
| `checkin/api`, `checkin/events` | `checkin/data-access` (`CheckinApi`, `CheckinNotifications`), `checkin/state` (Store, Events, `internal/checkin.mapper.ts`) | dito |
| `shared/api` | `shared/data-access` (`ApiHttp`, `PetApi`) | dito |
| `auth` (api/state/shell, Token + `provideAuth()`) | `shared/state/auth.store.ts`, `shared/types/auth-user.ts` | ohne Port kann ein Slice Zustand nicht anbieten; was mehrere Slices brauchen, ist shared |
| `feat-check-booking/data`, `feat-checkin/data` | `feat-check-booking/state`, `feat-checkin/state` | Feat-Stores sind state |
| `feat-check-booking/api` (`describeCheck`) | `booking/utils` | Geschwister teilen über den Slice-Root |
| `feat-checkin/api` (`describeDesk`) | `checkin/utils` | dito |
| `CheckinDeskStore` → `BookingApi` (booking-Port) | `CheckinApi.loadArrivals()` (`/api/arrivals`), Modell `Arrival` in `checkin/types`, MSW `checkinScenarios.withArrivals`/`noArrivals` in `checkin/testing` (heute über den generierten checkin-client; früher `arrivalHandlers`/`arrivalScenarios`) | kein Cross-Slice-Import |
| `BookingCard`/`ArrivalList` emittieren Events | emittieren `string` bzw. `Arrival`, Container erzeugt `bookingConfirmed`/`guestArrived` | ui ↛ state |
| `App` injiziert `BookingApi` | entfernt | App nur entry + shared |

### Schritt 2: `data` → `data-access` + `state`

Erst die Konventionen (`KNOWN_LAYERS`, `CLIENT_PARTS`, `FILE_KINDS`), dann die Libs mit den eigenen Generatoren:

```sh
nx g @mo-transfer/tooling-workspace:move booking/data booking/state            # dito checkin, shared, feat-check-booking, feat-checkin
# HTTP-Dateien nach libs/<slice>/data-access/src (booking-api, booking-notifications, checkin-api, checkin-notifications,
# http-client, pet-api + Specs), dann Config + paths über den Layer-Generator:
nx g @mo-transfer/tooling-workspace:layer booking data-access                  # dito checkin, shared
nx sync                                                                      # lib-tags: client api/core type:data → type:data-access
```

`move` schreibt alle `@mo-transfer/<slice>/data`-Importe auf `…/state` um, `layer` legt nur fehlende Dateien an (`writeIfMissing`) und leitet die `peerDependencies` aus den schon verschobenen Quellen ab. Von Hand: `index.ts` der neuen Libs, Stores importieren `<Name>Api` aus `@mo-transfer/<slice>/data-access`, `peerDependencies` von `state` (nur noch `@angular/core`), `shared/state` ohne Specs → ohne `test`-Target/`tsconfig.spec.json` (verify meldet beides), Template-Datei `shared-api.ts` des Layer-Generators gelöscht. Danach `nx reset`: ohne Daemon hielt der Graph-Cache die alten Import-Auflösungen (`checkin-state` ohne Kante auf `checkin-data-access` → Build zog Quellen statt dist).

### Schritt 3: generierte DTOs statt eigener Modelle

| vorher | jetzt |
|---|---|
| `booking/types` (`Booking`, `BookingNotification`), `checkin/types` (`Arrival`, `CheckinDto`, `CheckinRecord`, `CheckinNotification`) | entfernt; alle Layer importieren `Booking`, `Arrival`, `Checkin`, `Notification` aus `<client>/types` |
| `toBooking`, `toBookingNotification`, `toCheckinDto`, `toArrival`, `toCheckinNotification` in den Wrappern | entfernt; Wrapper geben die DTOs unverändert zurück |
| `checkin/state/src/internal/checkin.mapper.ts` (`toCheckinRecord`) | entfernt; Beispiel für `internal/` ist jetzt `next-checkin-id.ts` |
| `CheckSummary`/`DeskSummary` in `utils` | in `types` (`check-summary.model.ts`, `desk-summary.model.ts`): frontend-eigene Typen |
| Datei-Kinds `dto` (types), `mapper` (state), ESLint-Ausnahme für `*.dto.ts` | entfernt |
| Domain-Generator: `<d>.model.ts` als Domänenmodell | Platzhalter, bis der Slice einen generierten Client hat |

## Tooling-Änderungen der Reduktion

| Teil | Änderung |
|---|---|
| `tooling-conventions` | `KNOWN_LAYERS` = types, utils, data-access, state, ui, shell, feature, testing; `FEAT_LAYERS` generisch (alles außer shell/testing, also auch feat-eigenes `data-access`); `deriveTags` ohne `port`/`feat-port`; Client-Teile `api`/`core` → `data-access`; Datei-Kinds `store` → state/ui/feature, `events`/`mapper` → state; `KIND_ONLY_LAYERS` = types, utils; Fixture `testing/blueprint-tree.ts` mit `booking/data-access` + `booking/state` + `shared/data-access` |
| `tooling-workspace` | Sync-Generator `lib-tags` (`nx sync` leitet die Tags jeder Lib aus dem Pfad neu ab, `sync:check` meldet Abweichungen); `domain`: Default `types,data-access,state,ui,shell` (+ testing), `data-access` = `<d>-api.ts` über `ApiHttp`, `state` = `<d>.store.ts` + Store-Spec; `feat`: `--state --ui` (kein `--api`/`--data`); `layer`: Liste aus den Konventionen; `service`: data-access/state/feature/shell; `store`: state/ui/feature; alle Schemas mit `additionalProperties: false` (`feat payment x --data` → `'data' is not found in schema`) |
| `tooling-openapi` | Tags kommen aus den Konventionen (`type:data-access`), Hinweis „in the … data-access layer“ |
| `tooling-eslint-rules` | Logik unverändert (liest die Konventionen), Specs auf neue Pfade + Fälle `.store.ts`/`.events.ts`/`.mapper.ts` in data-access → `kindLayer` |
| `tooling-verify` | 181 Fälle (neu u.a.: state → data-access erlaubt, data-access → state blockiert, ui → data-access/state blockiert, HTTP in state blockiert, HTTP in data-access erlaubt, generierte Client-api von state erlaubt/von ui blockiert, `.store.ts` in data-access), `expectedTags`/`LAYERS`/Client-Typ-Map mit data-access/state, Affected-Proben `booking-state`/`shared-data-access`/`booking-data-access`, nx-internals-Proben auf `booking-state`, dist-Snapshot neu (532 Dateien) |

## Verifikation der Reduktion

**In mo-transfer** (nach der Übernahme, Präfix `@mo-transfer/`): `nx run-many -t build lint test typecheck` grün (49 Projekte + 6 Generate-Tasks (`generate-api-client`/`generate-api-testing`), 146 Tasks, inkl. `tooling-openapi:test` mit Jar), `pnpm verify` 181/181 Fälle, 0 Probleme, `nx sync:check` grün, `pnpm verify:nx-internals --update-snapshot` 7/7 (dist-Snapshot 532 Dateien), `nx run client:build` grün; Generator-E2E `domain payment` → `feat payment checkout --state --ui` → run-many + verify grün → `remove payment --force` → `git status` wie vorher.

In `sheriff-blue-print` (Herkunft), Stand nach `data` → `data-access` + `state`:

- `nx run-many -t build lint test typecheck`: 49 Projekte + 6 Generate-Tasks (`generate-api-client`/`generate-api-testing`) grün (inkl. `tooling-openapi:test` mit Jar), 52 Projekte im Graph.
- `pnpm verify`: **181/181 Fälle** (49 generierte Clients, 20 Tooling, 17 Namensregeln), Config-Wächter 41 Libs, Tag-Schema 43 Libs, Test-Isolation, neue Lib, Tooling-Libs, 9 Affected-Proben, 3 Clients (94 generierte Dateien), client-Bundle (14 Dateien) ohne msw/vitest/faker — 0 Probleme.
- `pnpm verify:nx-internals --update-snapshot`: 7/7 grün (run-many `--skip-nx-cache`, dist-Snapshot neu: 532 Dateien, Marker „App baut gegen dist“, MSW-Probe auf `booking-state:test`, MSW-Worker, Vitest-UI-Hasher, verify).
- `nx sync:check` grün, `nx run client:build` grün.
- **Mutationsprobe:** `type:ui` darf `type:state` → 4 Fälle rot (`177/181`: ui → state, ui → state in checkin, Spec ui → state, neue Lib ui → state), danach zurückgesetzt.
- Davor (Schritt 1, ohne data-access): Scope- und Feat-Constraints um alle Slices/Feats erweitert (= Ports durch die Hintertür) → 22 Fälle rot (`133/155`).
- **App im Browser** (`nx run client:serve`, nach dem Split auf data-access + state erneut durchgeklickt): `/bookings` (Bestätigen → Status `confirmed`), `/bookings/manage` (`describeCheck` aus `booking/utils`), `/checkin` („Agent: Michael“ aus `shared/state`, Walk-in → „Checked in today (1)“), `/checkin/history` (`describeDesk` aus `checkin/utils`) laufen ohne Konsolenfehler. „Load arrivals“ scheitert, weil die Demo kein Backend hat (Dev-Server liefert `index.html` für `/api/arrivals`). Auf dem Vorgänger-Branch (extern) war das bei `/api/bookings` genauso.
- **Generator-E2E:** `domain payment`, `feat payment checkout --state --ui`, `layer payment utils`, `component` (ui), `service` (data-access), `store` (state; in data-access abgelehnt), `feat … --data` → `'data' is not found in schema`, `client things-client --domain=payment` (Tags `type:data-access`, Facade, Adapter openapi-tools) + Wrapper `PaymentThings` mit Spec gegen `thingsClientHandlers` in `payment/data-access` → `run-many` der 14 payment-Projekte, `verify` (181/181, 55 Libs Config, 57 Libs Tag-Schema, 4 Clients), `sync:check` grün; `remove payment --force` → `git status` wie vorher.

## Testing-Lib ohne Fake-Daten (2026-10-16, `feat/testing-mocks-ohne-faker`)

| Vorher | Nachher |
|---|---|
| Mocks-Engines `none` \| `schema-faker` (Repo) \| `orval` (deprecated) | `none` (Default) \| `examples` (Repo); `schema-faker`, `orval`, `model.ts` entfernt |
| `mocks.ts` + `mock-runtime.ts` (faker, pro Wert geseedet), `get<Op>ResponseMock`/`get<Op>MockHandler`, `configureFakeData`, `MOCK_REF_DATE` | `handlers.ts`: `<client>Handlers` auf `<client>Http`, Bodies beim Generieren aus Spec-`example`s (sonst feste Platzhalter), typgeprüft |
| `@faker-js/faker`, `orval` in root/tooling-openapi | entfernt; ESLint-Bann `@faker-js/*` bleibt |
| `FAKER_SEED` + `faker.seed` pro Test in `shared/testing` | entfernt; neu `aNotification()` in `shared/testing` |
| Specs mit generierten Factories | Spec-`example`s literal (`pet-api.spec.ts`), Fixtures `aCheckin(…)`/`aNotification(…)` |

Grund: generierte Fake-Daten nutzte keine Fixture; Handler bleiben, weil spec-synchron. Konzept: generierte Testing-Lib = Vertrag + Baseline, Testdaten = Fixtures der Slice-Testing-Lib.
