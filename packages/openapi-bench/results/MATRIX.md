# Vergleichsmatrix: OpenAPI-Client-Generatoren für Angular

> Automatisch erzeugt von `scripts/build-matrix.mjs` am 2026-10-02 — Node v22.16.0, TypeScript 6.0.3, Angular 22.0.8, Vitest 4.1.11, openjdk version "11.0.15" 2022-04-19 LTS, .NET 9.0.203.
> Gesamtscore = 35% types + 35% runtime + 20% angular + 10% static (jeweils gewichtete Case-Punkte, Gewicht 1–3 je Case).

## Ranking

| # | Generator | Version | **Gesamt** | Typsicherheit | Korrektheit (Wire) | Angular First-Class | Code-Qualität | ✅ | ❌ | ➖ | ❔ |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | ng-openapi-gen | 1.1.0 | **85.0 %** | 88.1 % | 84.6 % | 88.0 % | 70.0 % | 114 | 11 | 10 | 0 |
| 2 | OpenAPI Generator (typescript-angular) | 7.25.0 (Generator-JAR; CLI-Wrapper 2.41.0) | **84.5 %** | 80.0 % | 97.4 % | 92.0 % | 40.0 % | 113 | 21 | 1 | 0 |
| 3 | Orval | 8.39.0 | **83.8 %** | 97.8 % | 73.1 % | 100.0 % | 40.0 % | 116 | 12 | 7 | 0 |
| 4 | Hey API (openapi-ts) | 0.99.0 | **81.8 %** | 97.0 % | 74.4 % | 64.0 % | 90.0 % | 114 | 18 | 3 | 0 |
| 5 | ng-openapi | 0.4.1 | **69.2 %** | 74.8 % | 62.8 % | 100.0 % | 10.0 % | 91 | 37 | 7 | 0 |
| 6 | NSwag (TypeScript, Template Angular) | 14.7.1 (NJsonSchema 11.6.1, .NET-Runtime Net80) | **64.0 %** | 70.4 % | 62.8 % | 72.0 % | 30.0 % | 85 | 31 | 19 | 0 |
| 7 | openapi-typescript + openapi-fetch | 7.13.0 (+ 0.17.0) | **61.0 %** | 96.3 % | 56.4 % | 8.0 % | 60.0 % | 96 | 20 | 19 | 0 |

✅ bestanden · ❌ fehlgeschlagen (Feature vorhanden, aber falsch) · ➖ nicht unterstützt · ❔ kein Test

## Score je Kategorie

| Kategorie | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|---|---|---|---|---|
| Typen: Modelle | 89.1 % | 89.1 % | 97.8 % | 100.0 % | 84.8 % | 89.1 % | 100.0 % |
| Typen: Operationen (Parameter, Bodies, Responses) | 91.3 % | 84.8 % | 95.7 % | 97.8 % | 65.2 % | 80.4 % | 93.5 % |
| Typen: Polymorphie & Komposition | 58.8 % | 47.1 % | 100.0 % | 88.2 % | 47.1 % | 35.3 % | 100.0 % |
| Typen: Namen & Sonderfälle | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 91.7 % | 83.3 % |
| Typen: OpenAPI 3.1 | 100.0 % | 57.1 % | 100.0 % | 92.9 % | 85.7 % | 0.0 % | 100.0 % |
| Runtime: Parameter-Serialisierung | 96.8 % | 96.8 % | 83.9 % | 87.1 % | 58.1 % | 67.7 % | 80.6 % |
| Runtime: Request-Bodies | 90.5 % | 95.2 % | 71.4 % | 100.0 % | 66.7 % | 85.7 % | 42.9 % |
| Runtime: Responses | 100.0 % | 100.0 % | 94.1 % | 58.8 % | 100.0 % | 58.8 % | 58.8 % |
| Runtime: Security | 0.0 % | 100.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % | 0.0 % |
| Angular First-Class | 88.0 % | 92.0 % | 100.0 % | 64.0 % | 100.0 % | 72.0 % | 8.0 % |
| Statisch: Doku & Code-Qualität | 70.0 % | 40.0 % | 40.0 % | 90.0 % | 10.0 % | 30.0 % | 60.0 % |

## Kennzahlen

| Generator | Laufzeit | Output-Stil | Gen.-Zeit (ms) | Dateien | LOC | KB | `any` gesamt / in Typen | `@ts-nocheck` | Strict-Fehler | Max-Strict-Fehler | Bundle 1 Op / alle (KB gz) | Laufzeit-Deps | OAS 3.1 | Workarounds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ng-openapi-gen | node | functions+services | 340 | 103 | 3445 | 141.8 | 154 / 4 | 0 | 0 | 237 | 1.9 / 5.9 | – | ok (webhooks ignoriert; upload31 ohne Schema → body: any) | – |
| OpenAPI Generator (typescript-angular) | java | class-services | 3301 | 76 | 4069 | 203.0 | 219 / 4 | 0 | 1 ⚠ Syntax | 1 ⚠ Syntax | 2.8 / – | – | partial: OpenAPI 3.1 'beta'; Webhook-DefaultService überschreibt den Pfad-DefaultService (Duplicate file path) → getItem31/putItem31/listEvents31/upload31 fehlen; const/prefixItems → any | 1 |
| Orval | node | class-services | 1071 | 90 | 4833 | 176.3 | 2 / 2 | 0 | 15 | 16 | 1.0 / 4.8 | – | ok (type-Arrays, const, prefixItems-Tupel, enum mit null; webhooks werden ignoriert) | 1 |
| Hey API (openapi-ts) | node | functions | 527 | 17 | 3581 | 127.2 | 2 / 0 | 0 | 0 | 22 | 3.7 / 6.2 | – | ok | – |
| ng-openapi | node | class-services | 2416 | 24 | 2442 | 123.0 | 176 / 1 | 21 | 0 | 4 | 1.2 / 4.9 | – | ok | 1 |
| NSwag (TypeScript, Template Angular) | dotnet | class-services | 999 | 1 | 2377 | 104.4 | 510 / 67 | 0 | 5 | 7 | 3.8 / 3.9 | – | failed: NJsonSchema JsonSerializationException bei `items: false` (Item31.coords, prefixItems) – kein Output | 2 |
| openapi-typescript + openapi-fetch | node | functions | 410 | 1 | 1866 | 49.4 | 5 / 5 | 0 | 0 | 0 | 2.6 / 2.8 | openapi-fetch, openapi-typescript-helpers | ok | – |

## Angular-Features (laut meta.json, verifiziert durch A-*-Tests)

| Feature | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|---|---|---|---|---|
| Angular HttpClient | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| inject()-DI | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| provide…()-Funktion | provideApiConfiguration(rootUrl) | provideApi(basePath \| ConfigurationParameters) | provideBenchBaseUrl(url) / provideBenchBaseUrlResolver(fn) | provideHeyApiClient(client) – nur HttpClient-Wiring, keine Config (baseUrl via client.setConfig global) | provideBenchClient({ basePath, interceptors?, enableDateTransform? }) | – | – |
| httpResource / Signals | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| HttpContext pro Call | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| observe: 'response' | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Min. Angular | ≥ 16 | konfigurierbar über ngVersion (≥ 9.0.0); provideApi/makeEnvironmentProviders ab ≥ 15 | ≥ 19.2 (httpResource), Services ≥ 17 | ≥ 19.2 (httpResource, provideAppInitializer) | ≥ 15 (peerDependency) | ≥ 12.1 (HttpContext); Konstruktor-DI mit @Inject/@Optional | unabhängig (framework-agnostisch, fetch) |
| Validierung | none | none | none (optional zod via override.angular.runtimeValidation + schemas.type zod — nicht gewählt, Runtime-Dep zod) | none | none | none | none |

## Alle Cases

### Typen: Modelle

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `T-PRIM-STRING` string → string | 2 | Primitives['str'] ist exakt string (nicht any/unknown). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PRIM-INT` integer → number | 2 | Primitives['int32'] ist exakt number. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PRIM-NUMBER` number → number | 2 | float und double sind exakt number. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PRIM-BOOLEAN` boolean → boolean | 2 | Primitives['bool'] ist exakt boolean. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-FORMAT-INT64` int64 konsistent zur Runtime | 2 | int64 ist number (JSON.parse liefert number). bigint/string nur ok, wenn der Client zur Laufzeit tatsächlich konvertiert (dann im Test nachweisen). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-FORMAT-UUID` uuid/email/uri → string | 1 | Formate ohne Laufzeit-Konvertierung sind string (oder string-Brand). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-FORMAT-BYTE` byte (base64) → string | 1 | format: byte ist string (base64), nicht Blob. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-FORMAT-DATE` date/date-time typisiert | 3 | date-time ist string ODER Date. Nicht any. Muss zu R-RESP-DATE-CONSISTENT passen. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ENUM-STRING` String-Enum geschlossen | 3 | Pet['status'] akzeptiert 'available'\|'pending'\|'sold' (Literal oder Enum-Member), ein ungültiger String ('foo') ist Compile-Fehler (@ts-expect-error). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ENUM-INT` Integer-Enum geschlossen | 2 | Priority akzeptiert 1\|2\|3, 4 ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ENUM-VARNAMES` x-enum-varnames genutzt | 1 | Es gibt benannte Member/Konstanten LOW/MEDIUM/HIGH (z. B. Priority.LOW === 1 oder PriorityLOW). | ➖ | ✅ | ✅ | ✅ | ❌ | ➖ | ✅ |
| `T-ENUM-NULLABLE` Nullable Enum | 2 | Pet['color'] akzeptiert null und 'red', lehnt 'pink' ab. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-ENUM-SPECIAL-VALUES` Enum-Werte mit Sonderzeichen | 1 | Alle 6 Werte inkl. 'with space', '1starts-with-digit' und '' sind gültig, Typ ist exakt die Union (Werte unverändert). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-REQUIRED` required → nicht optional | 3 | In der Response-Pet-Typisierung sind name, status, photoUrls nicht optional (kein undefined): Objekt ohne name ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-OPTIONAL` optional → optional | 2 | Pet['tags'] ist optional (Objekt ohne tags kompiliert). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-NULLABLE` nullable → \| null | 3 | Pet['nickname'] erlaubt null (und string); Pet['name'] erlaubt kein null. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-READONLY` readOnly im Request nicht erzwungen | 2 | createPet akzeptiert einen Body OHNE id/createdAt (readOnly). Bonus-frei: readonly-Modifier zählt nicht als Erfüllung, wenn id im Request trotzdem Pflicht ist. | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `T-WRITEONLY` writeOnly nicht in Response | 1 | Response-Typ von getPet enthält secretChipCode NICHT (oder Request/Response-Typen sind getrennt). | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `T-DEFAULTS` Property mit default optional im Request | 1 | vaccinated (default false) ist im Request optional und boolean. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ARRAY-REF` Array von Refs | 2 | Pet['tags'] ist Array<Tag> (Element hat name: string). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ARRAY-NESTED` Verschachteltes Array | 1 | Settings['matrix'] ist number[][] (optional). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ARRAY-UNIQUE` uniqueItems konsistent | 1 | uniqueTags ist string[] (oder Set<string> NUR wenn Runtime ein Set liefert). | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ADDPROPS-SCHEMA` additionalProperties: Schema → Record | 2 | counters ist Record<string, number> bzw. { [k: string]: number }; Wert string ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ADDPROPS-FALSE` additionalProperties: false → kein Index | 2 | Settings['strict'] hat keine Index-Signatur: { a: 'x', b: 1 } als Objekt-Literal ist Compile-Fehler (excess property). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ADDPROPS-TRUE` Free-form Objekt | 1 | freeForm ist Record<string, unknown> o. ä.; Werte sind unknown (any = fail, da unsicher). | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `T-ADDPROPS-WITH-PROPS` properties + additionalProperties | 1 | mixed.known ist string (required) UND beliebige weitere string-Keys erlaubt. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |

### Typen: Operationen (Parameter, Bodies, Responses)

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `T-INLINE-OBJECT` Inline-Schemas typisiert | 2 | Response von inlineSchemas hat accepted: boolean und id: string (nicht any/object/unknown); Request nested.depth ist number. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-INLINE-ENUM` Inline-Enum geschlossen | 2 | Request mode akzeptiert 'fast'\|'slow', lehnt 'medium' ab. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-PARAM-PATH-REQUIRED` Pflicht-Pfadparameter erzwungen | 3 | Aufruf ohne petId ist Compile-Fehler; petId ist number (string = Fehler). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARAM-PATH-TYPES` Pfadparameter-Typen | 2 | intId number, enumId PetStatus (ungültiger String = Fehler), stringId/uuidId string. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARAM-QUERY-OPTIONAL` Optionale Query-Parameter weglassbar | 2 | listPets() ohne Parameter kompiliert; limit ist number. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARAM-QUERY-REQUIRED` Pflicht-Query-Parameter erzwungen | 3 | queryStyles ohne required ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARAM-QUERY-ENUM` Enum-Query-Parameter geschlossen | 2 | sort: 'up' ist Compile-Fehler; 'asc' ok. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARAM-QUERY-ARRAY` Array-Query-Parameter typisiert | 2 | tagsExplode ist string[] bzw. Array<string>, tagsSpace number[]; filter (deepObject) hat Typ PetFilter. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARAM-HEADER` Header-Parameter typisiert & Pflicht | 2 | X-Request-Id (required) muss angegeben werden (Weglassen = Compile-Fehler); X-Retry-Count ist number. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-BODY-REQUIRED` Pflicht-Body erzwungen & typisiert | 3 | createPet ohne Body ist Compile-Fehler; Body mit name: 123 ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-BODY-OPTIONAL` Optionaler Body weglassbar | 1 | optionalBody() ohne Body kompiliert; mit Tag-Body ebenfalls. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-PARTIAL-BODY` Merge-Patch-Body typisiert | 1 | patchPet akzeptiert { nickname: null } und lehnt { status: 'x' } ab. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-BODY-FORM` form-urlencoded Body typisiert | 2 | username/password sind Pflicht-Strings; remember boolean. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-BODY-MULTIPART` multipart Body typisiert | 2 | file ist Blob (oder Blob\|File), title Pflicht-String, attachments Array<Blob>; file: 'string' ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `T-BODY-OCTET` Binary Body = Blob | 1 | uploadBinary akzeptiert Blob; ein Objekt {} ist Compile-Fehler. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-RESP-200` Response-Typ korrekt | 3 | getPet liefert Observable<Pet> / Promise<Pet> / Resource<Pet> (Default-Aufruf, ohne Casts); listPets liefert PetPage. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-RESP-204` 204 → void | 2 | deletePet liefert void/undefined/unknown-freies leeres Ergebnis (NICHT any). | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-RESP-MULTI-2XX` Mehrere 2xx → Union | 2 | Result ist Pet \| Job (Union). Nur Pet = fail (falsch), any = fail. | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `T-RESP-BINARY` Binary Response = Blob | 2 | downloadFile liefert Blob (oder ArrayBuffer), nicht string/any. | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `T-RESP-TEXT` text/plain Response = string | 2 | postText liefert string. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-RESP-PRIMITIVE-ARRAY` Array<number> Response | 1 | liefert number[]. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-RESP-MAP` Map Response | 1 | liefert Record<string, number> o. ä. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `T-RESP-CONTENT-NEGOTIATION` Mehrere Content-Types → wählbar & typisiert | 1 | JSON-Variante liefert Report; PDF-Variante wählbar und liefert Blob. Nur eine Variante korrekt typisiert = fail. | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| `T-ERROR-MODEL` Fehler-Modelle typisiert erreichbar | 2 | Es gibt einen exportierten typisierten Weg, den Fehler-Body als Problem/ValidationProblem zu bekommen, der an die Operation gebunden ist (z. B. Error-Generic, ErrorType-Export pro Operation, Result-Union). Nur generisches HttpErrorResponse.error:any = fail. | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |

### Typen: Polymorphie & Komposition

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `T-ALLOF-COMPOSE` allOf komponiert | 3 | PetPage hat total/limit/offset (number, required) UND items: Pet[] (required). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-ONEOF-DISC` oneOf + discriminator → narrowbare Union | 3 | Shape ist Union; switch auf kind narrowt: im Zweig kind==='circle' ist radius number zugreifbar ohne Cast; radius im rect-Zweig ist Compile-Fehler. | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `T-ONEOF-DISC-MAPPING` Discriminator-Mapping-Werte als Literale | 2 | kind in Circle ist 'circle' (Mapping-Wert, NICHT 'Circle' und nicht string). Circle mit kind: 'rect' ist Compile-Fehler. | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| `T-ALLOF-DISC-INHERITANCE` allOf-Vererbung mit Discriminator am Parent | 2 | Response von listEvents ist auf CreatedEvent narrowbar (eventType==='created' → petId zugreifbar) ODER CreatedEvent enthält alle BaseEvent-Felder und eventType ist literal 'created'. | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `T-ONEOF-PLAIN` oneOf ohne Discriminator → Union | 2 | method akzeptiert CardPayment und SepaPayment, lehnt {} bzw. {foo:1} ab; nicht any. | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `T-ANYOF` anyOf → Union | 2 | note ist string \| number (optional); boolean ist Compile-Fehler. | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `T-RECURSIVE` Rekursive Typen | 2 | TreeNode['children'] ist TreeNode[]; tiefe Verschachtelung (children[0].children[0].value) ist string. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-CIRCULAR` Zirkuläre Refs über mehrere Schemas | 1 | node.parent?.node?.value ist string \| undefined bzw. string; Category.parent?.parent?.name kompiliert typisiert. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Typen: Namen & Sonderfälle

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `T-NAME-RESERVED-PARAM` Parameter class/default/page-size/filter.name aufrufbar | 1 | Operation ist aufrufbar mit allen 4 Parametern (umbenannt erlaubt, z. B. _class, pageSize). | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `T-NAME-SPECIAL-PROPS` Property-Namen exakt erhalten | 3 | Properties heißen exakt 'x-request-id', '@type', '$ref', '1stPlace', 'with space', 'snake_case_prop' (kein camelCase-Umbenennen ohne Mapping — sonst kaputt am Wire). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-NAME-RESERVED-PROPS` Reservierte Wörter als Properties | 1 | class/default/delete/constructor sind als Properties unter exakt diesem Namen typisiert. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-NAME-SCHEMA-COLLISION` Schema-Namen kollidieren nicht mit TS-Globals | 2 | user-profile.birthday hat den Schema-Typ (value?: string), nicht das globale Date; raw nicht globales Object. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-NAME-SCHEMA-SANITIZE` Schema-Name mit Bindestrich | 1 | Ein exportierter Typ für user-profile existiert (z. B. UserProfile) mit displayName?: string. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-NAME-OPERATION-ID-SANITIZE` operationId mit Sonderzeichen | 1 | Ein aufrufbarer, gültiger Methoden-/Funktionsname existiert. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `T-NO-OPERATION-ID` Operation ohne operationId | 1 | Wird generiert (Name aus Methode+Pfad) und liefert Tag. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `T-UNTAGGED-OP` Operation ohne Tag | 1 | Wird generiert und ist aufrufbar. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `T-UNREFERENCED-SCHEMA` Nicht referenziertes Schema generiert | 1 | Typ UnreferencedModel existiert mit marker: 'unreferenced'. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Typen: OpenAPI 3.1

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `T31-TYPE-NULL-UNION` type-Array mit null | 3 | nickname ist string \| null (required); count number \| null. | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ |
| `T31-CONST` const → Literal | 2 | kind ist exakt 'item'; 'other' ist Compile-Fehler. | ✅ | ❌ | ✅ | ✅ | ✅ | ➖ | ✅ |
| `T31-ENUM-NULL` Enum mit null (ohne nullable) | 1 | level ist 'low' \| 'high' \| null (optional). | ✅ | ✅ | ✅ | ❌ | ✅ | ➖ | ✅ |
| `T31-PREFIX-ITEMS` prefixItems → Tupel | 1 | coords ist [number, number] (number[] = fail). | ✅ | ❌ | ✅ | ✅ | ❌ | ➖ | ✅ |
| `T31-REF-SIBLINGS` $ref mit Siblings | 1 | label ist string (Ref aufgelöst, required). | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ |
| `T31-ONEOF-CONST-DISC` oneOf mit const-Discriminator | 2 | Event31 narrowt über type==='start' → startedAt zugreifbar. | ✅ | ❌ | ✅ | ✅ | ✅ | ➖ | ✅ |
| `T31-EXAMPLES` examples (Array) bricht Generierung nicht | 1 | tags ist string[] (optional). | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ |
| `T31-DEPENDENT-REQUIRED` dependentRequired toleriert | 1 | creditCard/billingAddress sind optionale strings (Generierung bricht nicht). | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| `T31-BINARY-CONTENT-MEDIA-TYPE` Binary-Body ohne Schema (3.1-Stil) | 1 | upload31 akzeptiert Blob. | ✅ | ❌ | ✅ | ✅ | ❌ | ➖ | ✅ |
| `T31-WEBHOOKS` Webhooks generiert/typisiert | 1 | Ein Typ für den Webhook-Payload (Item31) oder Webhook-Request existiert; Generierung bricht nicht. | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

### Runtime: Parameter-Serialisierung

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `R-PATH-MULTI` Mehrere Pfadparameter korrekt eingesetzt | 3 | URL endet auf /params/path/abc/42/<uuid>/sold. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-PATH-ENCODE` Pfadparameter URL-encodiert | 3 | stringId 'a/b c?#' erscheint als a%2Fb%20c%3F%23 im Pfad (Slash MUSS encodiert sein). | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `R-QUERY-PRIMITIVES` Primitive Query-Parameter | 3 | listPets({limit:10, offset:0, status:'sold', vaccinated:false}) → limit=10&offset=0&status=sold&vaccinated=false (0 und false werden gesendet!). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-QUERY-OPTIONAL-OMITTED` Undefined/fehlende Parameter nicht gesendet | 3 | listPets() → keine Query-Parameter; insbesondere kein 'undefined'/'null' als Wert. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-QUERY-ARRAY-EXPLODE` form/explode=true | 3 | tagsExplode=a&tagsExplode=b. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-QUERY-ARRAY-NOEXPLODE` form/explode=false | 2 | tagsCsv=a,b (Komma ggf. als %2C encodiert). | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `R-QUERY-ARRAY-PIPE` pipeDelimited | 1 | tagsPipe=a\|b (\| ggf. %7C). | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `R-QUERY-ARRAY-SPACE` spaceDelimited | 1 | tagsSpace=1%202 (oder 1+2). | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `R-QUERY-DEEPOBJECT` deepObject | 2 | filter[name]=rex&filter[status]=sold (Klammern ggf. encodiert). | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `R-QUERY-FORM-OBJECT` form/explode Objekt | 1 | x=1&y=2 (Objekt-Properties als einzelne Parameter). | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `R-QUERY-DATE` Datum-Query als ISO | 2 | since=2024-01-02T03:04:05.000Z (oder ohne ms) und day=2024-01-02 — kein 'Tue Jan 02 ...' toString. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-QUERY-BOOLEAN` Boolean-Query | 1 | flag=true / flag=false (false wird gesendet). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-HEADER-PARAM` Header-Parameter gesendet | 3 | X-Request-Id und X-Retry-Count (als '3') werden als Header gesendet; X-Trace-Flags als 'a,b'. | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ |
| `R-COOKIE-PARAM` Cookie-Parameter | 1 | Generator bietet Cookie-Parameter an UND setzt Cookie-Header (im Browser i. d. R. unmöglich → unsupported ist ehrlich). | ➖ | ❌ | ➖ | ➖ | ➖ | ❌ | ❌ |
| `R-NAME-RESERVED-PARAM` Umbenannte Parameter mit Originalnamen am Wire | 2 | /params/reserved/x?default=d&page-size=5&filter.name=n (Originalnamen). | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

### Runtime: Request-Bodies

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `R-BODY-JSON` JSON-Body | 3 | Method POST, Body ist das Objekt (bzw. JSON-String davon) unverändert, Content-Type application/json (explizit oder durch HttpClient). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-NULL-SEND` null-Felder bleiben erhalten | 2 | nickname: null ist im gesendeten Body enthalten (nicht entfernt). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-BODY-MERGE-PATCH` application/merge-patch+json | 2 | Method PATCH, Content-Type application/merge-patch+json, Body JSON-serialisierbar korrekt. | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `R-BODY-FORM-URLENCODED` x-www-form-urlencoded | 2 | Body serialisiert zu username=u&password=p&remember=true (Reihenfolge egal), Content-Type application/x-www-form-urlencoded. Ein JSON-Body = fail. | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ |
| `R-BODY-MULTIPART` multipart/form-data | 3 | Body ist FormData mit title, file (Blob) und attachments (2 Einträge); KEIN manuell gesetzter Content-Type ohne boundary. | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| `R-BODY-MULTIPART-JSON-PART` JSON-Part in multipart | 1 | meta-Part ist JSON-String {"author":...} (oder Blob type application/json), nicht '[object Object]'. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `R-BODY-OCTET` Binary-Body | 2 | Body ist der übergebene Blob, Content-Type application/octet-stream, Method PUT. | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ |
| `R-BODY-TEXT` text/plain Body | 2 | Body ist der String (nicht JSON-gequotet '"hello"'), Content-Type text/plain. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ |
| `R-BODY-POLYMORPHIC` Polymorpher Body unverändert | 1 | {kind:'circle', radius: 2} wird unverändert gesendet. | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-NAME-SPECIAL-PROPS` Sonder-Property-Namen am Wire | 3 | Gesendeter Body und geparster Response-Body nutzen exakt 'x-request-id', '@type', '1stPlace' etc. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Runtime: Responses

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `R-RESP-204` 204 ohne Body | 2 | Observable/Promise completes ohne Fehler bei leerem Body. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-RESP-BLOB` Binary Response als Blob | 3 | Request hat responseType 'blob' (bzw. arraybuffer) und Ergebnis ist Blob mit Inhalt. | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `R-RESP-TEXT` Text-Response | 2 | Request hat responseType 'text'; Ergebnis ist der rohe String (kein JSON-Parse-Fehler). | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| `R-RESP-VENDOR-JSON` Vendor-JSON geparst | 1 | application/vnd.bench.v1+json wird als JSON geparst (Objekt, nicht String); Accept enthält den Vendor-Typ. | ✅ | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ |
| `R-ACCEPT-HEADER` Accept-Header passend | 1 | JSON-Variante sendet Accept application/json; PDF-Variante (falls wählbar) application/pdf mit responseType blob. | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `R-RESP-DATE-CONSISTENT` Datums-Typ = Laufzeitwert | 3 | Wenn dateTime als Date typisiert: Wert ist instanceof Date. Wenn string typisiert: Wert ist string. Abweichung = fail (Lüge im Typ). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `R-RESP-201-LOCATION` Response-Header zugreifbar | 2 | Über eine Client-API (observe: 'response', Response-Wrapper o. ä.) ist Header Location und Status 201 auslesbar. | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ | ✅ |
| `R-ERROR-BODY` Fehler-Body erreichbar | 3 | Bei 404 schlägt der Aufruf fehl (error-Kanal/throw) und der Problem-Body (title) ist auslesbar. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

### Runtime: Security

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `R-AUTH-BEARER` Bearer-Token über Client-Konfiguration | 2 | Über generierte Konfiguration (nicht manueller Interceptor) gesetzter Token → Authorization: Bearer <token>. | ➖ | ✅ | ➖ | ❌ | ➖ | ➖ | ➖ |
| `R-AUTH-APIKEY-HEADER` API-Key Header | 2 | Über Konfiguration → Header X-API-Key: <key> nur bei dieser Operation. | ➖ | ✅ | ➖ | ❌ | ➖ | ➖ | ➖ |
| `R-AUTH-APIKEY-QUERY` API-Key Query | 1 | Über Konfiguration → ?api_key=<key>. | ➖ | ✅ | ➖ | ❌ | ➖ | ➖ | ➖ |
| `R-AUTH-BASIC` Basic Auth | 1 | Über Konfiguration (user/pass) → Authorization: Basic base64(user:pass). | ➖ | ✅ | ➖ | ❌ | ➖ | ➖ | ➖ |
| `R-AUTH-OAUTH2` OAuth2 Access-Token | 1 | Über Konfiguration → Authorization: Bearer <accessToken>. | ➖ | ✅ | ➖ | ❌ | ➖ | ➖ | ➖ |
| `R-AUTH-NONE` Keine Credentials bei security: [] | 2 | Trotz konfiguriertem Bearer-Token sendet authPublic KEINEN Authorization-Header. Zählt nur, wenn R-AUTH-BEARER besteht (positive Kontrolle; sonst übernimmt das Skript dessen Status). | ➖ | ✅ | ➖ | ❌ | ➖ | ➖ | ➖ |

### Angular First-Class

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `A-PROVIDE-FN` Standalone-Provider/Config ohne NgModule | 2 | Konfiguration (baseUrl etc.) über provideXxx()/DI-Token in providers: [...] ohne NgModule.forRoot möglich (Test: TestBed mit nur providers). | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ➖ |
| `A-BASEURL` Base-URL per DI konfigurierbar | 3 | Mit konfigurierter Base-URL 'http://test.local/api' geht getPet(1) an http://test.local/api/pets/1. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `A-INJECT` Injectable/inject()-kompatibel, providedIn root | 2 | Service/Funktionen nutzbar via inject() ohne manuelles Providen (providedIn: 'root') bzw. Funktionen nehmen HttpClient aus DI-Kontext. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `A-HTTPCLIENT` Nutzt Angular HttpClient | 3 | Requests laufen über HttpClient (sichtbar für HttpTestingController). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `A-INTERCEPTORS` Funktionale Interceptors greifen | 3 | provideHttpClient(withInterceptors([fn])) — fn setzt Header X-Intercepted, Request trägt ihn. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `A-HTTPCONTEXT` HttpContext pro Aufruf | 2 | Ein HttpContext (Token) kann pro Aufruf übergeben werden und ist am Request sichtbar. | ✅ | ✅ | ✅ | ➖ | ✅ | ✅ | ➖ |
| `A-OBSERVE-RESPONSE` observe: 'response' / Events | 2 | HttpResponse<Pet> (Status/Headers) pro Aufruf abrufbar, typisiert. | ✅ | ✅ | ✅ | ❌ | ✅ | ➖ | ➖ |
| `A-REPORT-PROGRESS` Upload-Progress | 1 | reportProgress/observe events für uploadFiles möglich (Request hat reportProgress=true). | ➖ | ✅ | ✅ | ➖ | ✅ | ➖ | ➖ |
| `A-OBSERVABLE-COLD` Cold Observable / Abbruch | 2 | Kein Request vor subscribe (bzw. bei Promise: dokumentiert fail); unsubscribe bricht Request ab (req.cancelled). | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ |
| `A-HTTPRESOURCE` Signal-basiert: httpResource/resource | 2 | Generator liefert Signal-API (httpResource o. ä.) für GET-Operationen; Test: Resource-Wert nach flush = Pet. | ➖ | ➖ | ✅ | ✅ | ✅ | ➖ | ➖ |
| `A-ZONELESS` Zoneless lauffähig | 1 | Tests laufen mit provideZonelessChangeDetection() (Angular-22-Default) ohne zone.js. | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ➖ |
| `A-TREESHAKE` Tree-shakeable | 2 | Wird vom Benchmark-Skript gemessen (Bundle eine Operation vs. alle). pass, wenn das one-op-Bundle keinen Code fremder Operationen (deren Pfad-Literale) enthält. | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

### Statisch: Doku & Code-Qualität

| Case | W | Erwartung | ng-openapi-gen | OpenAPI Generator (typescript-angular) | Orval | Hey API (openapi-ts) | ng-openapi | NSwag (TypeScript, Template Angular) | openapi-typescript + openapi-fetch |
|---|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `S-DEPRECATED-OP` @deprecated an Operation | 1 | Generierte Methode/Funktion trägt JSDoc @deprecated. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ➖ |
| `S-DEPRECATED-PROP` @deprecated an Property | 1 | Property legacyCode trägt JSDoc @deprecated. | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| `S-JSDOC-DESCRIPTION` Beschreibungen als JSDoc | 1 | 'Status eines Pets' und 'Liste Pets (paginiert)' erscheinen als Kommentare. | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ |
| `S-NO-ANY-MODELS` Kein any in Modellen | 2 | Wird vom Benchmark-Skript gemessen (any-Zähler); pass, wenn 0 explizite any im Model-Teil. | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| `S-STRICT-COMPILE` Kompiliert unter Angular-CLI-strict | 3 | Wird vom Benchmark-Skript gemessen: 0 Fehler mit Angular-CLI-Default-tsconfig (strict + noImplicitOverride + noPropertyAccessFromIndexSignature + noImplicitReturns + noFallthroughCasesInSwitch + isolatedModules). | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| `S-MAX-STRICT-COMPILE` Kompiliert unter max-strict | 1 | Wird vom Benchmark-Skript gemessen: 0 Fehler zusätzlich mit exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax, noUnusedLocals/Parameters. | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| `S-NO-RUNTIME-DEPS` Keine Laufzeit-Abhängigkeiten außer Angular/RxJS | 1 | Wird vom Benchmark-Skript gemessen: generierter Code importiert nur @angular/*, rxjs, tslib (oder sich selbst). | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

## Highlights & Probleme je Generator

### ng-openapi-gen 1.1.0

- ➕ Sehr robuste Wire-Serialisierung: alle Query-Styles (explode/csv/pipe/space/deepObject/form-object), Pfad-Encoding, form-urlencoded, multipart inkl. JSON-Part als application/json-Blob
- ➕ Funktionale API (fn/* + Api.invoke) → tree-shakeable, HttpContext pro Aufruf, invoke$Response für Header/Status
- ➕ Nur @angular/* + rxjs, kompiliert unter Angular-CLI-strict fehlerfrei
- ➕ 3.1 gut: const, type-Arrays mit null, prefixItems → Tupel, const-Discriminator narrowt
- ➖ discriminator wird ignoriert: Shape-Varianten haben kind: string → kein Narrowing (oneOf und allOf-Vererbung)
- ➖ readOnly/writeOnly ignoriert: Request-Pet verlangt id, Response-Pet enthält secretChipCode
- ➖ Mehrere 2xx: nur erster Response-Typ (Pet statt Pet | Job)
- ➖ Keine Fehlertypen pro Operation (nur HttpErrorResponse.error: any); additionalProperties: true → any
- ➖ Keine securitySchemes-Unterstützung (Auth nur via eigener Interceptor), Cookie-Parameter verworfen, kein reportProgress, kein httpResource
- ➖ Binary-Body: Content-Type = blob.type statt application/octet-stream (untypisierter Blob → kein Content-Type)
- ➖ Array-Header (simple) als mehrere Header-Zeilen statt 'a,b'
- Details: [generators/ng-openapi-gen/NOTES.md](../generators/ng-openapi-gen/NOTES.md)

### OpenAPI Generator (typescript-angular) 7.25.0 (Generator-JAR; CLI-Wrapper 2.41.0)

- ➕ Sehr korrektes Wire-Format: alle Query-Styles (form/explode, pipe, space, deepObject, form-object), Pfad-Encoding, Header, urlencoded, Multipart inkl. JSON-Part als Blob, Text/Blob/Vendor-JSON-Response
- ➕ Alle Security-Schemes über Configuration.credentials (pro Operation, security: [] respektiert)
- ➕ Volle HttpClient-Integration: observe body/response/events, reportProgress, HttpContext, transferCache, Accept-Auswahl
- ➕ provideApi() + providedIn: 'root', keine Runtime-Abhängigkeiten außer @angular/* und rxjs
- ➕ Enums als const-Objekt + Union, x-enum-varnames und x-enum-descriptions übernommen
- ➖ oneOf mit Discriminator (Shape) erzeugt ungültiges TypeScript `export type Shape = ;` (TS1110) – bricht jeden Build, der polymorphism.service/index importiert
- ➖ oneOf ohne Discriminator wird zu einem Interface mit ALLEN Feldern aller Varianten verschmolzen (PaymentRequestMethod, PaymentResult); anyOf string|integer → leeres Interface {}
- ➖ readOnly/writeOnly ignoriert: createPet verlangt id; secretChipCode im Response-Typ
- ➖ 204/keine Response → Observable<any>; mehrere 2xx → nur erster Typ; Content-Negotiation ändert Rückgabetyp nicht (PDF als Report typisiert)
- ➖ Kein typisierter Fehlerkanal; Cookie-Parameter angeboten, aber stillschweigend nicht gesendet
- ➖ uniqueItems → Set<string> ohne Laufzeitkonvertierung (Typ-Lüge); additionalProperties: true → any
- ➖ 3.1: Webhook überschreibt Default-Service, const → any, prefixItems → Array<any>, oneOf(const) zu Interface verschmolzen
- ⚠️ Workaround: model/shape.ts ist ungültiges TS ('export type Shape = ;') → Tests importieren einzelne Service-Dateien statt Barrel; polymorphism.service nicht importierbar (R-BODY-POLYMORPHIC als ❌ gewertet), all-ops-Bundle nicht baubar
- Details: [generators/openapi-generator/NOTES.md](../generators/openapi-generator/NOTES.md)

### Orval 8.39.0

- ➕ httpResource-Funktionen pro GET mit Signal-Parametern, defaultValue-Overload, HttpContext/Header-Extension
- ➕ observe body/response/events als typisierte Overloads, HttpContext/reportProgress via options
- ➕ Content-Negotiation: reportByAccept('application/json'|'application/pdf') mit korrekten Overloads
- ➕ deepObject/form-explode-Objekt-Query korrekt, 0/false werden gesendet
- ➕ readOnly-Strip für Request-Bodies, const-Enums mit x-enum-varnames, Discriminator-Mapping-Literale
- ➕ OpenAPI 3.1 sehr gut (Tupel, const, null-Unions)
- ➖ Strict-Compile-Fehler: integer-Header-Parameter (X-Retry-Count: number) wird ungecastet an HttpClient-headers übergeben (TS2322/TS2769) — Service + Resource
- ➖ Strict-Compile-Fehler: reportByAcceptResource (httpResource bei Content-Negotiation) — parse-Typ Report vs Blob inkompatibel
- ➖ x-www-form-urlencoded als URLSearchParams ohne Content-Type → Angular sendet Content-Type: application/json
- ➖ merge-patch+json / octet-stream / Vendor-Accept: Content-Type bzw. Accept werden nicht gesetzt
- ➖ Query-Arrays immer explode (form explode:false, pipeDelimited, spaceDelimited ignoriert)
- ➖ securitySchemes komplett ignoriert (keine Auth-Konfiguration), Cookie-Parameter fehlen
- ➖ writeOnly nicht berücksichtigt (secretChipCode im Response-Typ), keine operationsgebundenen Error-Typen
- ➖ TData-Generic mit Default auf jeder Methode — Aufrufer kann Response-Typ beliebig umdeklarieren
- ➖ options.headers/params als HttpHeaders/HttpParams-Instanz werden per Object-Spread zerstört
- ➖ Spec-Validator-Fehlalarm bei Property '$ref' erzwingt unsafeDisableValidation
- ⚠️ Workaround: tsconfig.spec.json noCheck: true – generierter Code kompiliert nicht strict (Header-Param number an HttpHeaders, reportByAcceptResource), Angular-Test-Build bräche sonst ab
- Details: [generators/orval/NOTES.md](../generators/orval/NOTES.md)

### Hey API (openapi-ts) 0.99.0

- ➕ Sehr gute Modell-Typen: Writable-Varianten (readOnly/writeOnly getrennt), Literal-Unions, Tupel aus prefixItems, const, Webhook-Typen
- ➕ Fehler-Typen pro Operation (GetPetError) + typisierte Result-Union
- ➕ Flache, tree-shakeable SDK-Funktionen; httpResource-Funktionen je Operation
- ➕ Query-Styles (form/pipe/space/deepObject) und multipart/urlencoded korrekt
- ➕ Kompiliert unter Angular-CLI-strict fehlerfrei, keine externen Runtime-Deps
- ➖ Auth komplett wirkungslos im Angular-Client: setAuthParams() läuft NACH dem Bau des HttpRequest (Header/Query-Token gehen verloren)
- ➖ Kein responseType: Blob-/Text-Responses werden als JSON angefragt (downloadFile/postText kaputt)
- ➖ Kein Accept-Header, Content-Negotiation (JSON/PDF) nicht wählbar
- ➖ Number-Header (X-Retry-Count) wird roh in HttpHeaders.set() gesteckt → HttpHeaders korrupt (TypeError)
- ➖ SDK-Promise eager, kein HttpContext/reportProgress; response typisiert als HttpResponse<{200: Pet}>
- ➖ Cookie-Parameter werden stillschweigend verworfen; 3.1 enum mit null verliert null; Discriminator-Literal nur in Union, nicht in Circle
- Details: [generators/hey-api/NOTES.md](../generators/hey-api/NOTES.md)

### ng-openapi 0.4.1

- ➕ Angular-idiomatisch: providedIn-root-Services mit inject(), provideXxxClient(), observe body/response/events-Overloads, HttpContext/reportProgress/withCredentials pro Aufruf
- ➕ httpResource-Plugin: Resource-Klassen (providedIn root) für alle GET-Operationen, Parameter als Signal oder Wert, defaultValue-Overload typisiert
- ➕ Form-urlencoded und Multipart (FormData, kein manueller Content-Type) korrekt
- ➕ Exakte Property-Namen (quoted), Schema-Namens-Sanitizing (user-profile → UserProfile), Kollision Date/Object korrekt typisiert (bei dateType string)
- ➕ 3.1: type-Arrays mit null, const, enum mit null, const-Discriminator funktionieren
- ➖ Crash bei enum mit null-Wert (3.0 nullable enum) — Generierung der Bench-Spec ohne Workaround unmöglich
- ➖ Fehlende Imports in Services: Report und PaymentRequest werden nicht importiert → stillschweigend globale DOM-Typen (durch // @ts-nocheck verdeckt)
- ➖ Bodies verworfen: application/merge-patch+json, application/octet-stream, text/plain → Methode ohne Body-Parameter, body: null
- ➖ Header- und Cookie-Parameter werden komplett verworfen
- ➖ Keine Security-Unterstützung (Bearer/API-Key/Basic/OAuth2)
- ➖ Pfad-Parameter nicht encodiert; Query-Styles (form explode:false, pipe/space, deepObject) ignoriert — Arrays immer explode, deepObject flach ohne Präfix
- ➖ Multipart-JSON-Part als String(meta) → '[object Object]'
- ➖ Discriminator ignoriert (kind: string, kein Narrowing), readOnly/writeOnly ignoriert, x-enum-varnames ignoriert
- ➖ Inline-Schemas von Operationen → Record<string, any>; 204/leere Responses → Observable<any>; mehrere 2xx → nur erstes
- ➖ Alle generierten Dateien mit // @ts-nocheck — Strict-Compile-Ergebnis daher wenig aussagekräftig
- ➖ package.json main zeigt auf nicht existierendes index.cjs
- ⚠️ Workaround: In-Memory-Spec-Patch in generate.mjs: null aus enum-Listen von Schemas mit nullable: true entfernt (NullableColor: [red, green, blue, null] → [red, green, blue]), weil ng-openapi 0.4.1 bei enum-Wert null in toEnumKey(null) mit TypeError abstürzt (beide enumStyles). Originalspec wird immer zuerst versucht.
- Details: [generators/ng-openapi/NOTES.md](../generators/ng-openapi/NOTES.md)

### NSwag (TypeScript, Template Angular) 14.7.1 (NJsonSchema 11.6.1, .NET-Runtime Net80)

- ➕ Robuste Basis-Operationen: Pfad-Encoding, Query-Primitives inkl. 0/false, explode-Arrays, Header, JSON/merge-patch/urlencoded/text/octet-Bodies, Vendor-JSON, Multipart-JSON-Part
- ➕ providedIn: 'root' + InjectionToken API_BASE_URL + HttpContext pro Aufruf; interceptor-fähig, cold Observables
- ➕ Fehler-Responses werden als ApiException mit geparstem result (Problem) geworfen
- ➕ readOnly-Felder als `readonly`, Enums als Literal-Unions, Sonder-Property-Namen korrekt gequotet
- ➕ Nur @angular/* + rxjs, eine Datei
- ➖ Reservierte Parameternamen (class, default) nicht escaped → ungültiges TS, ganze Datei bricht (Operation ausgeschlossen)
- ➖ Shape (oneOf + discriminator mapping): Circle wird nie generiert, listShapes referenziert undefiniertes Anonymous2 (TS2552) → Angular-Build bricht (Shim tests/anonymous2-shim.d.ts nötig); Shape = { [key: string]: any }
- ➖ Jedes Modell ohne explizites additionalProperties: false bekommt `[key: string]: any` → Tippfehler in Keys werden nicht erkannt; oneOf/anyOf → leere any-Interfaces bzw. nur erste Variante (method: CardPayment)
- ➖ Query-Styles ignoriert: csv/pipe/space als explode, deepObject/form-object als [object Object]; Cookie-Parameter angeboten aber verworfen
- ➖ Multipart: optionale Parts (meta, attachments) werfen 'cannot be null' beim Weglassen; required title/file als optional typisiert, file als FileParameter { data: any }
- ➖ multiStatus: 202 (Job) wird als ApiException geworfen statt Pet | Job; Content-Negotiation nur JSON
- ➖ Keine securitySchemes-Unterstützung, kein observe/reportProgress pro Aufruf, kein httpResource; responseType immer 'blob' (eigener Parser)
- ➖ x-enum-varnames ignoriert, deprecated an Properties ignoriert, writeOnly ignoriert, Fehler-Body ApiException.result: any
- ⚠️ Workaround: Operation reservedParamNames per excludedOperationIds ausgeschlossen – NSwag erzeugt sonst Syntaxfehler (TS1390, Parameter 'class'), der die ganze Datei bricht (gewertet als ❌: S-STRICT-COMPILE, S-MAX-STRICT-COMPILE)
- ⚠️ Workaround: tests/anonymous2-shim.d.ts (nur Runtime-Tests): NSwag referenziert nicht existierenden Typ Anonymous2 (listShapes)
- Details: [generators/nswag/NOTES.md](../generators/nswag/NOTES.md)

### openapi-typescript + openapi-fetch 7.13.0 (+ 0.17.0)

- ➕ Sehr hohe Typpräzision (75/77 Typ-Cases): Discriminator-Literale, readOnly/writeOnly getrennt, Fehler-Body pro Operation typisiert
- ➕ 3.1 vollständig: const, type-Arrays mit null, prefixItems-Tupel, Webhooks
- ➕ Namen 1:1 (WeirdNames, user-profile, reserved params) – kein Umbenennen, nichts kaputt am Wire
- ➕ Strict + max-strict-Compile fehlerfrei; ein generiertes File, Runtime = ein kleines Modul
- ➖ Runtime kennt Spec nicht: jeder Body JSON.stringify + Content-Type application/json (form, multipart, octet, text, merge-patch falsch)
- ➖ Response immer JSON.parse ohne parseAs → Text/Binary werfen SyntaxError; kein Accept-Header
- ➖ Query-Stile nicht pro Parameter: pipe/space/csv/form-object falsch (nur globaler querySerializer)
- ➖ Readable<T> zerlegt Blob in Mapped Type → Binary-Response-Typ ist kein Blob
- ➖ Keine Angular-Integration (kein HttpClient/Interceptor/DI/Resource), keine Auth-Konfiguration
- ➖ --array-length erzeugt mit prefixItems falsches Tupel
- Details: [generators/openapi-fetch/NOTES.md](../generators/openapi-fetch/NOTES.md)

