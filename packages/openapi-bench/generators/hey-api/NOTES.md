# Hey API (`@hey-api/openapi-ts` 0.99.0) – Befunde

Generiert mit der bench-lokalen 0.99.0 (`packages/openapi-bench/node_modules/.bin/openapi-ts`, Repo-Root hat 0.83.1).
Config: `openapi-ts.config.ts` (2 Jobs: 3.0 → `client/`, 3.1 → `client-31/`), Aufruf über `generate.mjs`.

## Konfiguration & Begründung

| Plugin | Einstellung | Warum |
|---|---|---|
| `@hey-api/client-angular` | Default (`throwOnError: false`) | Empfohlener Angular-Client; Ergebnis = typisierte Union `{data, error: undefined, response}` \| `{data: undefined, error: <OpError>}` → max. Typsicherheit inkl. Fehler-Body |
| `@hey-api/typescript` | `enums: 'javascript'` | const-Objekt + Literal-Union (`Priority.LOW`, `PetStatus.SOLD`), kein TS-`enum` |
| `@hey-api/sdk` | `operations: 'flat'`, `auth: true` | tree-shakeable Funktionen (`asClass` ist deprecated und nicht tree-shakeable) |
| `@angular/common` | `httpRequests: true`, `httpResources: true` | `getPetRequest()` → `HttpRequest`, `getPetResource()` → `httpResource` |
| `@hey-api/transformers` | **aus** | siehe Bug 1 – Date-Typ wäre gelogen |
| zod/valibot | aus | optional (`sdk.validator`), nicht Teil des Angular-Basis-Setups; würde Runtime-Dep einführen |

Setup in App: `provideHttpClient()`, `provideHeyApiClient(client)` (Import aus `client/client/client.gen` –
Doku nennt fälschlich `./client/client.gen`), `client.setConfig({ baseUrl, auth })`.

## Stärken

- Modell-Typen sehr präzise: `PetWritable`/`Pet` getrennt (readOnly fehlt im Request, writeOnly fehlt in der Response),
  `additionalProperties: false` ohne Index-Signatur, `unknown` statt `any`, Literal-Unions, `[number, number]` aus `prefixItems`,
  `const`, Webhook-Payload-Typen, Schema-Namen-Sanitizing (`UserProfile`, `getKebabSnakeOp`).
- Fehler-Typen pro Operation (`GetPetError = Problem`, `CreatePetError = ValidationProblem`) und in der Result-Union.
- Query-Serialisierung nach OpenAPI-Style (form/explode, pipe, space, deepObject, form-Objekt) korrekt; multipart
  (JSON-Part als String), urlencoded, octet-stream, text/plain-Body korrekt.
- Generierter Code kompiliert unter Angular-CLI-strict fehlerfrei, null externe Runtime-Deps (Client wird gebündelt).
- httpResource je GET-Operation funktioniert out of the box.

## Schwächen

- SDK ist Promise-basiert (eager, kein Abbruch, kein Observable); keine typisierte Option für `HttpContext`,
  `reportProgress`, `responseType`, `observe` – Options erben von fetch-`RequestInit`, nicht von Angular-Optionen.
- Base-URL nur global (`client.setConfig`), kein DI-Token; `provideHeyApiClient()` nimmt keine Config.
- HttpRequest-Factories/Resources (`@angular/common`) ignorieren `security` (kein Auth), `requestOptions()` wirft sogar bei `security`.
- Content-Negotiation: nur JSON-Variante typisiert, kein Accept-Header, PDF nicht wählbar.
- Max-strict: 11 Fehler je Client (`exactOptionalPropertyTypes`, `allowReserved: boolean | undefined`).

## Bugs (mit Code)

**1. Schema `Date` überschattet globales `Date`** (nur mit `@hey-api/transformers`, daher deaktiviert):
```ts
// types.gen.ts (mit transformers dates: true)
export type DateHolder = { date: Date; dateTime: Date; … };   // ← referenziert das Schema unten!
export type Date = { value?: string; };
// transformers.gen.ts
data.dateTime = new Date(data.dateTime);                       // Laufzeit: globales Date
```
Typ `{ value?: string }`, Laufzeit `Date` → Typ lügt. Zusätzlich: `format: date` wird ebenfalls zu `Date` (Zeitzonen-Falle).

**2. Auth im Angular-Client wirkungslos** (R-AUTH-* alle rot): Token wird gesetzt, nachdem der `HttpRequest` gebaut ist.
```ts
// client/client/client.gen.ts
const { opts, req, url } = requestOptions(options);   // HttpRequest hier schon fertig (URL + Headers)
if (opts.security) { await setAuthParams(opts); }      // ändert nur opts.headers / opts.query → verpufft
```

**3. Kein `responseType`**: Angular-Client setzt nie `responseType` → `downloadFile`/`postText` laufen als `'json'`
(Blob-Response unmöglich, Text-Response → JSON-Parse-Fehler). `getParseAs()` existiert in `utils.gen.ts`, wird aber nie benutzt.

**4. Number-Header korrumpiert `HttpHeaders`**:
```ts
// mergeHeaders(): value = 3 (X-Retry-Count: number)
mergedHeaders = mergedHeaders.set(key, typeof value === 'object' ? JSON.stringify(value) : (value as string));
```
→ beim ersten Lesen (`headers.getAll`, im echten Backend `headers.forEach`): `TypeError: Spread syntax requires ...iterable`.

**5. `response` falsch typisiert**: `RequestResult` liefert `response: HttpResponse<TData>` mit `TData = GetPetResponses`
(= `{ 200: Pet }`) statt `HttpResponse<Pet>`.

**6. Kleinere**: Cookie-Parameter (`session`) werden stillschweigend verworfen; 3.1 `enum: [low, high, null]` → `'low' | 'high'`
(null fehlt); Discriminator-Literal nur in der `Shape`-Union (`{kind:'circle'} & Circle`), `Circle['kind']` bleibt `string`;
`listEvents` liefert `BaseEvent[]` (nicht narrowbar, aber `CreatedEvent.eventType = 'created'`).

**Hinweis (Spec-/TS-Eigenheit)**: `WeirdNames.constructor?: string` macht Objekt-Literale ohne explizites `constructor`
unzuweisbar (geerbtes `Object#constructor: Function`). Im Runtime-Test daher `constructor: 'c'` mitgesendet.

## Test-Hinweise

- Runtime: `testing/hey-api-test-setup.ts` setzt das Modul-Singleton `client` pro Test zurück (httpClient/auth),
  `provideHeyApiClient(client)` + `client.setConfig({ baseUrl })`. SDK-Calls feuern erst nach Microtasks → `nextRequest()` wartet.
- A-OBSERVE-RESPONSE: Laufzeit ok, Typ-Fakt compile-zeit-verifiziert (`Equals<…> = false`) → Test rot.
- A-HTTPCONTEXT/A-REPORT-PROGRESS: skip (keine SDK-API; Workaround nur über `getPetRequest(...).clone({…})` + eigenes `HttpClient`).
- `tsconfig.spec.json` musste nicht gelockert werden.
