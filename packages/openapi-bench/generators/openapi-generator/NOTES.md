# OpenAPI Generator `typescript-angular` (7.25.0)

Generierung: `node generate.mjs` → nutzt Root-`@openapitools/openapi-generator-cli` + Root-`openapitools.json`
(`--openapitools`, cwd = Repo-Root, damit der gecachte JAR in `node_modules/.cache/openapi-generator-cli` greift).
Optionen in `openapi-generator.config.json`.

## Konfiguration (Begründung)

- `ngVersion=22.0.0`, `providedIn=root`, `fileNaming=kebab-case`, `supportsES6=true` – modernes Angular.
- `useSingleRequestParameter=true` – ein `XxxRequestParams`-Interface pro Operation (benannte, typisierte Parameter).
- `stringEnums=false` – `const PetStatus = {...} as const` + Union-Typ. `true` erzeugt TS-`enum` → Literale
  (`'sold'`) wären nicht zuweisbar.
- `enumPropertyNaming=original` – `x-enum-varnames` bleiben `LOW/MEDIUM/HIGH`.
- `taggedUnions=true` – Literal-Discriminator (`eventType: 'created'`). `legacyDiscriminatorBehavior=false`
  getestet und verworfen: erzeugt zusätzlich `export type CreatedEvent = ;`.
- `modelPropertyNaming=original` – Pflicht für korrektes Wire-Format.
- `nullSafeAdditionalProps=false` – exakte Index-Signaturen; `disallowAdditionalPropertiesIfNotPresent` Default,
  da `false` jedem Modell eine `any`-Index-Signatur gäbe.

## tsconfig.spec.json – Abweichung vom Prototyp

`include` enthält **nicht** `client/**`: `client/model/shape.ts` ist ungültiges TS (TS1110), der Angular-Build bricht
sonst ab. Runtime-Tests importieren gezielt einzelne Service-Dateien, nie `index.ts`/`api.ts`/`polymorphism.service.ts`.
Ebenso importieren die Typ-Tests `shape.ts` nicht: ein Syntaxfehler im Programm lässt tsc **alle semantischen Fehler
unterdrücken** → alle Typ-Tests wären fälschlich grün (verifiziert: 66/66 grün mit Import).
`bundle/all-ops.ts` (→ `index.ts`) kompiliert daher ebenfalls nicht.

## Stärken

- Wire-Format nahezu fehlerfrei: alle Query-Styles inkl. deepObject, pipe/space, form-object, `0`/`false`,
  Pfad-Encoding (`a%2Fb%20c%3F%23`), urlencoded (HttpParams), Multipart mit JSON-Part als `Blob(application/json)`,
  Text/Blob/Vendor-JSON-Responses, Accept-Auswahl (`httpHeaderAccept`).
- Auth komplett über `Configuration.credentials`/`username`/`password`, pro Operation, `security: []` respektiert.
- Angular: `provideApi()`, `providedIn: 'root'`, Overloads für `observe: 'body' | 'response' | 'events'`,
  `reportProgress`, `HttpContext`, `transferCache`, cold Observables, zoneless ok.
- Keine Runtime-Deps, Original-Property-Namen (`'x-request-id'`, `'@type'`), Kollisionen umbenannt (`ModelDate`, `ModelObject`).

## Schwächen

- Keine Signal-/`httpResource`-API, kein typisierter Fehlerkanal (`HttpErrorResponse.error: any`).
- readOnly/writeOnly ignoriert (ein `Pet` für Request + Response; `id` Pflicht im Request).
- Response ohne Body → `Observable<any>`; Multi-2xx → nur erster Typ; `reportByAccept(…pdf)` bleibt `Observable<Report>`
  (Runtime liefert korrekt Blob → Typ-Lüge).
- `additionalProperties: true` → `any`; `uniqueItems` → `Set<string>` ohne Konvertierung (Runtime liefert Array).

## Bemerkenswerte Bugs

1. **oneOf + Discriminator erzeugt ungültigen Code** (alle Kombinationen von `taggedUnions`/`legacyDiscriminatorBehavior`):
   ```ts
   // client/model/shape.ts
   export type Shape = ;
   ```
2. **oneOf ohne Discriminator wird verschmolzen** – alle Felder aller Varianten Pflicht, keine Variante allein zuweisbar:
   ```ts
   export interface PaymentRequestMethod { cardNumber: string; cvc: string; iban: string; }
   export interface PaymentRequestNote { }          // anyOf [string, integer] → {} (akzeptiert auch boolean)
   ```
3. **Cookie-Parameter**: `session?: string` steht im Request-Interface, wird aber nie gesendet (stilles Verwerfen).
4. **3.1: Webhook überschreibt Pfad-Service** (`WARN Duplicate file path … default.service.ts`) – im
   `client-31/api/default.service.ts` existiert nur `onItemChanged`; `getItem31`, `putItem31`, `listEvents31`,
   `upload31` fehlen. Außerdem `kind: any | null` (const), `coords: Array<any>` (prefixItems),
   `Event31` = verschmolzenes Interface mit `type: any | null`.
5. **`constructor?: string`** in `WeirdNames`: Objekt-Literale ohne explizites `constructor` sind nicht zuweisbar
   (`Type 'Function' is not assignable to type 'string'`) – geerbtes `Object#constructor` kollidiert.
6. `tagsSpace`: Leerzeichen-Delimiter wird unencodiert in die URL geschrieben (`tagsSpace=1 2`); funktioniert nur, weil
   der Browser beim Senden normalisiert.

## Audit (Fairness, s. results/AUDIT.md)

- T-ERROR-MODEL unsupported → fail: expect wertet „nur HttpErrorResponse.error: any“ ausdrücklich als fail.
