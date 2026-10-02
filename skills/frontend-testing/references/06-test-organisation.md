# 06 – Test organisation (Nx: one lib per slice × layer)

Nx workspace layout: libs `libs/<slice>/<layer>`,
tags `scope:<slice>|shared`, `type:<layer>`, `feat:<feat>|none`, generated OpenAPI clients under
`libs/[<domain>/]generated/<client>/{types,api,core,testing}`. Sheriff-based workspaces: same ideas, a `testing`
module per slice with an equivalent dep rule.

## 1. Where things live

```
libs/
  shared/testing/                 scope:shared   type:testing  feat:none   no build target
    src/network.ts                  worker + test fixture + FAKER_SEED (imports no workspace lib)
  <domain>/testing/               scope:<domain> type:testing  feat:none   no build target
    src/fixtures/<domain>.fixture.ts   a<X>() builders
    src/handlers/<domain>.handlers.ts  <domain>Handlers, <domain>Scenarios, default<X>s
    src/index.ts
  [<domain>/]generated/<client>/testing/   type:testing generated   (src/generated/** gitignored)
  <domain>/<layer>/src/
    <file>.ts
    <file>.spec.ts                spec next to the file under test
```

- Spec naming: `<file>.spec.ts` next to the source (`booking.store.spec.ts`, `feat-checkin.spec.ts`).
  Large feature integration tests: one file per scenario (`<feature>.<scenario>.integration.spec.ts`, deck slide 9).
- Where which test lives:

| Test | Lib |
|---|---|
| Unit (pure) | `utils`, or next to the mapper in `data` |
| Port test (generated client + MSW) | `api` |
| Store test | `data` / `feat-<f>/data` |
| Isolated component test | `ui` |
| Feature integration test (container) | `feat-<f>/feature` |
| Routed slice integration test | `shell` (slice routes) |

- The test target is inferred for every lib with a `*.spec.ts` in `src/` (local Nx plugin). Without a plugin:
  `test` target per lib with a spec, same options for all.
- New domain testing lib: workspace generator if present, else `nx g @nx/js:lib libs/<domain>/testing --tags=type:testing,scope:<domain>`.

## 2. Boundaries

| From | May import |
|---|---|
| Production layers (`types…feature`), `app` | **no** `type:testing`, no test packages |
| `type:testing` | only `type:types`, `type:testing`, `scope:shared` (+ `msw`, `openapi-msw`, `@faker-js/faker`, `vitest`) |
| `shared/testing` | no workspace lib (so specs in `shared/*` can use it) |
| Specs (`*.spec.ts`, `*.test.ts`, `test-setup.ts`) | same constraints as their lib **plus** `type:testing` – also a foreign domain's testing lib (a feature spec needs the handlers behind a foreign port) |
| Specs in `type:types` / `scope:shared` | unchanged (types spec → testing would be a cycle; shared never knows a domain) |

Implementation: `examples/eslint.testing.config.mjs` (spec override derived from the production constraints,
`enforceBuildableLibDependency: false` only in specs).

## 3. Protection against production leaks (defence in depth)

| # | Layer | Mechanism |
|---|---|---|
| 1 | Tags | production layers don't list `type:testing`; no `type:*` glob for `feature`/`app` (it would match `type:testing`) |
| 2 | Package bans | `bannedExternalImports`: `msw`, `msw/*`, `vitest`, `vitest/*`, `@vitest/*`, `@testing-library/*`, `playwright`, `playwright/*`, `openapi-msw`, `@faker-js/*` for every production layer + app |
| 3 | No build | testing libs have no `build` target; a buildable lib importing them fails `enforceBuildableLibDependency` |
| 4 | Build inputs | lib build tsconfig excludes `**/*.spec.ts`; Nx `production` named input excludes specs |
| 5 | No worker asset | no committed `mockServiceWorker.js`, no msw in app assets (Vitest serves it) |
| 6 | Bundle scan | `nx build <app>` + scan of the bundle for `msw`, `mockServiceWorker`, `setupWorker`, `vitest`, `faker` (ideally a `verify` target in CI) |
| 7 | No cycles | see §4, no `ignoredCircularDependencies` |

## 4. Avoiding cycles

Nx counts spec imports as project edges (`<domain>-data → <domain>-testing`).
- Testing libs import only types/testing/shared – never `data`, `api`, `feature` of a domain. Domain models they need
  live in `<domain>/types` (e.g. move a DTO from `api` to `types`).
- A lib that has specs importing a testing lib can never be imported by that testing lib.
- Testing libs have no `build` → `^build` skips them, no task cycle. `test` has no `dependsOn: ^build`.

## 5. Shared test infrastructure: what goes where

| Kind | Place |
|---|---|
| Worker, `test` fixture, global seed | `shared/testing` |
| Builders, handlers, scenarios, port fakes of a domain | `<domain>/testing` |
| Generated types/handlers/factories of a client | `<client>/testing` (generated) |
| Setup function used by one spec (`render<Feature>()`, `navigateTo()`) | local in the spec |
| Setup used by several specs | provider/fake helpers (`provide<Domain>Testing()`) in `<domain>/testing`; the component/routes stay a parameter or a spec-local import – testing libs must not import `feature`/`shell` |

Don't use global `setupFiles` with handlers or a `providersFile` for test setup. Keep test setup visible in the spec.
