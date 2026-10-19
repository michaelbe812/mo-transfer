# Verifikation

```sh
pnpm exec nx run-many -t build lint test typecheck   # 49 Projekte + 6 Generate-Tasks grün, inkl. tooling-openapi:test (Unit + Integration, Java)
pnpm verify                                           # nx run tooling-verify:verify: 181/181 Fälle (164 Boundary + 17 Namensregeln) + Config-Wächter + Tag-Schema/Ordnerregel/Scope-Liste + Test-Isolation + neue Lib + generierte Clients + affected + client-Bundle
pnpm exec nx sync:check                               # app.routes.ts ↔ Slice-Shells
pnpm verify:nx-internals                              # nach nx migrate, siehe unten
```

**In mo-transfer nach der Übernahme** (`NX_DAEMON=false`): `run-many -t build lint test typecheck` grün (49 Projekte + 6 Generate-Tasks (`generate-api-client`/`generate-api-testing`)), `pnpm verify` 181/181, 0 Probleme, `verify:nx-internals --update-snapshot` 7/7 (532 Dateien), `sync:check` und `client:build` grün, Generator-E2E (`domain payment`, `feat payment checkout --state --ui`, run-many + verify, `remove payment --force` → `git status` wie vorher), `client:serve` liefert `/` mit 200.

Beweise für den reduzierten Stand (tatsächlich ausgeführt, `NX_DAEMON=false`, in sheriff-blue-print, Branch `feat/nx-reduced-blueprint`):

- `run-many -t build lint test typecheck`: 49 Projekte + 6 Generate-Tasks (`generate-api-client`/`generate-api-testing`) grün.
- `pnpm verify`: 181/181, Config-Wächter 41 Libs, Tag-Schema 43 Libs (keine `port`/`feat-port`-Tags, keine `api`/`events`/`data`-Ordner), Test-Isolation, neue Lib, 6 Tooling-Libs, 9 Affected-Proben, 3 Clients (94 generierte Dateien, alle gitignored), client-Bundle (14 Dateien) ohne msw/vitest/faker — 0 Probleme.
- `pnpm verify:nx-internals --update-snapshot`: 7/7 grün. dist-Snapshot neu geschrieben (532 Dateien; 511 mit `data`, 580 vor der Reduktion), Marker „App baut gegen dist“, MSW „fehlender Handler → `booking-state:test` rot“, MSW-Worker aus dem msw-Paket, Vitest-UI-Hasher, `verify`.
- `nx sync:check` grün, `nx run client:build` grün.
- **Mutationsprobe Boundaries:** `type:ui` darf `type:state` → 4 Fälle rot (`177/181`), Exit 1, danach zurückgesetzt. Früher (mit `data`): Scope-/Feat-Constraints um alle Slices/Feats erweitert (= Ports durch die Hintertür) → 22 Fälle rot (`133/155`).
- **Generator-E2E:** `domain payment` (types, data-access, state, ui, shell, testing + Store-Spec in state), `feat payment checkout --state --ui`, `layer payment utils`, `component libs/payment/ui/src/payment-badge`, `service libs/payment/data-access/src/payment-cache`, `store libs/payment/state/src/payment-filter` (in data-access abgelehnt), `client things-client --domain=payment` (Facade, Tags `type:data-access`) + Wrapper `PaymentThings` (+ Spec gegen `thingsClientHandlers`) in `payment/data-access` → `run-many` der 14 payment-Projekte, `verify` (181/181, 55 Libs Config, 4 Clients), `sync:check` grün; `remove payment --force` → `git status` wie vorher.
- **App im Browser** (vor dem Split in data-access/state, nicht wiederholt; DI unverändert) (`nx run client:serve`, Chrome):
  - `/bookings`: Karten aus dem `BookingStore`, Karte aufklappen → „Confirm“ → Status `confirmed`, „Last confirmed booking: b1“ (ui gibt die ID heraus, der Container erzeugt `bookingConfirmed`, der Store verarbeitet es).
  - `/bookings/manage`: bestätigte Buchungen + „Booking b2 checked at …“ (`describeCheck` aus `booking/utils`).
  - `/checkin`: „Agent: Michael“ (`AuthStore` aus `shared/state`), „Walk-in guest“ → „Checked in today (1)“ (ui gibt `Arrival` heraus, der Container erzeugt `guestArrived`).
  - `/checkin/history`: „Desk clear — no open arrivals“ (`describeDesk` aus `checkin/utils`).
  - Keine Konsolenfehler beim Laden. „Load arrivals“ wirft `SyntaxError: Unexpected token '<'`: Die Demo hat kein Backend, der Dev-Server beantwortet `/api/arrivals` mit `index.html`. Das ist kein Regelproblem. Auf dem Vorgänger-Branch (extern) verhielt sich `/api/bookings` genauso.

`packages/tooling/verify/scripts/verify-boundaries.mjs` lintet für jeden Fall eine virtuelle Datei (`ESLint#lintText` mit `filePath` in der echten Lib) gegen die echte Config.

| Regel | erwartet | Ergebnis |
|---|---|---|
| layer: ui → state / data-access (booking, checkin), utils → state / data-access (shared, Domain) | blockiert | ✅ `type:ui` / `type:utils` (Domain-state: auch Zyklus) |
| layer: types → types (eigener Scope, shared) | erlaubt | ✅ |
| layer: types → utils, types → fremde Domain-types, shared types → Domain-types | blockiert | ✅ `type:types` / `scope:<s>` / `scope:shared` |
| layer: state → ui, state → shell, data-access → state (Domain: Zyklus, shared), data-access → ui | blockiert | ✅ `type:state` / `type:data-access` (shell/Domain-state: auch Zyklus) |
| layer: state → data-access (eigene + shared), data-access → shared data-access, ui/state/data-access → utils, Feat-state → Slice-state / Slice-data-access, feature → ui/state/data-access | erlaubt | ✅ |
| scope: fremde Domain state/data-access/types/utils/entry (auch aus einem Feat), layout → Domain, shared → Domain | blockiert | ✅ `scope:<s>` / `scope:shared` |
| scope: Domain → shared, feature → `shared/state` (Auth) | erlaubt | ✅ |
| feat: Geschwister state/feature/ui, fremdes Feat | blockiert | ✅ `feat:<f>` / `scope:<s>` |
| feat: eigene Interna, Geschwister teilen über Slice-Root (`checkin/utils`) | erlaubt | ✅ |
| app: Shell → ui / state / data-access, statischer Import einer lazy entry, Lib → App | blockiert | ✅ `type:app` / lazy-loaded / relative Import |
| app: Shell → entry, → `shared/state` | erlaubt | ✅ |
| encapsulation: relativ in fremde Lib / Deep-Alias | blockiert | ✅ Nx-Builtin / `no-restricted-imports` |
| nx: HTTP in ui / feature / utils / state / Feat-state, types → `@angular/core`, Zyklus state ↔ feat-state, Lib ohne Tags | blockiert | ✅ `bannedExternalImports` / Circular / `without tags` |
| nx: HTTP in data-access (Domain, shared) | erlaubt | ✅ |
| testing: Produktion → testing (Lib / Feature / App), msw/vitest in Produktion | blockiert | ✅ non-buildable bzw. `type:app`; nur Tags: `type:state`/`type:data-access`/`type:feature` |
| testing: Spec → eigenes testing / shared/testing, testing → types / shared/testing, msw in testing/Spec | erlaubt | ✅ |
| testing: Spec → fremdes Domain-testing / fremde Domain-state, shared-Spec → Domain-testing, types-Spec → testing, Spec ui → state | blockiert | ✅ `scope:<s>` / `scope:shared` / Circular / `type:ui` |
| testing: testing → state (Zyklus), → data-access, → ui, → fremdes testing | blockiert | ✅ Circular / `type:testing` / `scope:<s>` |
| neue Lib (`booking/feat-tmpverify/ui`, Dateien der Generatoren): ui → state / data-access, → fremdes Feat, Geschwister-Feat → neue Lib, fremder Slice → neue Lib, Deep-Alias | blockiert | ✅ `type:ui` / `feat:tmpverify` / `feat:check-booking` / `scope:checkin` / `no-restricted-imports` |
| neue Lib → shared | erlaubt | ✅ |

Generierte Clients und Tooling-Libs: siehe [OpenAPI-Clients → Verify](openapi-clients.md#verify) und [Tooling & Generatoren](tooling.md). Die Kommentare `// boundary-violation-example: …` in den Quellen markieren weitere Verstöße zum Einkommentieren (z.B. `checkin-desk.store.ts` → `booking/data-access`, `booking-card.ts` → `booking/state`, `booking/data-access`).

Negativproben Namensschema (je `nx lint <projekt>` rot, danach zurückgebaut):

| Verstoß | Projekt | Meldung |
|---|---|---|
| `booking.store.ts` in `booking/utils` | `booking-utils` | `blueprint/lib-file-naming`: belongs into a state/ui/feature lib |
| `export class Bookings` in `booking/state/src/bookings.store.ts` | `booking-state` | `blueprint/layer-symbol-naming`: must be named "BookingsStore" |
| Selektor `bk-booking-card` | `booking-ui` | `@angular-eslint/component-selector`: should start with … "app" |
| `export * from './internal/next-checkin-id'` in `index.ts` | `checkin-state` | `blueprint/no-internal-export`: internal/ is lib-private |
| Lib-Ordner `booking/feat-CheckIn/feature` (Kopie einer Feature-Lib, `project.json`, Tags und `paths` passend) | – | Graph und `nx lint` laufen; `tooling-verify:verify` rot: *folder "CheckIn" must be kebab-case*. Der Generator lehnt `feat booking CheckIn` ab. (`checkin/feat-CheckIn` geht auf macOS nicht: APFS ist case-insensitiv, `feat-checkin` existiert) |

## Nach `nx migrate`

`pnpm verify:nx-internals` vor dem Commit der Migration (und nach Angular-Updates): run-many mit `--skip-nx-cache` in frisches `dist/`, dist-Äquivalenz gegen `packages/tooling/verify/nx-internals/dist-hashes.json` (oder `--reference <kopie-von-dist-vorher>`), Marker-Test „App baut gegen dist“ (Remap über lib-`package.json`), MSW-Probe „fehlender Handler → Test rot“, MSW-Worker „von Vitest aus dem msw-Paket serviert“, Vitest UI „`test --ui` nie aus dem Cache“ (Nx lädt den Hasher), `tooling-verify:verify`. Ändert das Update den Output bewusst: Unterschiede prüfen, dann `--update-snapshot`.

## CI

*Nicht übernommen* — mo-transfer hat noch keine CI. Vorlage in sheriff-blue-print (extern): `.github/workflows/ci.yml` (Push, PRs): `pnpm install --frozen-lockfile`, Java 17 (Temurin) + Jar-Cache für openapi-tools, `playwright install --with-deps chromium`, `nx sync:check`, dann bei PRs `nx affected -t build lint test typecheck` (Basis per `nrwl/nx-set-shas`), bei Pushes `run-many`, zuletzt `nx run tooling-verify:verify`. Kein Tooling-Fallback: jede Tooling-Datei, die eine Lib-Task nutzt, ist `{workspaceRoot}`-Input dieser Task, `affected` folgt Inputs (ng-lib → alle Libs mit `test` + Abhängige, Facade → Clients + Abhängige). Generatoren betreffen nur noch die Tooling-Libs (auf `feat/nx-blueprint` waren die Plugins `lint`-Input aller Libs); `lib-conventions.ts` und `eslint-rules/src/**` sind `lint`-Input aller Projekte (Namensregeln). `verify` probt das (`nx show projects --affected --files=…`, 10 Proben, auch negativ: `ng-lib/src/test.js` betrifft `booking-types` nicht).

**OpenAPI-Clients in der CI:** `actions/setup-java@v4` (Temurin 17) und `actions/cache@v4` für `node_modules/.cache/openapi-generator-cli` (Key: Hash von `openapitools.json`), sonst unverändert. `generate-api-client`/`generate-api-testing` laufen über `^generate-api-client`/`^generate-api-testing` in `run-many`/`affected` mit. `update-spec` läuft nur manuell (`nx run <client>:update-spec`), das Ergebnis kommt per normalem PR.
