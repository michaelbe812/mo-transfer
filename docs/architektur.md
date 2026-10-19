# Architektur

Reduzierter Nx-Blueprint: Vertical Slices, eine Nx-Lib pro Slice × Layer, Grenzen nur über Nx-Tags und `@nx/enforce-module-boundaries`. Import-Präfix `@mo-transfer/`. Regeln im Detail: [Modulgrenzen](modulgrenzen.md), Herkunft: [Historie](historie.md).

## Motivation

- **Feingranulare Libs:** Build, Test und Lint laufen nur für betroffene Libs (Cache, `nx affected`); mit Remote-Cache (Nx Cloud) noch schneller.
- **Klarer Blast-Radius:** der Projekt-Graph zeigt vorab, was eine Änderung trifft — für Menschen und Agents (weniger Kontext nötig).
- **Strikte, automatisch erzwungene Regeln:** Lint und `verify` statt Konvention.
- **Vorhersagbar und skalierbar:** jeder Slice hat dieselbe Form, die App ist nur Shell.

## Grundprinzipien

- **weniger Typen, kein Port:** `types` · `utils` · `data-access` · `state` · `ui` · `feature` (+ `testing`). `api` und `events` als Layer gibt es nicht mehr: HTTP liegt in `data-access` (einziger Layer mit `@angular/common/http`), Stores und Events in `state`.
- **keine Ports:** keine Marker `port`/`feat-port`, kein `InjectionToken`-Contract, kein `provideX()`-Wiring zwischen Contract und Impl.
- **Slices sind geschlossen:** ein Slice importiert nie einen anderen Slice, ein Feat nie ein Geschwister-Feat. Gemeinsames liegt in `shared` bzw. in den Slice-Root-Libs. Die App komponiert Slices nur über ihre Shell (`entry`).

- **Generierte DTOs sind das Modell:** Backend-Daten fließen als generierte DTOs (`<client>/types`) unverändert durch alle Layer bis in die ui. Keine eigenen Domänenmodelle, keine DTO-Kopien, keine Mapper.

**Slice (Vertical):** Wir setzen eine Vertical-Slice-Architektur ein. Ein Slice ist immer eine in sich geschlossene Einheit, ein in sich geschlossenes Feature. Das kann eine Fachdomäne sein (booking, checkin), muss aber nicht: auch eine abgeschlossene Funktionalität oder das Layout (`layout`) ist ein Slice. Der Generator heißt aus historischen Gründen `domain`, legt aber jeden Slice an.

## Lib-Struktur: eine Lib pro Slice × Layer

```
apps/client/src/            type:app            dünne Shell: main.ts, app.ts, app.config.ts, app.routes.ts
libs/
  <slice>/                  Vertical: in sich geschlossenes Feature — booking, checkin (fachlich) · layout (nur von der App komponiert)
    types/ utils/ data-access/ state/ ui/   scope:<slice> type:<layer> feat:none   (data-access = HTTP, state = Stores + Events)
    shell/                                  type:feature + entry   routes/providers/shell = Slice-Root
    feat-<feat>/
      feature/                              scope:<slice> type:feature feat:<feat>
      state/ ui/ …                          feat:<feat>   (kein feat-port; feat-eigenes data-access erlaubt)
  shared/types|utils|data-access|state|ui   scope:shared type:<layer> feat:none   (data-access: ApiHttp, PetApi; state: AuthStore)
  <domain>/testing, shared/testing          scope:<d>|shared type:testing feat:none   nur für Specs, siehe testing.md
  generated/<client>/types|api|core|testing           scope:shared      ┐ generierte OpenAPI-Clients, Marker `generated`,
  <domain>/generated/<client>/types|api|core|testing  scope:<domain>    ┘ api/core = type:data-access, nur index.ts committet, siehe openapi-clients.md
```

- Jede Lib = Ordner + `src/index.ts` als **einzige** öffentliche API, daneben ihre Config-Dateien (`project.json`, `tsconfig*.json`, bei buildable Libs `package.json` + `ng-package.json`, siehe [Explizite Config pro Lib](lib-konfiguration.md#explizite-config-pro-lib)). `tooling-verify:verify` meldet jede fehlende oder falsche Datei.
- Neue Domains, Libs und Feats legen die Generatoren an (siehe [Tooling & Generatoren](tooling.md)).
- Alias: `@mo-transfer/<pfad-unter-libs>`, z.B. `@mo-transfer/booking/data-access` oder `@mo-transfer/checkin/feat-checkin/state`. Ein exakter Eintrag pro Lib in `tsconfig.base.json` (`@mo-transfer/booking/state` → `./libs/booking/state/src/index.ts`), kein Wildcard.
- Projektname = Pfad mit `-` (`booking-feat-check-booking-state`, `booking-data-access`), steht in `project.json`.
- `booking.routes.ts`/`checkin.routes.ts` exportieren jetzt benannt (`bookingRoutes`), weil `export *` keinen Default re-exportiert.
- Ein lib-privater Ordner `internal/` (z.B. `checkin/state/src/internal/next-checkin-id.ts`) ist bloße Konvention. Privat ist die Datei, weil `index.ts` sie nicht exportiert.

**Kosten:** 26 Libs (booking 10, checkin 9, layout 2, shared 5; vor der Reduktion 32, mit `data` statt `data-access` + `state` 23) statt 2, dazu 3 Testing-Libs und 12 Libs der 3 Beispiel-Clients (je types/api/core/testing, nur `index.ts` committet). Pro Lib 2–7 Config-Dateien, Zählung siehe [Dateizählung](historie.md#dateizählung).

## Layer

- `types` = Typen des Slice, die kein Backend-Vertrag sind (`CheckSummary`, `DeskSummary`). Backend-Daten nie hier, sondern als generierte DTOs aus `<client>/types` (auch `type:types`, also von jedem Layer importierbar).
- `data-access` = HTTP-Zugriff: `<name>-api.ts` (Klasse `<Name>Api`), Wrapper um generierte Clients (`booking-notifications.ts`), `ApiHttp` (`shared/data-access/http-client.ts`). Gibt die generierten DTOs unverändert zurück und macht nur Fehler mit Status; Rückgabe Promise (`CheckinApi`, `BookingNotifications`) oder kaltes Observable (`BookingApi`, damit `BookingStore` per `rxResource` lädt, neu lädt und abbricht). Keine Stores, keine Events, kein Mapping.
- `state` = Signal Stores (`.store.ts`), Domain-Events (`.events.ts`). Lädt über `data-access`, hält die DTOs unverändert.
- `api`/`core` sind nur noch Ordnernamen der generierten Clients, kein Layer.

## Entscheidung: Feat-Buckets als eigene Libs

`feat-<x>/state` und `/ui` sind **eigene Libs**. Sie sind nicht bloß Ordner einer Feat-Lib, deren Innenleben Sheriff regeln müsste. Gründe:

- Die Layer-Matrix gilt im Feat genauso (feat-ui darf feat-state nicht importieren). Innerhalb einer Lib sieht Nx nichts; dafür bräuchte man Sheriff als zweite Regelsprache.
- Mit eigenen Libs gibt es keine Sheriff-Abhängigkeit und keinen Build-Zwang für das Config-Package. Eine Regelsprache genügt.
- Preis: +3 Libs im Beispiel (`feat-check-booking/state|ui`, `feat-checkin/state`). Pro Feat kostet jeder genutzte Bucket eine Lib.

Alternative, falls die Lib-Anzahl stört: eine Lib pro Feat, dazu Sheriff nur mit `modules` für die Buckets innerhalb von `libs/*/feat-*/src`. Verworfen, weil dann wieder zwei Regelwerke parallel gepflegt würden.

## Entscheidungen

- **`shared/state` darf Zustand halten** (z.B. `AuthStore`). Ohne Ports ist `shared` der einzige Ort für Zustand, den mehrere Slices brauchen. Kein eigener Marker.
- **Generierte DTOs sind das Modell, keine Mapper.** Stores, Feats, ui, utils und Test-Fixtures nutzen die DTOs der generierten Clients direkt (`Booking`, `Checkin`, `Arrival`, `Notification`), auch in snake_case, wenn das Backend so liefert (`checkin.guest_name`). `<slice>/types` hält nur frontend-eigene Typen. Kein `.dto.ts`, kein `.mapper.ts`: `blueprint/lib-file-naming` meldet beide als unbekannte Kind. Preis siehe Trade-offs.
- **Feat-eigenes `data-access` erlaubt** (Konvention generisch: alle Layer außer shell/testing), der `feat`-Generator bietet nur `--state --ui`, die Demo braucht keins.
- **`app` darf `shared/data-access`** (über `scope:shared` + Produktions-Layer), Slice-`data-access` nicht.
- **`layout` bleibt eigener Slice**, nur von der App über `layout/shell` komponiert.

## Trade-offs

**Gewinn**
- Eine Typwelt: generierte DTOs vom Backend bis in die ui, kein Mapping-Code, keine DTO-Kopien.
- Ein Konzept weniger: keine Ports, keine Contract/Impl-Trennung, kein Wiring. HTTP liegt an genau einer Stelle (`data-access`), Zustand an einer anderen (`state`) — die Lint-Regel trennt sie, nicht eine Konvention.
- 6 Libs weniger in der Demo (26 statt 32 Blueprint-Libs ohne testing/generated), keine Token-Indirektion beim Debuggen.
- Klare, leicht erklärbare Regel: „nur eigener Slice + shared“.

**Preis**
- **Wiederverwendung zwischen Slices nur über `shared`.** Was zwei Slices brauchen, wandert nach `shared` (Auth). `shared` wächst und bekommt Zustand (`shared/state`).
- **Doppelter Backend-Zugriff:** checkin holt Ankünfte selbst (`/api/arrivals`), statt den booking-Port zu nutzen. Kein gemeinsames Modell, kein gemeinsamer Cache.
- **Keine Austauschbarkeit per DI-Token:** Tests ersetzen Implementierungen über MSW (HTTP) oder `TestBed`-Provider der Klasse, nicht über einen Contract.
- **ui ohne Events:** Dumme Komponenten geben nur Werte heraus, der Container baut das Event — etwas mehr Code im Container.
- **Generierter Client-Code ist `type:data-access`:** `client api → domain data-access` blockt nur der Zyklus, nicht die Layer-Regel (Verify-Fall dokumentiert das); `client api → domain state` blockt zusätzlich die Matrix.
- **Eine Lib mehr pro Slice** (`data-access` neben `state`): Store und HTTP-Wrapper liegen nicht mehr zusammen.
- **DTOs bis in die ui:** eine Spec-Änderung (Feld umbenannt, Enum erweitert) oder ein Adapterwechsel (`Booking.StatusEnum` bei openapi-tools vs. Literal-Union bei hey-api) schlägt in allen Layern durch, nicht nur im Wrapper. Gewollt: der Compiler zeigt jede betroffene Stelle, es gibt keine zweite Typwelt und keinen Mapping-Code. Backend-Namen (snake_case) stehen im Frontend-Code.
