# Testing & MSW

Unit- und Komponententests laufen **nur im Vitest Browser Mode** (Chromium headless über Playwright), kein jsdom. HTTP mockt [MSW](https://mswjs.io/docs/recipes/vitest-browser-mode/) per Service Worker: Die echten Wrapper (`BookingApi`, `CheckinApi`, … über die generierten Clients, HttpClient) schicken den Request, MSW beantwortet ihn im Browser. Die generierten Default-Handler der Clients sind die Baseline, die Slice-Testing-Libs legen kuratierte Handler darüber (siehe [Schichten](#schichten-generierte-baseline--kuratierte-handler)).

## Struktur

```
libs/shared/testing/          scope:shared  type:testing  feat:none   kein build-Target
  src/network.ts                `worker` (setupWorker aus msw/browser) + `test` mit Auto-Fixture `worker`
  src/handlers.ts               `withBaseline(kuratiert, ...<client>Handlers)`, Typ `Scenarios`
  src/fixtures/                 Builder der shared Clients: aNotification()
libs/<domain>/testing/        scope:<domain> type:testing feat:none   kein build-Target
  src/fixtures/                 Builder: aBooking(), aCheckin(), anArrival()
  src/handlers/                 <domain>Handlers (kuratiert + generierte Baseline), <domain>Scenarios (empty, serverError, with…)
vitest-base.config.mts        runnerConfig: msw-Prebundle-Fix, Browser-Conditions (msw 3); Worker serviert Vitest selbst
```

- Domain-Testing-Libs importieren nur `msw` (nicht `msw/browser`), `type:types`, `shared/testing` und die Testing-Libs ihrer Clients (eigene + shared). Deshalb liegen `CheckinDto` und `Arrival` in `checkin/types`, nicht in `checkin/data-access`. Ein Spec nutzt nur das eigene und das shared testing, nie das eines fremden Slices.
- `test`-Target (`"test": {}` in `project.json`, Body in `targetDefaults`) hat jede Lib, deren `src/` eine `*.spec.ts` enthält (heute `booking-data-access`, `booking-state`, `checkin-data-access`, `checkin-state`, `checkin-feat-checkin-feature`, `shared-data-access`), dazu `tsconfig.spec.json`. Executor `@mo-transfer/tooling-ng-lib:test` (reicht an `@nx/angular:unit-test` durch, `--ui` für Vitest UI), `browsers: ["chromiumHeadless"]`, `runnerConfig: vitest-base.config.mts`, `tsConfig: {projectRoot}/tsconfig.spec.json`, `watch: false`. `verify` prüft: `test` genau bei Libs mit Specs.
- Einmalig: `pnpm exec playwright install chromium`.

## So sieht ein Test aus

Nah am [MSW-Rezept für Vitest Browser Mode](https://mswjs.io/docs/recipes/vitest-browser-mode/): Fixture `worker`, Default-Handler per `beforeEach`, Abweichungen im Test.

```ts
import { bookingHandlers, bookingScenarios } from '@mo-transfer/booking/testing';
import { test, worker } from '@mo-transfer/shared/testing';
import { beforeEach, describe, expect } from 'vitest';

describe('BookingStore', () => {
  beforeEach(() => worker.use(...bookingHandlers));          // Default-Handler der Spec

  test('lädt über die echte BookingApi', async () => {
    const store = TestBed.inject(BookingStore);
    await store.load();
    expect(store.all()).toEqual(defaultBookings);
  });

  test('Fehlerfall', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());             // nur für diesen Test
    await expect(TestBed.inject(BookingStore).load()).rejects.toThrow('500');
  });
});
```

- **Fixture `worker`** (`auto: true`): startet den Worker einmal (`onUnhandledFrame: 'error'`, msw 3; vorher `onUnhandledRequest`; Promise-Guard), `use(worker)`, danach `worker.resetHandlers()`. Kein `stop`, wie im Rezept. Abweichungen vom Rezept: `start` nur beim ersten Test (Rezept: `await worker.start()` pro Test; hier teilen sich alle Specs einer Lib die Seite, `isolate: false`) und `setupWorker()` ohne Happy-Path-Handler, die Defaults setzt jede Spec selbst.
- **Daten der Baseline:** `<client>Handlers` (Engine `examples`) sind beim Generieren berechnet, kein Zufall, kein faker: Spec-`example`s, sonst feste Platzhalter nach Typ/Format (Details: packages/tooling/openapi/README.md → Testing-Lib: Mocks-Engines). Ändern sich nur mit der Spec.
- **Asserten:** Spec-`example`s als Literale (z. B. `pet-api.spec.ts`: `[{ id: 10, name: 'doggie' }]`); testrelevante Werte per Fixture/Override setzen (`aCheckin({ id: 'c-7' })`, `aNotification(…)`). Testdaten = handgeschriebene Fixtures der Slice-Testing-Lib (`a<Dto>()`), die der shared Clients in `shared/testing`.
- **Default-Handler: explizit im Spec** per `beforeEach(() => worker.use(...))`, `worker` kommt dafür als Modul-Export. Kein globales Setup-File: Welche Handler gelten, steht in der Spec.
- **Reihenfolge** (Vitest 4 löst Fixtures auch für `beforeEach` auf, Auto-Fixtures immer): Fixture-Setup (Worker läuft) → `beforeEach` (Defaults) → Test (`worker.use` wird vorangestellt, neuester Handler gewinnt) → Fixture-Teardown (`resetHandlers` entfernt Defaults und Overrides). Belegt per Probe-Spec (nicht eingecheckt): `fetch` im ersten `beforeEach` wird schon von MSW beantwortet; im Folgetest nach einem Override gilt wieder nur der Default (`listHandlers().length === 1`); ohne `resetHandlers` wird dieser Test rot (3 statt 1 Handler).
- Ohne `beforeEach` gibt es keine Handler. Ein nicht gemockter Request wird von MSW geloggt und mit 500 beantwortet, der Test wird rot (`booking-api.spec.ts` in `booking/data-access` prüft genau das).
- Komponententest `feat-checkin.spec.ts`: rendert `FeatCheckin` per TestBed in Chromium, klickt über `page` aus `vitest/browser` und prüft das DOM (`expect.element`). Defaults `checkinHandlers`: die Ankünfte kommen aus der generierten Baseline (Media-`example` der checkin-client-Spec), Abweichungen per `checkinScenarios.withArrivals([anArrival(…)])` / `noArrivals()`.
- Mutationsproben: `beforeEach` mit den Default-Handlern in `booking.store.spec.ts` entfernt → `booking-state:test` rot (1 failed, `[MSW] Error: intercepted a request without a matching request handler`). Override gewinnt: die Tests mit `worker.use(...)` laufen trotz aktiver Defaults grün (`serverError` → 500, `withBookings` → nur `b-1`).

## Schichten: generierte Baseline + kuratierte Handler

Jede Operation jedes Clients hat einen generierten Default-Handler (`<client>Handlers`, nur mit `settings.testing.mocks: examples`, hier gesetzt). Darauf bauen die Slice-Testing-Libs:

```ts
// libs/booking/testing/src/handlers/booking.handlers.ts
const curatedBookingHandlers = [bookingClientHttp.get('/bookings', ({ response }) => response(200).json(defaultBookings))];
export const bookingHandlers = withBaseline(curatedBookingHandlers, bookingClientHandlers, notificationClientHandlers);
export const bookingScenarios = { withBookings, empty, serverError } satisfies Scenarios;
```

| Schicht | Quelle | gewinnt gegen |
|---|---|---|
| Szenario im Test (`worker.use(bookingScenarios.serverError())`) | Slice-Testing-Lib, typisiert über `<client>Http` | alles (vorangestellt) |
| kuratiert (`curated…Handlers`, Builder, typisiert mit den generierten DTOs) | Slice-Testing-Lib | Baseline (`withBaseline` setzt sie nach vorn, MSW nimmt den ersten Treffer) |
| Baseline (`<client>Handlers`) | generierte Client-Testing-Lib (eigene Clients + genutzte shared Clients) | – |

| Layer | Defaults im `beforeEach` | Abweichungen |
|---|---|---|
| data-access (Wrapper um den generierten Client) | `<client>Handlers` | typisierte Overrides `<client>Http.get(…)`, Fixtures (`a<Dto>()`, `aNotification()`) als Daten |
| state, feature | `<domain>Handlers` | `<domain>Scenarios` |

- **booking**: kuratiert `GET /bookings` (`defaultBookings`, b-100 *pending* ≠ Spec-`example` *confirmed* → `booking.store.spec.ts` belegt „kuratiert gewinnt“), Baseline booking-client + notification-client (`BookingNotifications` antwortet ohne eigenen Handler).
- **checkin**: kuratiert `GET /checkins` (`defaultCheckinDtos`, snake_case), Ankünfte aus der Baseline (Media-`example` mit zwei Gästen), Baseline checkin-client + notification-client; Szenarien `withCheckins`, `empty`, `serverError`, `withArrivals`, `noArrivals`.
- Mutationsprobe: Reihenfolge in `withBaseline` getauscht (Baseline vor kuratiert) → `booking-state:test` rot (`loads the curated bookings …`).
- booking-Features laden nichts übers Netz (`FeatCheckBooking` zeigt den Store-Startzustand) — deshalb keine Feature-Spec in booking; das Feature-Muster zeigt `feat-checkin.spec.ts`.
- **Entscheidung checkin-client:** checkin rief `/api/checkins` und `/api/arrivals` per `ApiHttp` (fetch) ohne Spec auf, die Testing-Lib nutzte rohes `http` aus msw (kein Typ-Schutz gegen Drift, keine Baseline). Neu: handgeschriebene Spec `libs/checkin/generated/checkin-client/openapi.yaml` (wie booking-client), angelegt mit `nx g @mo-transfer/tooling-openapi:client checkin-client --domain=checkin --spec=…`; `CheckinApi` ist ein dünner Wrapper wie `BookingApi` (Vertrag unverändert: Promise, `CheckinDto`/`Arrival` aus `checkin/types`, `Error` mit Status; erst `checkin-api.spec.ts` als Charakterisierung grün auf `ApiHttp`, dann umgestellt). Passt zum Blueprint (Domain-Client slice-privat), macht die Handler typisiert und liefert die Baseline. `ApiHttp` bleibt für die `domain`-Beispiele.

## Schutzschichten gegen Production-Leaks

| # | Schicht | Wo | Geprüft durch |
|---|---|---|---|
| 1 | depConstraints: Produktions-Layer kennen `type:testing` nicht, `type:feature`/`type:app` ohne Glob; `type:testing` → nur types, testing, shared | `eslint.config.mjs` | `nx lint`, verify-Fälle `testing: …` |
| 1b | Spec-Override (`*.spec.ts`, `*.test.ts`, `test-setup.ts`): dieselben Constraints + `type:testing`, auch fremde Domain. `scope:shared` und `type:types` bleiben unverändert | `eslint.config.mjs` → `specDepConstraints` | verify (`allowedInSpec`/`blockedInSpec`) |
| 2 | `bannedExternalImports` msw, vitest, @vitest, @testing-library, playwright, openapi-msw, @faker-js in Produktions-Layern + App | `eslint.config.mjs` | verify |
| 3 | Testing-Libs ohne `build`-Target und ohne Build-Dateien (`package.json`, `ng-package.json`, `tsconfig.lib*.json`). Import aus Produktionscode scheitert zusätzlich an `enforceBuildableLibDependency`, im Spec-Override ist die Regel aus | `project.json`, Config-Wächter, Spec-Override | verify (Test-Isolation aus dem Graph + Config-Wächter + Fälle) |
| 4 | Die Build-tsconfig (`build.options.tsConfig` = `{projectRoot}/tsconfig.lib.json`) schließt `src/**/*.spec.ts` aus, `build`-Inputs sind `production`, `production` schließt `**/*.spec.ts` und `tsconfig.spec.json` aus, `peerDependencies` nur aus Produktionscode | `tsconfig.lib.json` jeder Lib, `nx.json` | verify (Test-Isolation liest Targets aus dem Graph, Config-Wächter prüft peers) |
| 5 | Kein `mockServiceWorker.js` im Repo: `msw/vite` (`mode: 'worker-only'`) serviert ihn nur bei Testläufen aus dem msw-Paket. Kein App-Asset | `vitest-base.config.mts` | verify (keine committete Worker-Datei, keine testing/msw-Referenz in App-`project.json`) |
| 6 | `nx build client` + Scan des Bundles auf `msw`, `mockServiceWorker`, `setupWorker`, `vitest`, `faker` | `packages/tooling/verify/scripts/verify-boundaries.mjs` | verify: 14 Dateien, 0 Treffer |
| 7 | Keine Zyklen, keine `ignoredCircularDependencies` (siehe unten) | Schnitt der Libs | `nx lint`, verify |

## Zyklen

Nx zählt Spec-Imports als Projekt-Kante: `booking-state → booking-testing`. Damit das zyklenfrei bleibt:

- Testing-Libs importieren nur `type:types`, `type:testing` und `scope:shared`. `types` importiert nur andere `types`, eine types-Spec gegen testing wäre ein Zyklus und ist blockiert (verify-Fall).
- `shared/testing` importiert keine Blueprint-Lib. So dürfen auch Specs in `shared/*` es nutzen.
- Import einer Testing-Lib in eine Lib, die schon Specs gegen diese Testing-Lib hat → Nx meldet „Circular dependency“ vor der Tag-Regel (verify: `testing -> state`).
- `^build`: Testing-Libs haben kein `build`, Nx überspringt sie. `test` hat kein `dependsOn`. `run-many -t build` läuft ohne Task-Zyklus.

## Runner-Entscheidung: `@nx/angular:unit-test`

Gewünscht war `@angular/build:unit-test`. Direkt eingetragen scheitert er für die Libs, **Beleg** (damals `nx run booking-data:test`):

```
The 'buildTarget' is configured to use '@nx/angular:ng-packagr-lite', which is not supported.
The 'unit-test' builder is designed to work with '@angular/build:application' or '@angular/build:ng-packagr'.
Could not load build target options for "booking-data:build:development". … no schema with key or ref "https://json-schema.org/schema"
```

Mit `buildTarget: client:build:development` gleiche Warnung für `@nx/angular:application`, dazu koppelt es jede Lib an die App.

`@nx/angular:unit-test` (Nx 23.1) ist **kein anderer Runner**. Es ist ein dünner Wrapper, der `executeUnitTestBuilder` aus `@angular/build` aufruft. Vorher mappt er `@nx/angular:ng-packagr-lite` → `@angular/build:ng-packagr` im Builder-Context. Vitest, Browser-Provider, TestBed-Init und `runnerConfig` bleiben also Angulars Builder. Der Fallback `@nx/vitest` + `@analogjs/vitest-angular` war damit nicht nötig. Mit echter `ng-package.json` pro Lib braucht er keine Hilfe mehr; `@mo-transfer/tooling-ng-lib:test` davor reicht nur durch und ergänzt `--ui` (siehe [Executor-Wrapper](lib-konfiguration.md#executor-wrapper-packagestoolingng-lib)).

## Limitierungen

| Limitierung | Umgang |
|---|---|
| Angular pre-bundelt `msw` (`optimizeDeps.include`), Vitest Browser schließt es aus → esbuild: „The entry point "msw" cannot be marked as external“ | Plugin `blueprint:msw-not-prebundled` in `vitest-base.config.mts` entfernt die Überschneidung aus `include` |
| Der Builder mischt seine Resolve-Conditions (`browser`, …) in die Node-Defaults von Vitest, das Browser-Projekt löst also auch mit `node` auf. msw 3 mappt `msw/browser` unter `node` auf `null` → „No known conditions for "./browser" specifier in "msw" package“ | Plugin `blueprint:browser-conditions` in `vitest-base.config.mts` entfernt `node` aus den Client-Conditions, wenn `browser` gesetzt ist |
| `/mockServiceWorker.js` serviert das offizielle msw-Vite-Plugin (`msw/vite`, `mode: 'worker-only'`, ab msw 3.0.2) aus dem msw-Paket | kein `publicDir`, keine committete Kopie, kein `msw init`/`msw.workerDirectory`. Vorher übernahm das ein Vitest-Interna (`vitest:browser:resolve-virtual`), das Vitest 5 nicht mehr hat. Die Middleware des Plugins antwortet vor Vite (Header `service-worker-allowed: /`, Vitest sendet keinen). `worker-only`: kein `virtual:msw` (experimentelle Network-API, ohne `quiet`); der Worker bleibt in `libs/shared/testing/src/network.ts`. Für `nx serve client` nicht nutzbar: der Angular-Application-Builder nimmt keine Vite-Plugins. `pnpm verify:nx-internals` prüft Version, Checksumme und Header (Schritt „MSW worker“) |
| Spec-Imports sind Graph-Kanten: `nx graph`/`affected` zeigen `booking-state → booking-testing`, `^production` von `booking-state:build` enthält die Testing-Lib | Build-Output unberührt (tsconfig.lib, Bundle-Check). Cache-Invalidierung etwas breiter als nötig |
| Buildable Lib → Testing-Lib meldet zuerst `enforceBuildableLibDependency`, die Tag-Meldung erscheint erst danach | verify prüft die Tag-Constraints zusätzlich isoliert (`tags only`) |
| `type:types`-Libs können keine Testing-Libs in Specs nutzen (Zyklus) | reine Interfaces, nichts zu testen |
| `@angular/build` 22 verlangt `vitest ^4`, deshalb nicht Vitest 5 | beim nächsten Update prüfen |
| msw 3: `@vitest/mocker` (optionaler Peer) verlangt `msw ^2.4.9` | `package.json` → `pnpm.peerDependencyRules.allowedVersions.msw = "3"`; alle Browser-Tests grün |
| Angular-Default `isolate: false`: alle Spec-Dateien einer Lib teilen sich die Seite | Worker startet einmal (Promise-Guard), `resetHandlers` nach jedem Test |
| Parallele `test`-Tasks belegen je einen Vitest-Port | Vitest weicht automatisch aus („Port 63315 is in use, trying another one“) |

## Testing-Lib pro Client

`<client>/testing` (`type:testing`, gleicher Scope wie der Client) entsteht nur aus der Spec (Preset `testing`). Mocks-Engine (`settings.testing.mocks`, pro Client `pipeline.testing: { "mocks": … }`):

| Engine | Dateien | wofür |
|---|---|---|
| **`none`** (Library-Default) | `schema.ts`, `http.ts`, `index.ts` — kein `<client>Handlers` | Handler nur von Hand auf `<client>Http` |
| `examples` (Opt-in, **dieses Repo**: `settings.testing.mocks: "examples"`) | + `handlers.ts` | generierte Baseline der Slice-Testing-Libs |

Alle vier Clients laufen auf `examples`. Generierte Testing-Lib = Vertrag (`<client>Http`) + Baseline (`<client>Handlers`); Testdaten liegen nicht dort, sondern in den Fixtures der Slice-Testing-Lib.

| Datei in `src/generated/` | Werkzeug | Inhalt |
|---|---|---|
| `schema.ts` | openapi-typescript 7.13 | `paths`, `components`, `operations` |
| `http.ts` | openapi-msw 2.0 | `<client>Http = createOpenApiHttp<paths>({ baseUrl: servers[0].url })`, `<client>BaseUrl` |
| `handlers.ts` | Testing-Preset (`pipeline/examples`) | `<client>Handlers`: ein Handler je Operation auf `<client>Http`, Body beim Generieren berechnet (Spec-`example`s, sonst Platzhalter); typecheck prüft Bodies gegen die Spec; nicht bei `none` |

```ts
import { bookingClientHandlers, bookingClientHttp } from '@mo-transfer/booking/generated/booking-client/testing';

beforeEach(() => worker.use(...bookingClientHandlers));                        // generierte Defaults
worker.use(bookingClientHttp.get('/bookings', ({ response }) => response(200).json([aBooking()])));
worker.use(bookingClientHttp.get('/bookings', ({ response }) => response('default').json({ message: 'boom' }, { status: 500 })));
// Compile-Fehler: unbekannter Pfad, nicht dokumentierter Status, falscher Body
```

- **Deterministisch:** gleiche Spec → byte-gleiche `handlers.ts`, kein Seed nötig.
- **Specs pflegen:** `example` an jedem Property der eigenen Specs, dann liefern die generierten Handler lesbare Daten (`'Booking b-101 confirmed'` statt Platzhalter = Property-Name).
- **Grenzen:** Testing-Libs haben kein `build`. `openapi-msw` steht in den `bannedExternalImports` der Produktions-Layer; `@faker-js/*` bleibt dort verboten (Wächter, faker ist nicht mehr installiert), der Bundle-Scan von `tooling-verify:verify` sucht weiter nach `faker` (0 Treffer).
- `booking/testing` und `checkin/testing` bauen ihre Handler/Szenarien auf `<client>Http` (eine Spec-Änderung bricht die handgeschriebenen Handler beim Typecheck) und schichten sie per `withBaseline` über `<client>Handlers` (siehe [Schichten](#schichten-generierte-baseline--kuratierte-handler)).
- pnpm: `peerDependencyRules.allowedVersions` für `openapi-msw>msw` (3), `openapi-typescript>typescript` (6), `msw` (3, `@vitest/mocker`) und `@nx/devkit>nx` (23, von nx-plugin-openapi).

## Neue `<domain>/testing` anlegen

```sh
nx g @mo-transfer/tooling-workspace:testing <d>              # Gerüst für eine bestehende Domain (Default)
nx g @mo-transfer/tooling-workspace:testing <d> --examples   # mit Beispiel-Fixtures/-Handlern/-Szenarien
# `domain` legt das testing-Gerüst gleich mit an; `domain --examples` dazu Beispieldaten + Beispiel-Spec
```

1. **Default (Gerüst, keine Daten):** `src/handlers/<d>.handlers.ts` mit leerem `curated<D>Handlers: HttpHandler[]`, `<d>Handlers = withBaseline(curated<D>Handlers, <client>Handlers…)` und `<d>Scenarios = {} satisfies Scenarios`, `src/index.ts`, `project.json` (`<d>-testing`, `scope:<d>`, `type:testing`, `feat:none`, Targets `lint` + `typecheck`, **kein** `build`), `tsconfig.json`, `paths`-Eintrag `@mo-transfer/<d>/testing`. Hat die Domain eigene generierte Clients (`libs/<d>/generated/<client>`, Eintrag in `openapi-clients.json`), importiert das Gerüst deren `<client>Handlers` als Baseline — nur bei Mocks-Engine `examples`; bei `mocks: none` nennt der Kommentar nur `<client>Http`. Shared Clients nimmt die Slice selbst dazu. Keine Fixtures, keine Beispiel-Spec.
2. **`--examples`:** wie bisher `src/fixtures/<d>.fixture.ts` (Builder `a<D>()`) und `src/handlers/<d>.handlers.ts` (`<d>Handlers`, `<d>Scenarios`: `withItems`, `empty`, `serverError`, rohes `http` auf `/api/<d>` passend zur Beispiel-`<D>Api`). Die Beispiele deklarieren ihre eigene Form `<D>Example { id, name }` (= was die Beispiel-`<D>Api` lädt) statt die Platzhalter-Entity zu importieren: sie kompilieren für jede Entity in `<d>/types` (andere Felder, anderer id-Typ, keine Entity) — belegt in `fixture-workspace.spec.ts` (drei Formen); kuratierte Handler ersetzen sie durch Fixtures, typisiert mit den generierten DTOs. `domain --examples` schreibt zusätzlich `libs/<d>/state/src/<d>.store.spec.ts` + Spec-Config.
3. Importiert nur `msw`, `@mo-transfer/<d>/types`, Client-testing-Libs und `@mo-transfer/shared/testing`. Beleg: `packages/tooling/workspace/src/generators/testing/fixture-workspace.spec.ts` erzeugt Gerüst (ohne/mit Clients `examples` + `none`) und Beispiele in einen Fixture-Workspace auf der Platte, generiert die Client-Testing-Libs mit dem echten Preset und kompiliert alles strikt gegen das echte `shared/testing`.
4. Specs: `*.spec.ts` in `src/` einer Lib ablegen, dazu `tsconfig.spec.json` + `"test": {}` in `project.json` (sonst meldet `verify` beides). Vorlage: `domain --examples`, der auch die Spec-Config schreibt.
5. `tooling-verify:verify` prüft Tag-Schema, dass das Testing-Projekt kein `build` hat und `test` genau bei Libs mit Specs existiert.
