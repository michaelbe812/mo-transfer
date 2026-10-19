# Namensschema

Die Namen der Libs, Dateien und Symbole sind keine Kosmetik: Tags, Aliase, Projektnamen und die Routen-Registrierung hängen daran, die Generatoren erzeugen sie. Erzwungen wird jede Regelart dort, wo sie am billigsten und präzisesten prüfbar ist. Die ESLint-Regeln lesen Layer, Scope und Feat aus derselben Quelle wie die Generatoren (`parseLibPath` in `@mo-transfer/tooling-conventions`), keine doppelte Logik. Einziger Unterschied zu `feat/nx-blueprint`: die **Ordnerregel** prüft kein Plugin beim Graph-Aufbau, sondern `tooling-verify:verify` (siehe unten).

## Inventar (aus Code und Generatoren abgeleitet)

| Regelart | Schema | Beispiel | Mechanismus | Status |
|---|---|---|---|---|
| Lib-Ordner | `libs/<scope>/<layer>`, `libs/<scope>/feat-<feat>/<layer>`, `libs/[<d>/]generated/<client>/{types,api,core,testing}`; Layer aus `KNOWN_LAYERS`, Scope aus `lib-scopes.json`, alles kebab-case | `libs/booking/feat-check-booking/state` | Generatoren (`libPathError`, `assertKebabCase`) lehnen ab; von Hand angelegt (`project.json`) meldet `tooling-verify:verify` die Lib (Ordnerregel im Tag-Schema: Form, Layer, kebab-case für Scope/Feat/Client, unabhängig vom Konventions-Code abgeleitet wie die Tags). Neu: kebab-case auch für Feat- und Client-Ordner (`feat-CheckIn` rutschte vorher durch) | umgesetzt |
| Nx-Projektname | Pfad unter `libs/` mit `-` | `booking-feat-check-booking-state` | Generatoren schreiben ihn in `project.json` (`projectNameFor`), `verify` (Config-Wächter) prüft | besteht |
| Import-Alias | `@mo-transfer/<pfad>` | `@mo-transfer/booking/state` | exakter `paths`-Eintrag pro Lib + `package.json`-Name (`aliasFor`), von den Generatoren geschrieben, `verify` prüft | besteht |
| Public API | nur `src/index.ts`, `internal/` wird nicht exportiert | `checkin/state/src/internal/next-checkin-id.ts` | Deep-Import: `no-restricted-imports` (besteht). `internal/` in `index.ts`: `blueprint/no-internal-export` | umgesetzt |
| Ordner unter `src/` | kebab-case | `fixtures/`, `internal/` | `blueprint/lib-file-naming` | umgesetzt |
| Dateinamen je Layer | `<name>.ts` (Komponente, Service, HTTP-Wrapper) oder `<name>.<kind>.ts`; Kind nur im Layer: model → types (nur frontend-eigene Typen, keine DTO-Kopien), utils → utils, events/store → state, store → ui/feature, data-access ohne Kind (`<n>-api.ts`, Wrapper), routes/providers/shell → shell, fixture/handlers → testing (in `fixtures/`/`handlers/`); Slice-`types`/`utils` nur mit Kind; Specs wie die Datei + `.spec` | `booking.store.ts`, `booking-card.ts`, `layout.shell.ts` | `blueprint/lib-file-naming` (Tabelle `FILE_KINDS` in den Konventionen) | umgesetzt |
| Store | `<n>.store.ts` → `<N>Store`, `*Store` nur in `.store.ts` | `CheckinDeskStore` | `blueprint/layer-symbol-naming` | umgesetzt |
| HTTP-Klasse | `<n>-api.ts` → `<N>Api`, `*Api`-Klasse nur in `-api.ts` | `BookingApi` | `blueprint/layer-symbol-naming` | umgesetzt |
| Feat-Container | feature-Lib: `feat-<feat>.ts` → `Feat<Feat>` des Feats der Lib | `FeatCheckBooking` | `blueprint/layer-symbol-naming` | umgesetzt |
| Komponente | Klasse `<N>` (oder `<Prefix><N>`), Selektor `<prefix>-<n>`, Präfix `app` | `booking-card.ts` → `BookingCard`, `app-booking-card` | Präfix + Stil: `@angular-eslint/component-selector`/`directive-selector` (Libs + App). Klasse/Selektor ↔ Datei: `blueprint/layer-symbol-naming` | umgesetzt |
| Shell | `<scope>.routes.ts` → `<scope>Routes`, `<scope>.providers.ts` → `provide<X>()` | `bookingRoutes`, `provideBooking` | `blueprint/layer-symbol-naming` | umgesetzt |
| Testing | Fixture `a<X>()`/`an<X>()`, `<n>.handlers.ts` → `<n>Handlers`/`<n>Scenarios` | `aBooking`, `checkinHandlers` | `blueprint/layer-symbol-naming` | umgesetzt |
| Testing generierter Clients | `<client>Http`, `<client>Handlers` | `petClientHttp` | Generator (openapi), Code in `src/generated/**` ausgenommen | besteht |
| Schreibweise | Typen PascalCase, Funktionen/Variablen camelCase, Konstanten auch UPPER_CASE; DTO-Properties frei (`booking_id`) | `APP_ROUTES_FILE` | `@typescript-eslint/naming-convention` | umgesetzt |

Ausnahmen, bewusst: Shared-Buckets dürfen in `types`/`utils` Einzeldateien ohne Kind haben (`format-date.ts`, `entity-id.ts`: ein Helfer pro Datei). Komponenten dürfen den Selektor-Präfix im Klassennamen tragen (`AppButton` in `button.ts`), wenn der Name allein zu generisch ist. Daten-Services ohne `Store` bleiben erlaubt (`service`-Generator in `data-access`/`state`). Generierter Code (Client-Libs, `src/generated/**`) ist ausgenommen.

## Mechanismen: Bewertung

| Mechanismus | Präzision | IDE | Autofix | Laufzeit / Cache | Bewertung |
|---|---|---|---|---|---|
| Eigene ESLint-Regeln (`packages/tooling/eslint-rules`, `RuleCreator`, ohne Typinfo) | hoch: kennt Layer/Scope/Feat aus den Konventionen | ja | für Namen exportierter Symbole nicht sinnvoll (Importeure), Dateien kann ESLint nicht umbenennen; Vorschläge für Komponentenklasse/Selektor | +~45 ms pro Lint-Prozess, `nx lint`-Cache (Regelquellen sind Input) | **umgesetzt** für Datei- und Symbolnamen, Public API |
| `nx g @nx/eslint:workspace-rule` | gleich | ja | – | – | **verworfen**: fester Ordner `tools/eslint-rules`, `project.json` + Jest, Präfix `@nx/workspace-`. Die Lademechanik dahinter (`loadWorkspaceRules`, swc, kein Build) wird genutzt |
| `@angular-eslint` (`component-selector`, `directive-selector`) | Präfix + Stil | ja | nein | +~65 ms pro Lint-Prozess (Plugin-Import) | **umgesetzt**: Standard-Regeln, auch für `apps/`. `component-class-suffix` **verworfen** (Style Guide ohne Suffix) |
| `@typescript-eslint/naming-convention` | Schreibweise, kennt keine Layer | ja | nein | vernachlässigbar | **umgesetzt** als Grundnetz |
| `eslint-plugin-check-file` | Globs, kein Layer-Wissen | ja | nein | neue Abhängigkeit | **verworfen**: Layer-Liste müsste als Glob-Tabelle dupliziert werden |
| `ls-lint` | Datei-/Ordnernamen per Pfad-Glob, sehr schnell | nein (eigenes CLI) | nein | eigenes Target | **verworfen**: kein Editor-Feedback, dupliziert Layer-Liste, Ordner deckt `verify` ab |
| `eslint-plugin-boundaries` | Element-Typen per Pfad | ja | nein | – | **verworfen**: redundant zu Tags + `depConstraints` |
| `verify`: Ordnerregel im Tag-Schema | Lib-Ordner, Scope, Layer, kebab-case | nein | nein | gecacht, CI | **umgesetzt** statt Crystal-Plugin (gibt es hier nicht): Pfad jeder Lib (`project.json` mit `src/index.ts`) wird geprüft. Ein falscher Ordner bricht den Graphen nicht, `nx lint` läuft normal; rot wird erst `verify` |
| Sync-Generator (`nx sync`) | – | – | ja | – | **verworfen** für Namen: Umbenennen ist keine idempotente Reparatur. Bleibt für Routen |
| `verify` | Verdrahtung | nein | nein | gecacht | **umgesetzt**: 14 Fälle `naming: …` beweisen, dass die Regeln in der echten Config greifen (Loader, `files`/`ignores`, Präfix, Ausnahme generierter Code). Die Regellogik testen die RuleTester-Specs |
| Nx Conformance (`@nx/conformance`) | Workspace-weite Regeln gegen den Graph | nein | nein | eigenes Kommando | **verworfen**: Nx Powerpack/Enterprise (Lizenz), kein Editor-Feedback, Ordner/Tags deckt `verify` ab |
| Generatoren | erzeugen korrekte Namen | – | – | – | **Quelle**, validieren den Pfad vorab (`libPathError`, kebab-case: `feat booking CheckIn` → *Feat "CheckIn" must be kebab-case*). Beweis: `domain payment` + `feat payment checkout --state --ui` + `layer payment utils` + `component`/`store`/`service` → `run-many` der payment-Projekte und `verify` grün, danach `remove payment` → `git status` unverändert (siehe [Verifikation](verifikation.md)) |
| TypeScript (Template-Literal-Typen) | – | ja | – | – | **verworfen**: Dateinamen unerreichbar, Symbolnamen nur mit Typ-Gymnastik pro Datei |

## Laufzeit

`nx run-many -t lint --skip-nx-cache` (55 statt 54 Projekte, neu: `tooling-eslint-rules`; inkl. 6 Generate-Tasks), frischer Clone, je dreimal abwechselnd: vorher (`7e042d9`) 20,3–22,3 s, nachher 24,7–26,0 s (**+~4 s, ~18 %**; auf `feat/nx-blueprint` gemessen: +2,5 s). Gecachte Läufe: unverändert.

## Limitierungen

- Der Selektor-Präfix `app` steht in `eslint.config.mjs` (`selectorPrefix`), in `apps/client/project.json` und in den Generator-Templates. Ein Präfix pro Scope wäre per `files`-Block pro Scope möglich, hieße aber alle Selektoren und Templates umzubenennen; nicht umgesetzt.
- Dateien ohne Kind (`<name>.ts`) sind in den meisten Layern erlaubt, die Regel prüft dort nur kebab-case. Ob `booking-notifications.ts` wirklich ein HTTP-Wrapper ist, weiß sie nicht.
- `blueprint/layer-symbol-naming` sieht nur `export class|function|const` direkt am Symbol, nicht `export { X }` am Dateiende.
- **Ordnerregel nur in `verify`:** kein Editor-Feedback, kein Graph-Fehler; eine von Hand angelegte Lib `libs/booking/feat-CheckIn/feature` lintet und baut, bis `pnpm verify` (lokal oder CI) rot wird. Auf `feat/nx-blueprint` bricht das Plugin sofort jeden Nx-Befehl.
- **Konventionen sind wieder `lint`-Input:** die Namensregeln importieren `lib-conventions.ts` (`FILE_KINDS`, `parseLibPath`), deshalb steht die Datei neben `eslint-rules/src/**` in den `lint`-Inputs (`nx.json` → `targetDefaults`, `lint` und `@nx/eslint:lint`). Eine Änderung an den Konventionen betrifft per `affected` wieder jedes Projekt (nur `lint`; `build`/`test`/`typecheck` nicht).
- **Specs der Regeln:** aus dem Hash ausgenommen (`!…/*.spec.ts`, Cache-Treffer), aber `nx affected` ignoriert negierte Inputs: eine Spec-Änderung markiert trotzdem alle Projekte.
- Die Regeln laufen per `loadWorkspaceRules` (öffentlicher Export von `@nx/eslint-plugin`, intern swc). Ändert Nx das, meldet ESLint *Could not find "blueprint/…"* (laut, nicht still).
