# NSwag 14.7.1 – TypeScript-Template `Angular`

.NET-Tool (npm-Wrapper `nswag`, Runtime Net80). Eine Datei `client/api.ts`, ein `@Injectable`-Client pro Tag.

## Konfiguration (nswag.json)

| Option | Wert | Warum |
| --- | --- | --- |
| template / httpClass | Angular / HttpClient | Angular-native, Requests über HttpClient |
| rxJsVersion / typeScriptVersion | 7.0 / 5.0 | moderne Imports, `override` |
| injectionTokenType | InjectionToken | `API_BASE_URL`-Token statt OpaqueToken |
| useSingletonProvider | true | `providedIn: 'root'` → `inject(PetsClient)` ohne Providen |
| operationGenerationMode | MultipleClientsFromFirstTagAndOperationId | ein Client pro Tag |
| typeStyle | **Interface** | siehe unten |
| dateTimeType | **String** | konsistent: Interfaces konvertieren nicht, `Date` wäre Typ-Lüge |
| enumStyle | StringLiteral | Literal-Unions; `Enum` liefert auch keine LOW/MEDIUM/HIGH (nur `_1`) |
| nullValue | **Null** | nur damit wird `nullable: true` zu `\| null` (`Undefined` → `\| undefined`!) |
| markOptionalProperties / generateOptionalParameters | true / true | `?` für optionale Felder, optionale Parameter am Ende |
| includeHttpContext | true | `HttpContext` pro Aufruf |
| wrapResponses | false | true → alle Methoden liefern `SwaggerResponse<T>` (Status/Header), bricht `Observable<Pet>` |
| excludedOperationIds | `[reservedParamNames]` | **Notlösung**, sonst Syntaxfehler in der ganzen Datei (s. u.) |

**Interface vs. Class**: Class (`fromJS`/`toJSON`, mit `dateTimeType: Date` echte Date-Konvertierung) evaluiert und verworfen:
- `init()` setzt fehlende optionale Felder auf `null` (`this.weightKg = … : null as any`), Typ sagt `weightKg?: number` → Lüge.
- `toJSON()` schreibt jedes ungesetzte Feld als `null` → `createPet` sendet `"id": null, "createdAt": null, …`.
- Request-Bodies sind Klassen → Objekt-Literale passen nicht (fehlende `init`/`toJSON`), `new Pet({...})` nötig.
- Gleiche Polymorphie-/Anonymous2-Bugs. Interface + String ist ehrlicher und Angular-idiomatischer.

## Stärken
- Pfad-Encoding, Query-Primitives inkl. `0`/`false`, explode-Arrays, Header (`X-Trace-Flags: a,b`), JSON/merge-patch/urlencoded/text/octet-Bodies, Vendor-JSON, Multipart-JSON-Part korrekt.
- `providedIn: 'root'`, `API_BASE_URL`-Token, HttpContext, funktionale Interceptors, cold/abbrechbare Observables, zoneless ok.
- Fehler → `ApiException` mit geparstem Body (`result.title`), für alle Status inkl. `default`.
- Literal-Union-Enums, `readonly` für readOnly, Sonder-Property-Namen gequotet, `Date`-Schema → `DateDto`.

## Schwächen
- Jedes Modell ohne `additionalProperties: false` erhält `[key: string]: any` → Tippfehler-Keys kompilieren, Excess-Property-Checks weg.
- oneOf/anyOf schwach: `Shape`/`PaymentResult`/`Note` = `{ [key: string]: any }`, `method: CardPayment` (Sepa fehlt), keine Discriminator-Literale.
- Query-Styles ignoriert: csv/pipe/space → `tagsCsv=a&tagsCsv=b`; deepObject/form-object → `filter=[object Object]`.
- Kein Auth (securitySchemes ignoriert), kein observe/reportProgress, kein httpResource; `responseType` immer `'blob'` + eigener Parser.
- Binary-Response → `FileResponse { data: Blob, … }` statt `Blob`; Content-Negotiation nur JSON; 3.1 nicht nutzbar.
- readOnly/writeOnly: `createPet` verlangt `id`, Response enthält `secretChipCode`. `x-enum-varnames`, Property-`deprecated` ignoriert.

## Bugs (mit Auszug)

**1. Reservierte Parameternamen → Syntaxfehler, ganze Datei kaputt** (ohne `excludedOperationIds`):
```ts
reservedParamNames(class: string, default?: string | undefined, page_size?: number | undefined, …) // TS1390 + Folgefehler
```
Bei Syntaxfehlern bricht `tsc` die semantische Prüfung für das gesamte Programm ab – auch für andere Dateien im selben tsconfig.

**2. Circle verschwindet, undefinierter Typ** (`Shape` oneOf + discriminator.mapping):
```ts
listShapes(httpContext?: HttpContext): Observable<Anonymous2[]> {   // TS2552: Anonymous2 existiert nicht
export interface Shape { [key: string]: any; }                     // kein Circle-Interface im Output
```
Angular-Test-Build bricht ab → `tests/anonymous2-shim.d.ts` (`type Anonymous2 = unknown`, nur in tsconfig.spec.json).

**3. Optionale Multipart-Parts werfen:**
```ts
if (meta === null || meta === undefined)
    throw new globalThis.Error("The parameter 'meta' cannot be null.");   // meta/attachments sind optional
```
Zusätzlich `title?`/`file?` optional typisiert, obwohl required; `FileParameter.data: any`.

**4. Mehrere 2xx – zweiter Erfolg wird zum Fehler:**
```ts
} else if (status === 202) { … return throwException("Angenommen, wird verarbeitet", status, _responseText, _headers, result202);
```

**5. Cookie-Parameter stillschweigend verworfen** – `session` steht in der Signatur, wird nie gelesen (TS6133).

**6. OpenAPI 3.1:** `items: false` (neben `prefixItems`) → `JsonSerializationException … 'ItemsRaw'`, kein Output (`client-31/GENERATION-FAILED.txt`).

## Test-Hinweise
- Responses werden als `Blob` geflusht (`tests/nswag-helpers.ts`), da NSwag immer `responseType: 'blob'` anfordert.
- `WeirdNames` hat `constructor?: string` → Objekt-Literale ohne explizites `constructor` scheitern (Object.prototype.constructor: Function).

## Audit (Fairness, s. results/AUDIT.md)

- T-ENUM-VARNAMES fail → unsupported: kein Wert-Export `Priority`, also gar keine benannten Konstanten (Regel: fail nur bei
  falsch benannten Membern, z. B. `_1`).
- T31-DEPENDENT-REQUIRED, T31-WEBHOOKS unsupported → fail: expect verlangt wörtlich „Generierung bricht nicht“.
- R-BODY-OCTET: Test-Blob ohne eigenen MIME-Typ (wie andere Generatoren); Verdict unverändert pass (Header explizit gesetzt).
