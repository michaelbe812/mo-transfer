# ng-openapi 0.4.1 — Befunde

Ergebnis (Stand Generierung): types 48 ✓ / 18 ✗ / 1 skip · types-31 8 ✓ / 2 ✗ · static 0 ✓ / 3 ✗ ·
runtime+angular 33 ✓ / 9 ✗ / 8 skip.

## Konfiguration (`openapi.config.ts`, ausgeführt über `generate.mjs`)

| Option | Wert | Warum |
|---|---|---|
| `dateType` | `'string'` | `'Date'` wäre inkonsistent (siehe unten): der Date-Transformer ist ein klassenbasierter `HTTP_INTERCEPTORS`-Interceptor, er greift mit `provideHttpClient(withInterceptors(...))` ohne `withInterceptorsFromDi()` nicht. Außerdem erkennt seine Regex nur `date-time`, nicht `format: date`. Und das Schema `Date` überschattet den globalen `Date` in `models/index.ts`. |
| `enumStyle` | `'union'` | `type X = 'a' \| 'b'` + Konstanten-Objekt `X.A`. Exakte Literal-Typen, keine nominalen TS-Enums. |
| `useSingleRequestParameter` | `false` (Default) | `true` erzeugt in `request-params.ts` denselben Import-Bug (siehe unten). |
| `clientName` | `'Bench'` | erzeugt `provideBenchClient()` und `BASE_PATH_BENCH` |
| `plugins` | `[HttpResourcePlugin]` | aus `@ng-openapi/http-resource` 0.2.0 (separates Paket). Erzeugt `resources/*.resource.ts` mit `httpResource()` für GET-Operationen. Parameter sind `Signal<T> \| T`, es gibt einen `defaultValue`-Overload (`HttpResourceRef<Pet>`). `ZodPlugin` (`@ng-openapi/zod`) ist nicht installiert und nicht genutzt, es würde nur Response-Parsing ergänzen. |

`generate.mjs` ruft `generateFromConfig()` direkt auf, nicht die CLI. Die CLI lädt `.ts`-Configs per `require()` + ts-node,
und das scheitert an `"type": "module"` im Bench-`package.json`. Zusätzlich zeigt `main` im ng-openapi-`package.json` auf ein
nicht existierendes `index.cjs`.

### Workaround für die 3.0-Spec (wichtig)

Die unveränderte 3.0-Spec **lässt sich nicht generieren**. Der Absturz kommt bei jedem `enumStyle`:

```
TypeError: Cannot read properties of null (reading 'toString')
    at toEnumKey (ng-openapi/index.js:2529)      // function toEnumKey(value) { const str = value.toString(); ...
```

Auslöser ist `NullableColor: { nullable: true, enum: [red, green, blue, null] }`, also die korrekte 3.0.3-Form.
`generate.mjs` versucht immer zuerst die Originalspec und loggt den Fehler. Danach erzeugt es eine In-Memory-Kopie, in der
`null` aus Enums mit `nullable: true` entfernt ist. Sonst wird nichts geändert. T-ENUM-NULLABLE schlägt trotzdem fehl,
weil `nullable` bei Enum-Refs verloren geht (`color?: NullableColor` ohne `| null`). Der Workaround verschönert also nichts.

## Stärken

- Angular-idiomatisch: `@Injectable({ providedIn: 'root' })`-Services mit `inject()`. Es gibt `provideBenchClient({ basePath })`
  und Overloads `observe: 'body' | 'response' | 'events'`, korrekt typisiert (z. B. `Observable<HttpResponse<Pet>>`).
  `HttpContext`, `reportProgress` und `withCredentials` lassen sich pro Aufruf setzen. Requests sind cold und abbrechbar,
  funktionieren zoneless, und funktionale Interceptors greifen.
- httpResource-Plugin: z. B. `inject(PetsResource).getPet(petIdSignal)` → `HttpResourceRef<Pet | undefined>`. Der Aufruf
  braucht einen Injection-Context. Die Resources übernehmen dieselben Serialisierungs-Bugs wie die Services
  (`HttpParamsBuilder`, Pfad nicht encodiert).
- Form-urlencoded (`URLSearchParams`) und Multipart (`FormData`, Content-Type wird entfernt) sind korrekt.
- `0`/`false` in Query werden gesendet (`!= null`), Form-Objekte werden zu `x=1&y=2` aufgelöst.
- Modelle: exakte quoted Property-Namen, `user-profile` → `UserProfile`. Die Kollision mit `Date`/`Object` ist bei
  `dateType: string` korrekt, allOf ergibt eine Intersection, Rekursion funktioniert, `additionalProperties: true` → `Record<string, unknown>`.
- 3.1: `type: [string, 'null']`, `const`, `enum` mit `null` und const-Discriminator (`Event31` narrowt) funktionieren.

## Schwächen / Bugs

1. **Fehlende Imports, versteckt durch `// @ts-nocheck`**: jede generierte Datei beginnt mit `// @ts-nocheck`. Typen mit
   DOM-Namen werden nicht importiert und lösen deshalb still auf globale Browser-Typen auf:
   ```ts
   // responses.service.ts
   import { RequestOptions, Pet, DateHolder, Tag } from "../models";   // Report fehlt
   reportByAccept(...): Observable<Report>;                            // → globales DOM-Report (Reporting API)
   // polymorphism.service.ts
   pay(paymentRequest: PaymentRequest, ...)                            // → globales DOM-PaymentRequest
   ```
   Folge: `pay({ amount, method })` kompiliert nicht (T-ONEOF-PLAIN), und `reportByAccept()` liefert den falschen Typ.
   Der Strict-Compile ist „grün“, weil `@ts-nocheck` alles verdeckt.
2. **Bodies werden verworfen**: `application/merge-patch+json`, `application/octet-stream` und `text/plain` erzeugen keinen
   Body-Parameter:
   ```ts
   patchPet(petId: number, observe?: 'body', ...)   // → body: null, Content-Type application/json
   uploadBinary(observe?: 'body', ...)              // → body: null
   postText(observe?: 'body', ...)                  // → body: null (Response text korrekt)
   ```
3. **Header- und Cookie-Parameter fehlen komplett**: `headerAndCookieParams(observe?, options?)`.
4. **Keine Security**: `securitySchemes` und `security` werden ignoriert. Auth geht nur per eigenem Interceptor.
5. **Parameter-Serialisierung**: Pfad ohne `encodeURIComponent` (`/params/path/${stringId}`). Die Query-`style`/`explode`-Angaben
   werden ignoriert, Arrays werden immer wiederholt (`tagsCsv=a&tagsCsv=b`). deepObject wird flach ohne Präfix gesendet
   (`name=rex&status=sold` statt `filter[name]=rex`).
6. **Multipart-JSON-Part**: `formData.append('meta', String(meta))` → `'[object Object]'`.
7. **Polymorphie**: Discriminator und Mapping werden ignoriert (`ShapeBase.kind: string`), dadurch kein Narrowing.
   `allOf`-Vererbung ergibt nur `BaseEvent[]`.
8. **readOnly/writeOnly ignoriert**: `createPet` verlangt `id` (readonly), die Response enthält `secretChipCode`.
9. **Operation-Inline-Schemas** → `Record<string, any>` (inlineSchemas, getInventory). Leere Responses → `Observable<any>`,
   bei mehreren 2xx wird nur die erste typisiert (`multiStatus` → `Pet`). Content-Negotiation (PDF) lässt sich nicht wählen.
10. `x-enum-varnames` wird ignoriert (`Priority._1/_2/_3`). `mixed` (properties + additionalProperties) verliert die
    Index-Signatur. Kein `@deprecated`, keine Operation-Summary in JSDoc.
11. `dateType: 'Date'` (Default der CLI) ist doppelt kaputt. Erstens überschattet `export interface Date { value?: string }` im
    selben File den globalen `Date`, also wird `DateHolder.dateTime: Date` zum Schema-Typ. Zweitens hängt die Konvertierung an
    einem DI-Interceptor, der in modernen Apps ohne `withInterceptorsFromDi()` gar nicht läuft.

## Runtime-Hinweise

- In den Tests steht `provideBenchClient()` neben `setupHttp()`. Der mitregistrierte `BenchBaseInterceptor` (`HTTP_INTERCEPTORS`)
  ist dort wirkungslos, weil kein `withInterceptorsFromDi()` gesetzt ist. Das betrifft nur die klassenbasierten
  `interceptors`-Optionen des Providers.
- `tsconfig.spec.json` musste nicht gelockert werden.

## Audit (Fairness, s. results/AUDIT.md)

- T-ERROR-MODEL unsupported → fail: expect wertet „nur HttpErrorResponse.error: any“ ausdrücklich als fail.
- R-HEADER-PARAM unsupported → fail: Operation existiert, verwirft aber die Header-Parameter (wie verworfene Bodies =
  fail; konsistent zu T-PARAM-HEADER). Nur Cookies dürfen laut expect unsupported sein.
