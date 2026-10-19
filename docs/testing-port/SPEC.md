# Spec: Frontend-Testing mit MSW, openapi-msw und schema-faker

Diese Spec ist ein Auftrag an einen Coding-Agenten in einem **anderen** Repo. Er soll das Testing-Konzept aus `mo-transfer` dort 1:1 umsetzen.
Der Ordner `reference/` enthält den Originalcode. Er ist die Wahrheit: Bei Widerspruch zwischen Spec und Code gilt der Code.

---

## 0. Auftrag (Prompt)

> Setze im aktuellen Repo das in `SPEC.md` beschriebene Testing-Konzept um. Lies zuerst die komplette Spec und alle Dateien in `reference/`.
> Analysiere dann das Zielrepo (Abschnitt 2) und lege mir das Mapping plus die offenen Fragen vor, **bevor** du Code schreibst.
> Danach setzt du die Schritte aus Abschnitt 9 in der angegebenen Reihenfolge um. Jeder Schritt endet grün (typecheck, lint, test).
> `reference/generator/mock-runtime.ts` übernimmst du **unverändert**, bis auf den Datei-Header. `reference/generator/mock-runtime.spec.ts` muss unverändert grün laufen: Das beweist, dass die Fake-Daten identisch sind.
> Fertig bist du, wenn alle Akzeptanzkriterien aus Abschnitt 10 erfüllt und belegt sind.

---

## 1. Ziel und Prinzip

- **Netzwerk statt Service-Mocks:** Tests rufen den echten Code auf (Store → API-Wrapper → generierter Client → `fetch`/`HttpClient`). Erst **MSW** (Service Worker im Browser) beantwortet den Request. Es gibt kein `vi.mock` und keine gemockten Services.
- **Vitest Browser Mode** (Chromium headless über Playwright), kein jsdom.
- **Die OpenAPI-Spec ist der Vertrag.** Pro Spec entsteht eine Testing-Lib mit:
  - `<client>Http` (openapi-msw): Handler sind gegen die Spec typisiert. Ändert sich die Spec, schlägt der **Compiler** fehl.
  - `<client>Handlers`: eine **Baseline** mit einem Handler pro Operation. Die Daten kommen aus den Spec-`example`s, Faker füllt den Rest.
  - Faker-Daten sind **deterministisch pro Wert**: Ein Wert ändert sich nur, wenn sich sein eigenes Schema oder sein Pfad ändert.
- **Drei Schichten von Handlern** (bei MSW gewinnt der erste Treffer):
  1. Szenario im Test: `worker.use(x)` wird vorangestellt und gewinnt immer.
  2. Kuratierte Slice-Handler: handgeschriebene Fixtures, typisiert mit den generierten DTOs.
  3. Generierte Baseline.
- **Kein Leck in die Produktion:** msw, faker, openapi-msw und vitest landen nie im App-Bundle.

Nicht-Ziele: E2E-Mocking (Playwright gegen die App), Mock-Server für `ng serve`, Query- und Pfadparameter-abhängige Fake-Daten.

---

## 2. Zielrepo analysieren (vor dem ersten Code)

Ermittle die folgenden Punkte und lege das Ergebnis als Tabelle vor:

| Frage | Auswirkung |
|---|---|
| Monorepo-Tool (Nx, Turborepo, keins)? Lib-Struktur? | Ort von `shared/testing`, Slice-Testing-Libs und generierten Testing-Libs; Generator als Nx-Target oder als npm-Script |
| Framework (Angular, React, …)? Test-Runner heute? | Angular: `@angular/build:unit-test` mit `runnerConfig`. Sonst: eigene `vitest.config` mit `test.browser` |
| Wo liegen die OpenAPI-Specs? Wie werden die Clients generiert? Ist `servers[0].url` gesetzt? | Eingaben des Generators; `baseUrl` von `<client>Http` muss zur URL passen, die der Client aufruft |
| Sind die Specs gebündelt (keine externen `$ref`s)? | Bei externen `$ref`s bricht schema-faker ab. Dann vorher bündeln (`redocly bundle`) |
| Package-Manager, TS-Version, ESLint (Flat Config)? Module-Boundaries? | Abschnitte 7 und 8 |
| Vorhandene Mocks (HttpTestingController, `vi.mock`, Fixtures)? | Migrationsumfang (nicht automatisch migrieren, nur auflisten) |

---

## 3. Abhängigkeiten (Versionen wie im Original)

```
devDependencies:
  msw                    ^3.0.2      (msw/vite, msw/browser; Option onUnhandledFrame)
  openapi-msw            2.0.0
  openapi-typescript     7.13.0      (nur Generator)
  yaml                   ^2          (nur Generator)
  @faker-js/faker        10.6.0      EXAKT pinnen (kein ^); ein Upgrade ändert Fake-Werte
  vitest                 ~4.1.11
  @vitest/browser-playwright ~4.1.11
  playwright             ^1.63
```

- Falls `@vitest/mocker` den Peer `msw ^2` verlangt: `pnpm.peerDependencyRules.allowedVersions.msw = "3"` (bzw. das Pendant des Package-Managers).
- Einmalig: `playwright install chromium`.
- **Kein** `mockServiceWorker.js` im Repo und kein `msw init`. Den Worker liefert `msw/vite` aus (siehe Abschnitt 5).

---

## 4. Generator: Testing-Lib pro OpenAPI-Spec

Referenz: `reference/generator/testing-preset.ts` (nur den Zweig `schema-faker` portieren, `orval`/`none` weglassen) und `reference/generator/schema-faker-mocks.ts`.

### 4.1 Aufruf

Wenn das Zielrepo Nx nutzt, wird der Generator ein Target `generate-api-testing` pro Testing-Lib. Das `test`-Target bekommt `dependsOn: ["^generate-api-testing"]` (bzw. auf den Client-Generator), und der generierte Code wird als Input/Output gecacht.
Ohne Nx wird es ein Script `tools/api-testing/generate.mts` mit npm-Script `generate:api-testing`, das vor `test`/`typecheck` läuft.

Konfiguration: Liste der Clients mit `name` (kebab-case, z. B. `booking-client`), `spec` (Pfad) und `outDir` (Testing-Lib). Format frei wählen, bevorzugt eine vorhandene Client-Config des Repos erweitern.

### 4.2 Ausgabe: `<testing-lib>/src/generated/` (gitignored, nie committen)

Committet wird nur `<testing-lib>/src/index.ts` mit dem Inhalt `export * from './generated';`. `name` ist der camelCase-Name des Clients (`booking-client` → `bookingClient`).

| Datei | Inhalt (exakt wie `reference/generated-example/`) |
|---|---|
| `schema.ts` | `astToString(await openapiTS(pathToFileURL(specFile)))`, also `paths`/`components`/`operations` |
| `http.ts` | `export const <name>BaseUrl = "<servers[0].url>";` und `export const <name>Http = createOpenApiHttp<paths>({ baseUrl: <name>BaseUrl });` |
| `mock-runtime.ts` | **Kopie** von `reference/generator/mock-runtime.ts`, unverändert, mit Header. Kopiert statt importiert, damit Libs kein Tooling importieren und nichts Node-artiges ins Browser-Bundle gerät |
| `mocks.ts` | Erzeugt von `generateSchemaFakerMocks`: die erreichbaren Komponenten-Schemas als Daten (ohne Doku-Keys), pro Operation `get<Op>ResponseMock(override?)` und `get<Op>MockHandler(override?, options?)` |
| `model.ts` | `export type <Schema> = components['schemas']['<Schema>'];` |
| `handlers.ts` | `export const <name>Handlers: HttpHandler[] = [ get<Op>MockHandler(), … ];` |
| `index.ts` | Re-Exporte: Typen aus `schema`, `export type *` aus `model`, alles aus `mocks`, `http` und `handlers` |

Header jeder Datei:
```
/* eslint-disable */
// Generated by <tool> from <spec-pfad>. Do not edit, do not commit.
```

### 4.3 Regeln von schema-faker (Generator, Build-Zeit)

- **Operation-Name:** `operationId` in PascalCase, sonst Methode + Pfad (`get /pet/{petId}` → `GetPetPetId`).
- **Erfolgs-Response:** `200`; sonst der niedrigste `2xx`; sonst `2XX`/`default` (wird als 200 gesendet).
- **Media:** JSON (`application/json`, `+json`, `*/*`) zuerst, sonst `text/*`, sonst kein Body (`'empty'`).
- **Statische Pfade vor Template-Pfaden** (`/pets/findByStatus` vor `/pets/{id}`), weil bei MSW der erste Treffer gewinnt. MSW-Pfad: `*<path>` mit `{x}` → `:x`.
- **Media-`example`** (bzw. das erste `examples`-Element) gewinnt über das Schema und wird als `example` ans Schema gehängt.
- Objekt-Response: `get<Op>ResponseMock(overrides: Partial<T> = {})` merged die Overrides flach. Sonst ohne Parameter.
- Nur lokale `$ref`s. Eine Spec ohne Operationen ist ein Fehler.

### 4.4 Regeln der Laufzeit (`mock-runtime.ts`, Test-Zeit)

Nicht neu implementieren, sondern kopieren. Zum Verständnis:
- Priorität pro Wert: Schema-/Property-`example` → `const`/`enum` → Faker nach `type`/`format`/Grenzen.
- Jede Zufallsentscheidung (Blattwert, optionale Property ja/nein, Array-Länge, oneOf/anyOf-Variante, additionalProperties-Key) seedet eine **private** Faker-Instanz (`locale [en, base]`, Mersenne53) neu. Der Seed ist der cyrb53-Hash aus Operation, Instanzpfad (`/[2]/tags/[0]`), Zweck und Fingerprint der wertrelevanten Keywords des Knotens.
- Datumswerte sind relativ zu `MOCK_REF_DATE = 2026-01-01T00:00:00.000Z` (UTC). Umstellen mit `configureFakeData({ refDate })`. Der globale `faker` spielt keine Rolle.
- `mockHandler(method, path, status, kind, data, override?, options?)`: `override` ist ein Wert oder ein Resolver `(info) => T`.
- Grenzen: rekursive Schemas bis Tiefe 6; Arrays 1–10; Strings 10–20 Zeichen; nie `null`; kein `not`/`if`/`patternProperties`/`prefixItems`.

Tests des Generators: `reference/generator/schema-faker-mocks.spec.ts` und `mock-runtime.spec.ts` übernehmen (Node-Projekt, `msw/node`). Die Runtime-Spec pinnt konkrete Werte. Laufen sie grün, sind die Daten identisch zum Original.

---

## 5. Test-Infrastruktur: `shared/testing`

Referenz: `reference/shared-testing/network.ts`, `handlers.ts`, `reference/vitest-base.config.mts`.

### 5.1 `network.ts`
- `export const worker = setupWorker();` aus `msw/browser`, **ohne** Initial-Handler.
- `worker.start({ onUnhandledFrame: 'error', quiet: true, serviceWorker: { url: '/mockServiceWorker.js' } })` läuft genau **einmal** (Promise-Guard), weil sich alle Specs einer Lib eine Seite teilen (`isolate: false`).
- `export const test = testBase.extend({ worker: [async ({}, use) => { faker.seed(FAKER_SEED); await startWorker(); await use(worker); worker.resetHandlers(); }, { auto: true }] })`
- `FAKER_SEED = 42` gilt nur für den globalen `faker` in handgeschriebenen Buildern.
- Kein `worker.stop()` und kein globales Setup-File mit Handlern.

### 5.2 `handlers.ts`
- `withBaseline(curated, ...baselines) => [...curated, ...baselines.flat()]`
- `type Scenarios = Record<string, (...args: never[]) => HttpHandler>`

### 5.3 Vitest-Konfiguration
- Plugin `msw({ mode: 'worker-only' })` aus `msw/vite`: Es serviert `/mockServiceWorker.js` aus dem installierten Paket, nur bei Testläufen.
- `test.globals: false`. Specs importieren `describe`/`expect`/`vi` explizit.
- Nur bei Angular-Builder (`@angular/build:unit-test`, Option `runnerConfig`) zusätzlich die beiden Fix-Plugins aus der Referenz:
  - `mswNotPrebundledPlugin`: entfernt `msw` aus `optimizeDeps.include`.
  - `browserConditionsPlugin`: entfernt `node` aus den Client-Resolve-Conditions, sonst wird `msw/browser` zu `null`.
- Browser: Chromium headless über `@vitest/browser-playwright`.

### 5.4 Ablauf pro Test (Vitest 4 löst Auto-Fixtures auch für `beforeEach` auf)
1. Fixture: Worker läuft.
2. `beforeEach`: Defaults setzen.
3. Test: `worker.use` wird vorangestellt und gewinnt.
4. Teardown: `resetHandlers()` entfernt alles.

Ein Request ohne Handler wird mit 500 beantwortet und als `[MSW] Error … without a matching request handler` geloggt. Der Test wird rot.

---

## 6. Pro Slice/Domain: `<slice>/testing`

Referenz: `reference/slice-testing/*`.

```
<slice>/testing/src/
  fixtures/<slice>.fixture.ts   Builder a<Entity>(overrides: Partial<Dto>): Dto  (generierter DTO-Typ, feste Default-Werte)
  handlers/<slice>.handlers.ts  default<Entities>, curated<Slice>Handlers, <slice>Handlers, <slice>Scenarios
  index.ts
```

- Kuratierte Handler sind **immer** über `<client>Http` typisiert, nie über rohes `http` aus msw.
- `<slice>Handlers = withBaseline(curated, <eigeneClient>Handlers, <genutzteSharedClient>Handlers)`.
- `<slice>Scenarios = { withX(list), empty(), serverError(), … } satisfies Scenarios`. Fehler laufen über den dokumentierten Status, z. B. `response('default').json({ message: 'boom' }, { status: 500 })`.
- Eine Testing-Lib importiert nur: msw (nicht `msw/browser`), Typen/DTOs, `shared/testing` und die generierten Testing-Libs.
- Eine Spec importiert nur ihr eigenes Slice-Testing und `shared/testing`, nie das Testing eines fremden Slices.
- Testing-Libs sind **nicht** buildbar (kein Build-Target, kein `package.json`/`ng-package.json`).

---

## 7. Spec-Konventionen

Referenz: `reference/specs/*`.

```ts
import { test, worker } from '<alias>/shared/testing';
import { bookingHandlers, bookingScenarios } from '<alias>/booking/testing';

describe('BookingStore', () => {
  beforeEach(() => worker.use(...bookingHandlers));     // Defaults explizit in der Spec

  test('…', async ({ worker }) => {
    worker.use(bookingScenarios.serverError());          // Abweichung nur für diesen Test
  });
});
```

| Layer | Defaults im `beforeEach` | Abweichungen |
|---|---|---|
| data-access (Wrapper um den generierten Client) | `<client>Handlers` | `<client>Http.get(…)`-Overrides, `get<Op>ResponseMock({...})` |
| state / feature / Komponente | `<slice>Handlers` | `<slice>Scenarios` |

- Komponenten werden echt gerendert und über `page.getByRole(...)` aus `vitest/browser` bedient, geprüft mit `expect.element(...)`.
- Worauf asserten, in dieser Präferenz:
  1. Spec-`example`s als Literale.
  2. Werte aus `get<Op>ResponseMock()` ableiten.
  3. Generierte Literale nur sparsam einsetzen.
- Testrelevante Werte (Status, Grenzfälle) nie dem Zufall überlassen, sondern per Override oder Szenario setzen.

---

## 8. Schutz vor Leaks in die Produktion

1. **ESLint** (Module-Boundaries oder `no-restricted-imports`): Produktionscode darf weder `type:testing`-Libs noch `msw`, `openapi-msw`, `@faker-js/*`, `vitest`, `@vitest/*` oder `playwright` importieren. Specs (`*.spec.ts`) dürfen das.
2. Die Build-tsconfig schließt `**/*.spec.ts` aus.
3. Testing-Libs haben kein Build-Target.
4. Kein `mockServiceWorker.js` im Repo und kein App-Asset.
5. Bundle-Scan nach dem App-Build: Die Strings `msw`, `mockServiceWorker`, `setupWorker`, `vitest`, `faker` dürfen nicht vorkommen (Script + CI-Schritt).
6. Keine Zyklen: Testing-Libs importieren nur types, testing und shared.

---

## 9. Umsetzungsreihenfolge

1. Abhängigkeiten installieren, Chromium installieren, `.gitignore` um `**/src/generated/` ergänzen (bzw. den Pfad der Testing-Libs).
2. Generator portieren. `mock-runtime.ts` unverändert übernehmen, Generator-Specs übernehmen. Grün.
3. Generator an einer Spec laufen lassen. Ausgabe gegen `reference/generated-example/` vergleichen (gleiche Struktur und Namen). Typecheck grün.
4. `shared/testing` (`network.ts`, `handlers.ts`) und die Vitest-Konfiguration anlegen.
5. Eine data-access-Spec nach dem Muster `reference/specs/booking-api.spec.ts`:
   - ohne Handler → 500
   - Baseline → Spec-Example
   - typisierter Override → Fehler
6. Ein Slice-Testing (Fixture, kuratierte Handler, Szenarien) plus eine Store-Spec nach `booking.store.spec.ts`.
7. Eine Komponenten-/Feature-Spec nach `feat-checkin.spec.ts`.
8. Schutzschichten aus Abschnitt 8 einbauen, inklusive Bundle-Scan.
9. Kurze Doku im Zielrepo schreiben, z. B. `docs/testing.md`: Abschnitte 1, 5–8 dieser Spec, angepasst an die Pfade dort.

---

## 10. Akzeptanzkriterien (jedes mit Beleg: Befehl + Ausgabe)

- [ ] `mock-runtime.spec.ts` und `schema-faker-mocks.spec.ts` laufen unverändert grün.
- [ ] Generierte Dateien sind gitignored. Ein frischer Clone erzeugt mit `generate` + `test` alles neu.
- [ ] Ein Pfad- oder Status-Tippfehler in `<client>Http.get('/bookingz', …)` bricht `typecheck`.
- [ ] Eine Spec ohne `beforeEach`-Handler: Der Request endet in 500 und `[MSW] Error`.
- [ ] Mutationsprobe 1: `beforeEach` mit Defaults entfernen → Store-Spec rot.
- [ ] Mutationsprobe 2: Reihenfolge in `withBaseline` tauschen → Test „kuratiert gewinnt“ rot.
- [ ] Mutationsprobe 3: `resetHandlers()` entfernen → Folgetest sieht fremde Handler, rot.
- [ ] Fake-Werte sind stabil über zwei Läufe, andere Testreihenfolge (`--sequence.shuffle`) und anderes `TZ`.
- [ ] Der App-Build enthält keinen der Strings aus Abschnitt 8.5.
- [ ] Ein Import von `msw` aus Produktionscode → Lint-Fehler.

---

## 11. Bekannte Grenzen

- Eine statische Antwort pro Operation, unabhängig von Query- und Pfadparametern. Filter und Paging laufen über Szenarien.
- Liste und Detail derselben Entität sind nicht konsistent, und Werte sind nicht eindeutig.
- Ein Faker-Upgrade ändert Werte. Deshalb ein eigener PR, `vitest -u` und den Diff reviewen.

---

## Referenz-Inhalt

| Datei | Zweck |
|---|---|
| `generator/mock-runtime.ts` (+ `.spec.ts`) | Laufzeit, 1:1 übernehmen |
| `generator/schema-faker-mocks.ts` (+ `.spec.ts`) | Generator für mocks/model/handlers/index. Pfad zur Runtime anpassen (`RUNTIME_FILE`) |
| `generator/testing-preset.ts` | Erzeugung von `schema.ts`/`http.ts` (nur Zweig schema-faker relevant, Nx-/Pipeline-Imports ersetzen) |
| `generated-example/` | Erwartete Ausgabe für `openapi.yaml` |
| `shared-testing/` | Worker, Fixture, `withBaseline`, `Scenarios` |
| `slice-testing/` | Fixture-Builder, kuratierte Handler, Szenarien |
| `specs/` | Muster-Specs: data-access, Store, Komponente, Assert auf `get<Op>ResponseMock` (`pet-api.spec.ts`) |
| `vitest-base.config.mts` | `msw/vite` worker-only + Angular-Fixes |
