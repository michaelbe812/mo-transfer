# openapi-typescript 7.13.0 + openapi-fetch 0.17.0

Nicht-Angular-Referenz: reine Typ-Generierung (`client/schema.ts`, `client-31/schema.ts`) + generische fetch-Runtime
`createClient<paths>()`. Aufrufe pfadbasiert: `client.GET('/pets/{petId}', { params: { path: { petId } } })`.

## Ergebnis

| Dimension | pass | fail | skip |
| --- | --- | --- | --- |
| types (T + T31) | 75 | 2 | 0 |
| runtime (R) | 17 | 16 | 6 |
| angular (A) | 1 (ZONELESS) | 1 (OBSERVABLE-COLD) | 9 |
| static (S, nicht gemessen) | 3 | 0 | 0 |

## Konfiguration (generate.mjs, Node-API)

- **Node-API statt CLI**: nur dort gibt es `transform`. Damit `format: binary → Blob` (dokumentiertes Rezept „Blob types“).
  Ohne Transform wäre Binary überall `string`. **Kein** Date-Transform: Runtime parst nicht → wäre eine Typ-Lüge.
- `readWriteMarkers: true`: `$Read<…>`/`$Write<…>`; openapi-fetch wendet `Writable` auf Bodies und `Readable` auf Responses an.
- `enum + conditionalEnums`: echtes TS-Enum nur bei `x-enum-varnames` (`Priority.LOW`), sonst Literal-Unions (`'sold'` bleibt direkt zuweisbar).
- `rootTypes: true` mit Schema-Präfix (`SchemaPet`, `SchemaUserProfile`); ohne Präfix kollidieren `Date`/`Object`/`Priority`.
- `defaultNonNullable: false`: CLI-Default (`true`) machte `vaccinated` (default false) im Request zur Pflicht → falsch.
- `arrayLength: false`: Flag ist mit `prefixItems` kaputt (s. u.). `enumValues: false`: nur Laufzeit-Arrays, kein Typgewinn.

**Testregel**: idiomatischer Default-Aufruf ohne manuelle Wire-Konfiguration (`parseAs`, `bodySerializer`,
`querySerializer`, eigene Content-Type/Accept-Header). Gemessen wird, was Generator + Runtime aus der Spec ableiten.
Mit Handarbeit pro Aufruf (z. B. `parseAs: 'blob'`, eigener FormData-`bodySerializer`) ließen sich viele R-Fails beheben –
das ist dann aber Anwendungscode, nicht Generator-Leistung.

## Stärken

- Typen sehr präzise: Discriminator-Literale (`Circle.kind: 'circle'` statt `string`), `allOf`-Vererbung mit
  `Omit<BaseEvent, 'eventType'> & { eventType: 'created' }`, Fehler-Body pro Operation (`error: Problem` bzw. `ValidationProblem`).
- readOnly/writeOnly sauber getrennt über Readable/Writable (`id` im Request `?: never`, `secretChipCode` fehlt in Response).
- Namen exakt erhalten (`'x-request-id'`, `'1stPlace'`, `user-profile`, Query `page-size`/`filter.name`) → Wire korrekt.
- 3.1 vollständig: `const`, `type: [string, 'null']`, `prefixItems` → `[number, number]`, Webhooks (`webhooks['itemChanged']`).
- Strict- und Max-strict-Compile fehlerfrei. `any` nur in den generierten Readable/Writable-Hilfstypen (`$Write<any>`), nicht in Modellen.

## Schwächen

- **Runtime kennt die Spec nicht** (nur Typen werden generiert). Jeder Body → `JSON.stringify` + `Content-Type: application/json`:
  ```js
  // openapi-fetch defaultBodySerializer
  if (body instanceof FormData) return body;
  if (contentType === "application/x-www-form-urlencoded") return new URLSearchParams(body).toString();
  return JSON.stringify(body);
  ```
  → merge-patch, form-urlencoded, multipart (Blob wird zu `{}`), octet-stream, text/plain alle falsch, obwohl die Typen korrekt sind.
- Response immer `JSON.parse` (Default `parseAs: 'json'`) → text/plain und Binary werfen `SyntaxError`. Kein `Accept`-Header.
- Query-Stile nur global (`querySerializer`), nicht pro Parameter: `tagsCsv`, `tagsPipe`, `tagsSpace`, `point` (form-object) falsch.
- Header-Arrays werden per `Headers.append` gesetzt → fetch sendet `'a, b'`; laut RFC 9110 äquivalent zu `'a,b'` (Audit: R-HEADER-PARAM pass). `params.cookie` ist typisiert, wird aber ignoriert.
- Keine Angular-Integration (HttpClient, Interceptors, DI, HttpContext, httpResource), keine generierte Auth-Konfiguration,
  `@deprecated` nur am `paths`-Eintrag (erreicht den Aufruf `client.GET('/naming/deprecated')` nicht).

## Auffällige Befunde

1. **`Readable<T>` zerstört Blob**: Mapped Type über alle Keys, Methoden werden zu `{}` → Binary-Response-Typ ist kein `Blob`
   (T-RESP-BINARY, T-RESP-CONTENT-NEGOTIATION fail), selbst mit Blob-Transform:
   ```ts
   type Readable<T> = … T extends object ? { [K in keyof T as …]: Readable<T[K]> } : T;
   // Readable<Blob> = { size: number; type: string; text: {}; slice: {}; … }
   ```
2. **`--array-length` + `prefixItems`** erzeugt ein Tupel aus Tupeln (falsch); ohne Flag korrekt:
   ```ts
   coords: [[number, number], [number, number], ...[number, number][]];  // mit --array-length
   coords: [number, number];                                              // ohne
   ```
3. **Typ ≠ Runtime**: `uploadBinary` verlangt typseitig korrekt `Blob`, gesendet wird `"{}"` mit `application/json`.
   Typsicherheit ist hier trügerisch – Compile grün, Wire falsch.
4. **Content-Negotiation** nur client-weit über `createClient<paths, 'application/pdf'>()` (nur Typebene, kein Accept/parseAs).
5. `upload31` (octet-stream ohne Schema) → Body `unknown`: akzeptiert Blob, aber auch alles andere.
6. TS-Eigenheit (generatorunabhängig): Objekt ohne `constructor` ist nicht zuweisbar an `{ constructor?: string }`
   (`Object.prototype.constructor: Function` kollidiert) – im Test explizit gesetzt.

## Interpretationen

- T-NAME-OPERATION-ID-SANITIZE / T-NO-OPERATION-ID (Audit): unsupported – expect verlangt generierte Namen, es gibt
  paradigmenbedingt keine (Aufruf = Methode + Pfad, `operations['get-kebab_snake.op']` nur als Typ-Key).
- A-OBSERVE-RESPONSE skip: `{ data, error, response: Response }` liefert Status/Header, aber kein `HttpResponse<Pet>`.
- R-COOKIE-PARAM als fail (nicht skip): API bietet `params.cookie` an, Runtime verwirft es kommentarlos.

## Audit (Fairness, s. results/AUDIT.md)

- T-NAME-OPERATION-ID-SANITIZE, T-NO-OPERATION-ID, S-DEPRECATED-OP pass → unsupported (keine generierten Methoden/Funktionen).
- A-ZONELESS pass → unsupported (trivial, keine Angular-Integration; wie übrige A-*).
- R-HEADER-PARAM fail → pass (`a, b` ≡ `a,b`, OWS normalisiert).
- Ergebnis-Tabelle oben ist damit veraltet: types 73/2/2, runtime 18/15/6, angular 0/1/10, static 2/0/1.
