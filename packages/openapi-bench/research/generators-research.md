# OpenAPI → TypeScript/Angular client generators — state as of 2026-10-02

Scope: Angular first-class support, type safety, correctness.
Method: npm registry + npm downloads API + GitHub API (queried 2026-10-02), official docs/READMEs, plus a **hands-on smoke test**: every Angular generator was run against one small spec and the output was type-checked with TypeScript 6.0.3 + `@angular/core`/`@angular/common` 22.2.1 (`--strict`, plus an "extra strict" pass with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noPropertyAccessFromIndexSignature`).

Notation: **verified** = observed in generated code / registry / API; **docs** = taken from official docs, not tested; **unverified** = could not confirm.

Context: Angular 22.0.0 shipped 2026-06-03 (latest 22.2.1); `httpResource` exists since 19.2 (2025-02-26).

---

## 1. Summary matrix

### 1.1 Project facts (queried 2026-10-02)

| Tool | Latest | Released | License | Runtime | Weekly npm DL | GH stars | Open issues+PRs | Last push |
|---|---|---|---|---|---|---|---|---|
| OpenAPI Generator `typescript-angular` | **7.25.0** (Maven) / CLI wrapper `@openapitools/openapi-generator-cli` 2.41.0 | 2026-08-24 / 2026-08-24 | Apache-2.0 | **Java 11+** (jar), wrapper needs Node ≥22 | 1,711,294 (wrapper, all generators) | 26,771 | 5,759 | 2026-10-02 |
| ng-openapi-gen (cyclosproject) | 1.1.0 | 2026-09-23 | MIT | Node | 211,468 | 457 | 41 | 2026-09-23 |
| ng-openapi (ng-openapi org) | 0.4.1 (+ `@ng-openapi/http-resource` 0.2.0, `@ng-openapi/zod` 0.2.1) | 2026-09-24 | MIT | Node ≥20 | 3,687 | 74 | 17 | 2026-09-24 |
| orval (`client: 'angular'`) | 8.39.0 | 2026-09-30 | MIT | Node ≥22.18 | 2,797,909 | 6,498 | 18 | 2026-10-02 |
| @hey-api/openapi-ts | 0.99.0 (latest tag); `next` canary 2026-09-30 | 2026-06-22 | MIT | Node ≥22.18 | 6,096,695 | 5,464 | 662 | 2026-09-30 |
| NSwag (npm `nswag`) | 14.7.1 | 2026-04-20 | MIT | **.NET 8/9/10 runtime** (npm pkg ships binaries) | 86,116 | 7,364 | 2,059 | 2026-09-07 |
| openapi-typescript | 7.13.0 | 2026-02-11 | MIT | Node | 9,501,744 | 8,389 (monorepo) | 284 | 2026-09-25 |
| openapi-fetch | 0.17.0 | 2026-02-11 | MIT | Node / any fetch runtime | 11,390,475 | (same repo) | (same) | (same) |

Notes:
- Maven Central search index still reports 7.14.0, but `maven-metadata.xml` and GitHub releases show **7.25.0** (2026-08-24). Sources: https://repo1.maven.org/maven2/org/openapitools/openapi-generator-cli/maven-metadata.xml, https://github.com/OpenAPITools/openapi-generator/releases/tag/v7.25.0
- `@hey-api/client-angular` is **not a separate npm package** (404). It is a plugin name bundled inside `@hey-api/openapi-ts`; client runtime is emitted into the output folder.
- ng-openapi-gen repo moved to `cyclosproject/ng-openapi-gen` (the `cyclosible` name in the task does not exist on GitHub).
- Open-issue counts from GitHub include PRs. orval triages aggressively (18 open), OpenAPI Generator has a large backlog (5.7k, all languages).

### 1.2 Angular feature matrix (verified on generated output unless marked)

| Feature | OAG typescript-angular 7.25 | ng-openapi-gen 1.1.0 | ng-openapi 0.4.1 | orval 8.39 angular | hey-api 0.99 angular | NSwag 14.7 Angular |
|---|---|---|---|---|---|---|
| OpenAPI 2.0 | yes | no (use ng-swagger-gen) | docs say yes; bug #124 (bodies ignored) | yes (converted) | yes (docs, long-standing) | yes |
| OpenAPI 3.0 | yes | yes | yes | yes | yes | yes |
| OpenAPI 3.1 | **beta** (warning printed) | yes (since 1.0) | yes (smoke test ok) | yes | yes | partial/unverified (NJsonSchema) |
| OpenAPI 3.2 | no (`query` ops dropped, #24212) | unverified/no | unverified/no | partial (HTTP `QUERY` method, #3729 closed 2026-07) | in progress (#2660 open) | no |
| DI style in services | **constructor** `@Optional() @Inject(BASE_PATH)` | **constructor** | `inject()` | `inject()` | `inject()` inside `provideAppInitializer` / per-request injector | **constructor** `@Inject` |
| Standalone provider fn | `provideApi(basePath\|config)` | `provideApiConfiguration(rootUrl)` (since 1.0.5) | `provide<ClientName>Client({basePath, interceptors, enableDateTransform})` | `provide<Api>BaseUrl` / `provide<Api>BaseUrlResolver` (DI base URL option) | `provideHeyApiClient(client)` | none (InjectionToken `API_BASE_URL`) |
| Output shape | class services (`providedIn: root`) | **functions** per operation + `Api.invoke(fn, params)`; tag services optional | class services; optional `@Service()` (Angular 22+) | class service per tag; `httpResource` functions | **functions** (SDK) or `asClass` services; `HttpRequest` factories + `httpResource` functions | single class (or per controller) |
| Return type | Observable | **Promise by default** (`promises: true`), Observable opt-in | Observable | Observable | **Promise** (`RequestResult`) | Observable |
| `httpResource` | no (PR #22537 open, GET-only) | no ("won't be implemented", #351) | yes, plugin `@ng-openapi/http-resource` | **yes** (`retrievalClient: 'httpResource' \| 'both'`) | yes (`@angular/common` plugin, `httpResources: true`, beta) | no (#5390 open) |
| TanStack Angular Query | no | no | no | **yes** (`client: 'angular-query'`) | yes (`@tanstack/angular-query-experimental` plugin, docs) | no |
| `HttpContext` pass-through | yes (`options.context`) | yes (`context` arg) | yes (`options.context`; also used internally for client routing) | yes (`options.context`, also for resources) | **not in typed options** (unverified at runtime) | opt-in `IncludeHttpContext` |
| `observe: 'response'` | yes (overloads) | via `$Response` variants / `invoke$Response` | yes (overloads) | yes (overloads) | `responseStyle: 'fields'` returns `{data, request, response}` | only `WrapResponses` (experimental) |
| `observe: 'events'` / `reportProgress` | yes / yes | **no** (filters to `HttpResponse`) | yes / yes | yes / yes | **no** (filters to Response event; #2065 open) | no |
| `transferCache` | yes (default true) | no | no | yes | no | no |
| Interceptors (Angular `HttpInterceptorFn`) | yes (uses HttpClient) | yes | yes + per-client scoped interceptors via HttpContext | yes | yes (HttpClient) + own request/response interceptors | yes |
| Tree-shakeable | weak (class per tag) | **strong** (one fn per op; services opt-in) | weak (class per tag) | medium (class per tag; resources are functions) | strong (functions) | weak (one big class) |
| Zoneless | yes (no zone APIs in output) | yes | yes | yes | yes | yes |
| Min Angular | `ngVersion` ≥9 per docs; default 22.0.0; v16 drop announced (#23893) | 16 | peer ≥15; package option documents 16–22 | 19.2 for httpResource; HttpClient output older (unverified exact) | docs for v19 + v20 client | any HttpClient-based (Angular 4.3+); default emits obsolete `OpaqueToken` |

### 1.3 Type-safety matrix (verified on smoke-test spec unless marked)

| Feature | OAG | ng-openapi-gen | ng-openapi | orval | hey-api | NSwag |
|---|---|---|---|---|---|---|
| `oneOf`+discriminator → union | yes `Cat \| Dog` (default); **`taggedUnions=true` emits invalid TS `export type Pet = ;`** | yes | yes | yes | yes, adds `{kind:'cat'} & Cat` tag (strict implicit-mapping semantics) | **broken**: empty `Pet` class, `Cat` dropped, `Anonymous.fromJS` → compile error |
| Enum styles | `as const` object + type (default), `stringEnums`, naming options, `enumUnknownDefaultCase` | `alias` (union, default) + `enumArray`, `upper`/`pascal`/`ignorecase` TS enums, `x-enumNames` | `enum` / `union` | `const` (default) / `enum` / `union` | union types (default); enum options via `@hey-api/typescript` plugin (docs) | `Enum` / `StringLiteral` |
| Date → `Date` | **no** (string only, #20536) | **no** (explicit non-goal) | yes, but via **regex `DateInterceptor`** (any ISO-looking string, not schema-driven) | `useDates` (types only) / `useDatesTransform` (schema-driven runtime) — **not applied in Angular output** (see 3.4) | `@hey-api/transformers` `dates: true` (schema-driven) — **unions & httpResource not transformed** (see 3.5) | yes, `DateTimeType` Date/Luxon/DayJS/Moment, class `fromJS` |
| Runtime validation | no | no | `validation.response` parse hook + Zod plugin (beta) | **Zod**, `runtimeValidation` for responses & request bodies | **Zod (v3/v4/mini), Valibot** as `requestValidator`/`responseValidator` | no |
| readOnly | emitted as TS `readonly`, still required in request body | **ignored** | TS `readonly`, still in request body | **stripped** from request bodies via `NonReadonly<T>` (default `strip`) | **separate `XxxWritable` types** for requests | ignored |
| writeOnly | ignored (kept in response) | ignored | ignored | ignored (kept in response) | excluded from response type | ignored |
| nullable (3.0 `nullable` / 3.1 type arrays) | `\| null` | `\| null` | `\| null` | `\| null` | `\| null` | unverified (Cat not generated) |
| `--strict` compile | ok | ok | ok (**files carry `// @ts-nocheck`**; also ok with it removed) | ok | ok | **fails** (`Anonymous`, `OpaqueToken` default) |
| Extra-strict errors (count) | 4 (`noUnusedLocals`, #20134) | 4 (`exactOptionalPropertyTypes`) | 5 (after removing ts-nocheck) | **0** | 11 (`exactOptionalPropertyTypes`, #2236) | 3 + base errors |

---

## 2. Smoke-test setup (reproducible)

Spec (3.1, also down-converted to 3.0 for NSwag): `GET /pets/{id}` → `Pet = oneOf[Cat, Dog]` with `discriminator.propertyName: kind` + explicit `mapping`; `GET/PUT /cats/{id}` with `Cat` body/response. `Cat` has `kind: const cat`, `id: integer readOnly`, `born: date-time`, `nick: [string, null]`, `secret: writeOnly`. `Dog` has `kind: enum[dog]`, `size: enum[S,M,L]`.

Commands (versions pinned): `ng-openapi -i spec.yaml -o …`; `ng-openapi-gen -i …`; `java -jar openapi-generator-cli-7.25.0.jar generate -g typescript-angular` (with/without `taggedUnions=true`); `orval` with `client:'angular'`, `retrievalClient:'both'`, `useDatesTransform:true`; `openapi-ts` with `@hey-api/client-angular`, `@hey-api/transformers{dates:true}`, `@hey-api/sdk{transformer:true}`, `@angular/common{httpRequests,httpResources}` (and a zod variant); `nswag openapi2tsclient /template:Angular /dateTimeType:Date`.

Local env caveat: Node 22.16 (orval/hey-api declare ≥22.18 but ran fine), Java 11, .NET 8/9.

---

## 3. Per-generator details

### 3.1 OpenAPI Generator — `typescript-angular`

- **Version**: 7.25.0 (2026-08-24). npm wrapper `@openapitools/openapi-generator-cli` 2.41.0 (2026-08-24) downloads the jar; supports any 7.x generator via `openapitools.json` `generator-cli.version`. Requires Java 11+ (jar) — verified with OpenJDK 11.0.15.
  - https://github.com/OpenAPITools/openapi-generator/releases/tag/v7.25.0
  - https://www.npmjs.com/package/@openapitools/openapi-generator-cli
- **Specs**: Swagger 2.0, OAS 3.0; OAS 3.1 "still in beta" (printed warning, verified). OAS 3.2 `query` operations silently dropped (#24212).
- **Angular**:
  - Services: `@Injectable({providedIn:'root'})`, `extends BaseService`, **constructor DI** with `@Optional() @Inject(BASE_PATH)` — no `inject()` (verified).
  - `provideApi(basePathOrConfig)` returning `EnvironmentProviders` (added in PR #21173, 2025-06). `ApiModule.forRoot` still generated.
  - Each method has overloads for `observe: 'body'|'response'|'events'`, positional `reportProgress`, `options.context: HttpContext`, `options.transferCache` (default true), `httpHeaderAccept` (verified).
  - No signals / `httpResource` (PR #22537 open, GET-only proposal). Angular 22 support request #23973 closed 2026-07; default `ngVersion` = 22.0.0. Angular 16 drop announced #23893.
  - Options: `providedIn`, `useSingleRequestParameter`, `withInterfaces`, `queryParamObjectFormat`, `fileNaming`, `enumPropertyNaming`, `stringEnums`, `taggedUnions`, `enumUnknownDefaultCase`, `nullSafeAdditionalProps` …
  - Docs: https://openapi-generator.tech/docs/generators/typescript-angular
- **Type safety**:
  - Enums: per-model namespace with `as const` object + type alias (verified); `stringEnums` → TS enums.
  - Dates: always `string`, no transformation (#20536 open). Date-time query params lose time (#17270).
  - Discriminators: default output `Pet = Cat | Dog` OK. **`taggedUnions=true` produced `export type Pet = ;` (syntax error) for both 3.0 and 3.1 specs** (verified, 7.25.0). Related long-standing issues: #8927 (mapping ignored), #17619, #3092, #2154, #16170.
  - readOnly → TS `readonly` modifier, but same type used for request body (id still required on PUT). writeOnly ignored.
  - Strict TS: compiles; with `noUnusedLocals` 4 errors from unused imports (#20134 open). Generated files use `// @ts-ignore` on imports.
- **Known issues**: nested query object serialization changed 7.11→7.23 (#24059), `@types/node` transitive dep conflict (#19522), huge backlog.

### 3.2 ng-openapi-gen (cyclosproject)

- **Version**: 1.1.0 (2026-09-23); 1.0.0 released 2025-09-19 with changed defaults. MIT. Node only. Peer: `@angular/core >=16`, `rxjs >=6.5`.
  - https://github.com/cyclosproject/ng-openapi-gen, https://www.npmjs.com/package/ng-openapi-gen
- **Specs**: OAS 3.0 and 3.1 only (no Swagger 2 — that is ng-swagger-gen).
- **Angular**:
  - Generates **one function per operation** (`fn/<tag>/<op>.ts`) taking `(http, rootUrl, params, context?)`, plus an `Api` service with `invoke(fn, params, context?)` / `invoke$Response(...)`. Per-tag services opt-in (`services: true`) — README explicitly motivates this by bundle size/tree-shaking.
  - 1.0 defaults: `module: false`, `services: false`, `enumStyle: 'alias'`, `enumArray: true`, **`promises: true`** (Promise return via `firstValueFrom`; `promises:false` for Observables). Issue #400 reports larger bundles with new defaults (open).
  - `Api`/`BaseService` use **constructor DI** (verified template `apiService.handlebars`).
  - `provideApiConfiguration(rootUrl)` since 1.0.5.
  - `HttpContext` passed through (verified). **No `observe: 'events'`/`reportProgress`**: the fn filters to `HttpResponse` (verified).
  - No `httpResource`: maintainer: "won't be implemented" (#351), "no plans" (#359). Custom Handlebars templates are supported, so it could be added locally.
  - Low maintainer bandwidth ("close to zero time", #351), but releases still land (1.0.2–1.1.0 in 2025-09…2026-09).
- **Type safety**:
  - Enums: `alias` union + sibling array (default), or TS enum styles; supports `x-enumNames`.
  - Dates: **always `string`**; README: Date conversion is out of scope.
  - Discriminators: `oneOf` → union (verified); discriminator values written into derived types for allOf chains (`findAllDiscriminators`).
  - readOnly/writeOnly: **not handled** (no references in generator code; `id` stays required in PUT body; verified).
  - nullable → `| null` (verified, 3.1 type arrays).
  - Strict: compiles; 4 errors with `exactOptionalPropertyTypes` (`context: HttpContext | undefined` passed to builder).

### 3.3 ng-openapi (npm `ng-openapi`, org ng-openapi)

- **Version**: 0.4.1 (2026-09-24); plugins `@ng-openapi/http-resource` 0.2.0, `@ng-openapi/zod` 0.2.1 (beta). MIT, Node ≥20, uses ts-morph + ts-node. Peer `@angular/core >=15`. Small project: 74 stars, ~3.7k weekly downloads, 17 open issues, single main maintainer (unverified bus factor).
  - https://github.com/ng-openapi/ng-openapi, https://ng-openapi.dev/, https://ng-openapi.dev/llms-full.txt
- **Specs**: docs say "valid Swagger 2.x or OpenAPI 3.x"; open bug #124 "Swagger 2 request bodies and response schemas are ignored". 3.1 smoke test OK.
- **Angular** (most "Angular-native" output of all tools):
  - Services with **`inject(HttpClient)`** and per-client `BASE_PATH_<CLIENT>` token; optional `serviceDecorator: 'service'` → Angular 22 `@Service()` (pre-release API).
  - `provide<ClientName>Client({ basePath, interceptors, enableDateTransform })`; multiple clients supported, with **client-scoped interceptors** routed via an `HttpContextToken` set on each request.
  - Overloads for `observe: 'body'|'response'|'events'`; `RequestOptions` with `reportProgress`, `context`, `withCredentials`, `responseType` (verified).
  - `httpResource` services via `HttpResourcePlugin` (signals as params, `defaultValue`, `parse` option).
  - `useSingleRequestParameter`, `responseTypeMapping`, `customizeMethodName`, ng-packagr library output (`package` option, Angular 16–22).
  - Open feature gaps: functional `DateInterceptor` (#81 — current one is class-based), optional `providedIn` (#63), DELETE bodies (#50), `explode:false` query params (#60), `x-enumNames` (#31); bugs: formData `String()` wrapping (#29), multipart allOf+$ref (#72), boolean response type mapping (#77), Node 24 config load (#64).
- **Type safety**:
  - Enums: `enum` or `union` (required option).
  - Dates: `dateType: 'Date'` types fields as `Date` and registers a **regex-based interceptor** (`ISO_DATE_REGEX`) that converts every ISO-datetime-looking string in every response — not schema-driven, so plain string fields matching the pattern also become `Date` (correctness risk) and `format: date` (no time) is not converted (verified regex requires `T`).
  - Discriminators: `Pet = Cat | Dog` (verified).
  - readOnly → TS `readonly`, still in request body type; writeOnly ignored.
  - **All generated files start with `// @ts-nocheck`** (verified) — type errors inside generated code are hidden from your build. With the directive removed the sample compiled under `--strict`; 5 errors under extra-strict flags.
  - Runtime validation: `validation.response` adds `parse` hook; Zod plugin (beta).

### 3.4 orval — `client: 'angular'` / `'angular-query'`

- **Version**: 8.39.0 (2026-09-30), MIT, Node ≥22.18. Very high cadence; 18 open issues. ~2.8M weekly downloads (all clients).
  - https://github.com/orval-labs/orval, https://orval.dev/docs/guides/angular, https://orval.dev/docs/guides/angular-query, https://orval.dev/docs/reference/configuration/output
- **Specs**: "any valid OpenAPI v3 or Swagger v2"; 3.1 smoke test OK; HTTP `QUERY` method (3.2) supported since #3729 (closed 2026-07-26).
- **Angular**:
  - Service class per tag with **`inject(HttpClient)`**, `providedIn: 'root'` (verified).
  - `override.angular.retrievalClient`: `httpClient` (default) | `httpResource` | `both` — GET-style operations become `xxxResource(...)` functions returning `HttpResourceRef<T>` (Angular ≥19.2); mutations stay on HttpClient (verified both files generated).
  - Base URL: none by default (relative URLs, use interceptor) or DI-based `provide<Api>BaseUrl` / `provide<Api>BaseUrlResolver` tokens (docs).
  - Options type includes `context`, `reportProgress`, `transferCache`, `timeout`, fetch-backend options (`keepalive`, `priority`, …); overloads for `observe` body/events/response (verified). Resources accept `context` (instance or factory) and extra headers.
  - `client: 'angular-query'` → `injectXxx()` functions for TanStack Query Angular, using HttpClient (`httpClient: 'angular'`).
  - MSW/faker mocks available.
- **Type safety**:
  - Enums: `enumGenerationType` `const` (default) | `enum` | `union`; warns `enum` breaks `erasableSyntaxOnly`.
  - Methods are generic `getPet<TData = Pet>()` — caller can override the response type (convenient but an escape hatch from type safety).
  - Zod: `schemas.type: 'zod'` / zod output; `override.angular.runtimeValidation` validates responses (and optionally request bodies, `strategy`); `generateDiscriminatedUnion` → `z.discriminatedUnion`. Valibot not supported (#2915 open).
  - readOnly: request bodies typed `NonReadonly<T>` (default `preserveReadonlyRequestBodies: 'strip'`) (verified). writeOnly not removed from responses.
  - Dates: `useDates` changes types only; `useDatesTransform` generates schema-driven `deserialize<Op>Response` for axios/fetch. **In the Angular output with `useDatesTransform: true`, fields were typed `Date` but no deserializer was emitted (no `deserialize`/`new Date` anywhere) → type says `Date`, runtime value is `string`** (verified 8.39.0; unverified whether a docs-mentioned interceptor/reviver is the intended Angular path — treat as a gotcha).
  - Strict: 0 errors in both strict and extra-strict passes (best of the set).

### 3.5 @hey-api/openapi-ts — `@hey-api/client-angular` + `@angular/common`

- **Version**: 0.99.0 (2026-06-22, `latest`); daily-ish `next` canaries (latest 2026-09-30). Still **0.x** — breaking changes between minors (see migration guide). MIT, Node ≥22.18 (docs: "Node.js 22+"). ~6.1M weekly downloads (all clients). 662 open issues/PRs.
  - https://github.com/hey-api/hey-api, https://heyapi.dev/docs/openapi/typescript/clients/angular/v20.md, https://heyapi.dev/docs/openapi/typescript/plugins/angular/v20.md, https://heyapi.dev/docs/openapi/typescript/plugins/transformers.md
- **Specs**: 2.0/3.0/3.1 (long-standing claim, unverified for this release); 3.2 tracked in #2660 (open); 3.2 `itemSchema` was silently `unknown` (#4332, closed).
- **Angular** (client + plugin both marked **beta** in docs):
  - Client is a module-level singleton `client`; `provideHeyApiClient(client)` = `provideAppInitializer(() => client.setConfig({ httpClient: inject(HttpClient) }))` (verified). Per-request `injector` option also supported.
  - SDK = **functions** returning **`Promise`** (`RequestResult`), not Observables; `asClass: true` gives `@Injectable` classes. Issue #2746 (Observable responses) open.
  - Request pipeline does `firstValueFrom(httpClient.request(req).pipe(filter(Response)))` → **no progress events / `reportProgress`** (#2065 open).
  - Typed options extend `RequestInit` (fetch types), **not** Angular's request init: no typed `context`/`HttpContext` (verified); `withCredentials`, `transferCache` not typed.
  - `@angular/common` plugin (beta, #4347): `xxxRequest()` → `HttpRequest<T>` factories and `xxxResource(() => options)` → `httpResource<T>` (verified).
  - Known Angular issues: AbortSignal ignored (#4303), `responseType` never set → binary responses unusable (#4217), SSE headers mangled (#4248), Zod `z.void()` fails on 204 (#3752), `exactOptionalPropertyTypes` unsupported (#2236).
- **Type safety** (strongest model layer):
  - Discriminated unions: `Pet = ({kind:'cat'} & Cat) | ({kind:'dog'} & Dog)` (verified with explicit mapping). Note: hey-api applies **implicit mapping = schema name** strictly; with no `mapping` and `kind: const cat`, it produced `{kind:'Cat'} & {kind:'cat'}` = effectively `never` — correct per spec letter, but surprising (verified).
  - readOnly/writeOnly: separate `CatWritable`/`PetWritable` request types; writeOnly fields dropped from response types (verified) — only tool doing both.
  - Validators: Zod v3/v4/mini and Valibot plugins; `validator: true` wires `requestValidator`/`responseValidator` (verified). Zod `discriminatedUnion` emitted.
  - Dates: `@hey-api/transformers { dates: true | 'temporal' }`, schema-driven per-operation transformers (verified for `getCat`). Documented limitations: **unions not transformed**, only `$ref` types, errors not transformed. Verified consequences: `getPet` (union) typed `born: Date`, no transformer → runtime `string`; **`httpResource` functions never apply transformers or validators** (plain `httpResource<T>(() => request)`) → `Date`-typed fields are strings at runtime. Zod variant: `born: z.iso.datetime()` validates string while TS type says `Date` (transformers file was empty for the union).
  - Strict: compiles; 11 errors with `exactOptionalPropertyTypes`.

### 3.6 NSwag — TypeScript `Angular` template

- **Version**: 14.7.1 (2026-04-20), MIT. npm `nswag` bundles .NET CLI binaries (Net80/90/100) → **requires .NET runtime** (verified ran on .NET 8). Commits continue (last push 2026-09-07), large backlog (2,059 open).
  - https://github.com/RicoSuter/NSwag, https://github.com/RicoSuter/NSwag/wiki/TypeScriptClientGenerator
- **Specs**: Swagger 2.0 & OAS 3.0 (README); 3.1 partial (e.g. enums #4839, .NET 10 3.1 binary #5387) — unverified overall.
- **Angular**:
  - `@Injectable()` class with **constructor DI** `@Inject(HttpClient)`, `@Optional() @Inject(API_BASE_URL)`; `UseSingletonProvider` for `providedIn: 'root'`. No provide function.
  - Requests always `observe: 'response', responseType: 'blob'`, then `blobToText` + `JSON.parse(reviver)` + `Model.fromJS` (verified) — heavy, not HttpClient-idiomatic; interceptors that inspect JSON bodies see blobs.
  - `IncludeHttpContext` opt-in; no events/progress; `WrapResponses` experimental for status/headers. No signals/httpResource (#5390 open).
  - **Observed default emitted `OpaqueToken`** (removed in Angular 5+) when `/injectionTokenType` not set → compile error on Angular 22 (verified; pass `/injectionTokenType:InjectionToken`).
- **Type safety**:
  - Class DTOs (`TypeStyle: Class` default) with `fromJS/toJSON`, or interfaces. `DateTimeType`: Date/Luxon/DayJS/MomentJS/string — real schema-driven conversion in class mode.
  - Enums: `Enum` (default) / `StringLiteral`.
  - **`oneOf` + discriminator unsupported**: empty `Pet` class with index signature, `Cat` not generated, `getCat` typed `Observable<Pet>`, `Anonymous.fromJS` → `TS2304` (verified). Long-standing: NSwag #3388/#3390, NJsonSchema #13/#808. Only allOf-inheritance discriminators work.
  - Best fit only for .NET backends with C#-style inheritance.

### 3.7 openapi-typescript 7.13 + openapi-fetch 0.17 (non-Angular baseline)

- openapi-typescript 7.13.0 / openapi-fetch 0.17.0 (both 2026-02-11), MIT, Node. Highest downloads (9.5M / 11.4M weekly). 3.2 support question open (#2577).
  - https://github.com/openapi-ts/openapi-typescript, https://openapi-ts.dev/
- **Specs**: OAS 3.0 & 3.1 (no Swagger 2 in v7).
- **Types only** (`paths`, `components`), zero runtime; flags (verified `--help`): `--enum`, `--enum-values`, `--conditional-enums`, `--dedupe-enums`, `--immutable`, `--read-write-markers` ($Read/$Write for readOnly/writeOnly), `--root-types`, `--default-non-nullable`, `--properties-required-by-default`, `--array-length`, `--path-params-as-types`, `--exclude-deprecated`, `--check`.
- openapi-fetch: ~6 kB fetch wrapper typed against `paths`; own middleware. **No Angular integration**: bypasses `HttpClient` (no Angular interceptors, `HttpContext`, `transferCache`/SSR hydration, `HttpTestingController`). Dates remain strings; no runtime validation. Useful as a "pure type" baseline or to type a hand-written HttpClient wrapper (e.g. `openapi-typescript` types + custom `inject(HttpClient)` helpers).

---

## 4. Others (brief)

| Tool | Status (2026-10-02) | Angular? | Notes |
|---|---|---|---|
| **kubb** (`@kubb/core` 5.4.3, 2026-10-02; 1,812★, 6 open; ~403k DL/wk core) | very active | **no Angular plugin** (plugins: ts, zod, faker, msw, client/axios/fetch, react/vue/solid/svelte-query, swr, cypress, mcp) | Good for types+zod; client is axios/fetch. https://github.com/kubb-labs/kubb |
| **swagger-typescript-api** 13.13.0 (2026-09-18; 4,123★; ~647k DL/wk) | active | no (axios/fetch http clients) | Template-based (eta). https://github.com/acacode/swagger-typescript-api |
| **ng-swagger-gen** 2.3.1 (published 2021-02-26; repo last push 2022-03; 220★) | effectively dead (not flagged deprecated on npm) | Swagger 2.0 only | Predecessor of ng-openapi-gen. https://github.com/cyclosproject/ng-swagger-gen |
| **openapi-typescript-codegen** 0.31.0 (2026-06-20; 3,371★; ~695k DL/wk) | **unmaintained**; README: migrate to @hey-api/openapi-ts | had `--client angular` | Not formally npm-deprecated despite README announcement. https://github.com/ferdikoomen/openapi-typescript-codegen |
| **@angular-architects/\*** | no OpenAPI generator found in the scope (packages are federation, ddd, ngrx-hateoas, …) | — | `@angular-architects/ngrx-hateoas` 22.0.0 is hypermedia/SignalStore, not codegen. |
| **ng-openapi** | new Angular-specific entrant (2025/2026) | yes | See 3.3. |
| openapi-zod-client 1.18.3 (2025-02-10) | slow | no | zodios-based. |

No other Angular-specific OpenAPI generator with meaningful adoption appeared in 2025/2026 beyond ng-openapi and the Angular modes added to orval (httpResource) and hey-api (client-angular, `@angular/common`) (npm search, unverified completeness).

---

## 5. Key correctness findings (from smoke test)

1. **OpenAPI Generator `taggedUnions=true`** → `export type Pet = ;` (invalid TS) for oneOf+discriminator (3.0 & 3.1).
2. **NSwag** cannot model `oneOf` unions (empty class, missing type, undefined `Anonymous`), and its default token type `OpaqueToken` fails on modern Angular.
3. **"Date" types that lie at runtime**:
   - orval Angular + `useDatesTransform` → typed `Date`, no runtime conversion.
   - hey-api transformers → unions and every `httpResource` path not converted.
   - ng-openapi → regex interceptor converts any ISO-datetime-looking string, misses `format: date`.
   - Only NSwag (class DTOs) and hey-api (non-union `$ref`, SDK path) do schema-driven conversion that matched in the test; OAG and ng-openapi-gen honestly keep `string`.
4. **readOnly/writeOnly**: only hey-api (Writable types) handles both; orval strips readOnly from request bodies; others ignore them or only add TS `readonly`.
5. **Hidden type errors**: ng-openapi emits `// @ts-nocheck` in every generated file.
6. **Extra-strict tsconfig**: only orval compiled cleanly with `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess` + `noUnusedLocals`.
7. **Angular idioms**: `inject()` + provide fn + full `observe`/`reportProgress`/`HttpContext` → ng-openapi and orval. hey-api is Promise-based without events/typed context. OAG/ng-openapi-gen/NSwag still use constructor DI.

---

## 6. Source index

- npm registry/API: `npm view <pkg>`; `https://api.npmjs.org/downloads/point/last-week/<pkg>` (queried 2026-10-02)
- GitHub API: `gh api repos/<owner>/<repo>` (stars, open issues, pushed_at)
- OAG: https://openapi-generator.tech/docs/generators/typescript-angular · issues https://github.com/OpenAPITools/openapi-generator/issues/20536 · /20134 · /23893 · /23973 · /24059 · /24212 · /8927 · /17619 · PRs https://github.com/OpenAPITools/openapi-generator/pull/21173 · /22537
- ng-openapi-gen: https://github.com/cyclosproject/ng-openapi-gen#readme · issues /351 · /359 · /400 · releases https://github.com/cyclosproject/ng-openapi-gen/releases
- ng-openapi: https://ng-openapi.dev/ · https://ng-openapi.dev/llms-full.txt · issues https://github.com/ng-openapi/ng-openapi/issues/124 · /81 · /63 · /29 · /72
- orval: https://orval.dev/docs/guides/angular · https://orval.dev/docs/guides/angular-query · https://orval.dev/docs/reference/configuration/output · issues https://github.com/orval-labs/orval/issues/3729 · /2915 · /4124 · /4228
- hey-api: https://heyapi.dev/docs/openapi/typescript/clients/angular/v20.md · https://heyapi.dev/docs/openapi/typescript/plugins/angular/v20.md · https://heyapi.dev/docs/openapi/typescript/plugins/transformers.md · issues https://github.com/hey-api/hey-api/issues/2660 · /4347 · /4303 · /4217 · /4248 · /2065 · /2746 · /2236 · /3752 · /3158
- NSwag: https://github.com/RicoSuter/NSwag · wiki TypeScriptClientGenerator · issues /5390 · /3388 · /3390 · /4839 · /5387 · NJsonSchema https://github.com/RicoSuter/NJsonSchema/issues/13
- openapi-typescript: https://openapi-ts.dev/ · https://github.com/openapi-ts/openapi-typescript/issues/2577
- kubb https://kubb.dev · swagger-typescript-api https://github.com/acacode/swagger-typescript-api · openapi-typescript-codegen https://github.com/ferdikoomen/openapi-typescript-codegen
