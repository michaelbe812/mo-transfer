# Orval 8.39.0 (client `angular`)

## Konfiguration (orval.config.ts, via `generate.mjs` → `orval --config --project`)

| Option | Wert | Warum |
|---|---|---|
| `client` | `angular` | HttpClient-Services, `@Injectable({ providedIn: 'root' })`, `inject()` |
| `mode` | `tags-split` | ein Service/Resource-File pro Tag, Modelle einzeln → Tree-Shaking auf Tag-Ebene |
| `override.angular.retrievalClient` | `both` | GETs zusätzlich als `httpResource`-Funktionen (`getPetResource(signal)`), Services bleiben komplett |
| `override.angular.baseUrl` | `{ apiId: 'bench' }` | DI-Token `BENCH_BASE_URL` + `provideBenchBaseUrl()`; ohne → Server-URL fest im Pfad |
| `override.enumGenerationType` | `const` | Literal-Union-Typ **und** benannte Member (`Priority.LOW`), x-enum-varnames/-descriptions genutzt |
| `override.preserveReadonlyRequestBodies` | `strip` | `createPet(body: NonReadonly<Pet>)` → id/createdAt nicht Pflicht |
| `headers` | `true` | sonst werden Header-Parameter gar nicht generiert |
| `urlEncodeParameters` | `true` | `encodeURIComponent` für Pfadparameter |
| `useDates` | aus | Angular-Client hat **keinen** Date-Transformer (`useDatesTransform` nur fetch/query) → `Date`-Typ wäre Lüge |
| `input.unsafeDisableValidation` | `true` (nur 3.0) | Orval-Validator meldet `INVALID_REFERENCE: Can't resolve reference: [object Object]` – ausgelöst durch die Property namens `$ref` in `WeirdNames`. Spec ist valide. |

Zod (`schemas.type: 'zod'` + `override.angular.runtimeValidation: true`) wurde im Scratch evaluiert: generiert
funktionierend `.pipe(map(data => Pet.parse(data)))` in jeder Service-Methode → echte Response-Validierung,
aber Runtime-Dep `zod` (bricht No-Runtime-Deps-Baseline) → nicht Hauptclient.

## Ergebnis (Kurz)

- types: 65 pass / 2 fail (T-WRITEONLY, T-ERROR-MODEL nach Audit); 3.1: 10/10
- runtime+angular: 36 pass / 7 fail / 7 skip (Auth ×6, Cookie); alle A-* pass
- static: 3/3

## Stärken

- Modernstes Angular-Paket im Feld: `httpResource`-Funktionen pro GET (Signal-Parameter, `defaultValue`-Overload,
  `context`/`headers`-Extension), `inject()`, Base-URL via DI-Token/Resolver.
- `observe: 'body' | 'response' | 'events'` als typisierte Overloads → `HttpResponse<Pet>` ohne Cast; `context`,
  `reportProgress`, `timeout`, `transferCache` durchgereicht.
- Content-Negotiation sauber: `reportByAccept('application/pdf')` → `Observable<Blob>` + `responseType: 'blob'`.
- Query: 0/false werden gesendet, `undefined` gefiltert, deepObject (`filter[name]`) und form-explode-Objekt korrekt.
- Modelle: const-Enums, Discriminator-Mapping als Literal (`Circle.kind: 'circle'`), allOf-Vererbung mit
  `Omit<BaseEvent,'eventType'> & { eventType: 'created' }`, Original-Property-Namen, readOnly-Strip.
- OpenAPI 3.1: `type: [string, null]`, `const`, `prefixItems` → `[number, number]`, `enum` mit `null`.

## Schwächen / Bugs

1. **Generierter Code kompiliert nicht strict** (S-STRICT-COMPILE): integer-Header wird ungecastet an HttpClient gegeben.
   ```ts
   export type HeaderAndCookieParamsHeaders = { 'X-Request-Id': string; 'X-Retry-Count'?: number; ... };
   headers: {...headers, ...options?.headers},   // TS2322: number nicht string | string[]
   ```
   Dazu `reportByAcceptResource` (httpResource + Content-Negotiation): `OrvalHttpResourceOptions<Report, Blob>` an
   `httpResource.blob` → TS2769. Folge: Angular-Testbuild bricht ab → `tsconfig.spec.json` mit `"noCheck": true`
   (einzige Möglichkeit, da echte Typfehler, kein Flag). Testcode selbst separat ohne `noCheck` geprüft: 0 Fehler.
2. **x-www-form-urlencoded falsch am Wire**: Body ist `URLSearchParams`, kein Content-Type gesetzt. Angulars
   `detectContentTypeHeader()` erkennt nur `HttpParams` → sendet `Content-Type: application/json` mit urlencoded Body.
   ```ts
   const formUrlEncoded = new URLSearchParams(); ...
   return this.http.post<TData>(`${this.baseUrl}/bodies/form-urlencoded`, formUrlEncoded, {...})
   ```
3. Media-Types werden nicht gesetzt: merge-patch+json → `application/json`; octet-stream → kein Content-Type
   (nur `blob.type`); Vendor-JSON ohne `Accept: application/vnd.bench.v1+json`.
4. Query-Array-Styles ignoriert: `explode: false`, `pipeDelimited`, `spaceDelimited` → immer `a=1&a=2`.
5. `securitySchemes` komplett ignoriert (keine Credentials-Konfig, kein `security: []`-Handling), `in: cookie` fehlt.
6. writeOnly ignoriert (`secretChipCode` im Response-`Pet`); keine Error-Typen pro Operation (404 Problem/422
   ValidationProblem nur als lose `ErrorResponse`-Aliase).
7. Jede Methode hat `<TData = Pet>` → `getPet<string>(1)` kompiliert: Response-Typ frei umdeklarierbar (Typ-Leck).
8. `options.headers`/`options.params` werden per Spread gemerged (`{...params, ...options?.params}`) – als
   `HttpHeaders`/`HttpParams`-Instanz übergeben gehen die Werte verloren (interne Felder statt Einträge).
9. `additionalProperties: {type: string}` neben `properties` → Index-Signatur `unknown` statt `string`
   (`SettingsMixed`); Webhooks (3.1) werden ignoriert (nur Payload-Typ `Item31` existiert).
10. Modell mit Property `constructor?: string` (`WeirdNames`) ist per Objekt-Literal nur mit explizitem
    `constructor` zuweisbar (TS-Eigenheit, kein Orval-Mapping).

## Infrastruktur-Hinweis

`vitest.types.config.mts` nutzt `tsconfig.types.json` mit allen Generator-Tests; ein (zeitweiser) Syntaxfehler in einem
fremden generierten Client (z. B. `generators/openapi-generator/client/model/shape.ts` TS1110) unterdrückt dort
**alle** semantischen Fehler → falsche Grüne. Gegenprobe mit isolierter tsconfig (nur orval-Tests) durchgeführt.

## Audit (Fairness, s. results/AUDIT.md)

- T-ERROR-MODEL unsupported → fail: expect wertet „nur HttpErrorResponse.error: any“ ausdrücklich als fail.
