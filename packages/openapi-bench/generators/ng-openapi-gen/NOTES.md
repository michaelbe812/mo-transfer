# ng-openapi-gen 1.1.0 — Befunde

## Konfiguration (`ng-openapi-gen.json`)

- **functions + `Api.invoke(fn, params, context?)`** = 1.x-Default, tree-shakeable. Zusätzlich `services: true`: nur die
  Service-Methoden tragen JSDoc (summary, `@deprecated`) und `$Response`-Varianten; im one-op-Bundle ungenutzt → kostenlos.
  Tests nutzen durchgehend `Api.invoke` / `invoke$Response`.
- `promises: false` → kalte, abbrechbare Observables (Default wäre Promise via `firstValueFrom`).
- `enumStyle: alias` + `enumArray: true` → Union-Literale + Werte-Arrays (`PET_STATUS`), keine TS-enums.
- `ignoreUnusedModels: false` (sonst fehlt `UnreferencedModel`), `skipJsonSuffix: true`, `indexFile: true`, `module: false`.
- 3.1-Client mit derselben Datei, `--input/--output` per CLI überschrieben. `tsconfig.spec.json` unverändert strikt.

## Stärken

- Wire-Format sehr solide: alle Query-Styles (explode, csv, pipe, space, deepObject, form-Objekt), `0`/`false` werden gesendet,
  `undefined` weggelassen, Pfad-Encoding (`a%2Fb%20c%3F%23`), form-urlencoded, multipart mit JSON-Part als
  `Blob(type: application/json)`, text/plain, Blob-/Text-Responses mit korrektem `responseType`, Vendor-JSON.
- Angular: HttpClient, `providedIn: 'root'`, `provideApiConfiguration()`, HttpContext pro Aufruf, `invoke$Response` → `HttpResponse<T>`,
  Interceptors, zoneless, cold Observable mit Abbruch.
- Typen: required/optional/nullable, Enums geschlossen, Sonder-Property-Namen exakt, Schema-Kollisionen (`Date`, `Object`) sauber,
  inline-Schemas, Map/Record, Content-Negotiation (`reportByAccept` / `reportByAccept$Pdf`).
- 3.1: `const` → Literal, `type: [string, 'null']`, `prefixItems` → `[number, number]`, const-Discriminator narrowt.
- Keine Runtime-Deps, Angular-CLI-strict 0 Fehler (max-strict: `TS1484` fehlende `import type`, `TS2379` exactOptionalPropertyTypes).

## Schwächen

- **discriminator ignoriert** — `kind` bleibt `string`, kein Narrowing (T-ONEOF-DISC, -MAPPING, T-ALLOF-DISC-INHERITANCE):
  ```ts
  export type Circle = ShapeBase & { 'radius': number; };   // ShapeBase.kind: string
  export type Shape = (Circle | Rectangle | Triangle);
  ```
- **readOnly/writeOnly ignoriert** — ein `Pet` für Request und Response: `createPet` verlangt `id`, Response enthält `secretChipCode`.
- **Mehrere 2xx** → nur erster Typ: `multiStatus(): Observable<StrictHttpResponse<Pet>>` (202 `Job` fehlt).
- **Fehlermodelle** nicht typisiert (nur `HttpErrorResponse.error: any`); `additionalProperties: true` → `{ [key: string]: any }`.
- **Keine Security**: securitySchemes werden ignoriert, README empfiehlt eigenen Interceptor → R-AUTH-* unsupported.
- Cookie-Parameter verworfen; kein `reportProgress`/Events (fn filtert auf `HttpResponse`); keine `httpResource`-API.
- `x-enum-varnames` nicht unterstützt (nur `x-enumNames`, und nur bei `enumStyle ≠ alias`).
- 3.1: Webhooks ignoriert; `application/octet-stream: {}` → `body: any`.

## Bugs

- **Binary-Body ohne Content-Type** (R-BODY-OCTET): `RequestBuilder.body()` überschreibt den Spec-Media-Type mit `blob.type`;
  bei `new Blob([bytes])` ist das `''` → kein Content-Type-Header.
  ```ts
  body(value: any, contentType = 'application/json'): void {
    if (value instanceof Blob) {
      this._bodyContentType = value.type;      // 'application/octet-stream' aus der Spec geht verloren
  ```
- **Array-Header** (R-HEADER-PARAM): ein `headers.append` pro Element; Angulars Xhr-/Fetch-Backend joint mehrere Werte mit
  `','` → am Wire `X-Trace-Flags: a,b` = korrekt (Audit: vorher fälschlich fail, da nur `headers.get()` = `'a'` geprüft).
- `WeirdNames.constructor?: string` ist mit Objekt-Literalen praktisch nur nutzbar, wenn `constructor` explizit gesetzt wird
  (TS-Eigenheit, `Object.prototype.constructor: Function`); `WeirdNames` ist nicht an `HttpTestingController.flush` übergebbar.

## Ergebnis (lokal)

- types: 68 pass / 8 fail / 1 skip (T31: 10/10 pass)
- runtime+angular: 40 pass / 1 fail / 9 skip (nach Audit)
- static: 3/3 pass

## Audit (Fairness, s. results/AUDIT.md)

- R-HEADER-PARAM fail → pass (Wire-Sicht `getAll().join(',')` wie bei orval).
- T31-ONEOF-CONST-DISC: Assertion verschärft (exakter Typ von `startedAt`), Verdict unverändert pass.
