# 06 – Test organisation (Nx: one lib per slice × layer)

Workspace layout (→ `docs/nx-reduziert.md`): vertical slices (`booking`, `checkin`, `layout` — a slice is a
self-contained feature, not necessarily a business domain), libs `libs/<slice>/<layer>` and
`libs/<slice>/feat-<feat>/<layer>`, layers `types`, `utils`, `data-access`, `state`, `ui`, `feature`/`shell`,
`testing`. Tags `scope:<slice>|shared`, `type:<layer>`, `feat:<feat>|none`, `entry` (shell). Generated OpenAPI
clients under `libs/[<slice>/]generated/<client>/{types,api,core,testing}`. No ports: a slice never imports another
slice, a feat never a sibling feat.

## 1. Where things live

```
libs/
  shared/testing/                 scope:shared   type:testing  feat:none   no build target
    src/network.ts                  worker + test fixture + FAKER_SEED (imports no workspace lib)
    src/handlers.ts                 withBaseline, Scenarios
  <slice>/testing/                scope:<slice>  type:testing  feat:none   no build target
    src/fixtures/<x>.fixture.ts       a<X>() builders → generated DTOs
    src/handlers/<slice>.handlers.ts  <slice>Handlers (= withBaseline(curated, <client>Handlers…)), <slice>Scenarios, default<X>s
    src/index.ts
  [<slice>/]generated/<client>/testing/   type:testing generated   (src/generated/** gitignored)
  <slice>/<layer>/src/
    <file>.ts
    <file>.spec.ts                spec next to the file under test
```

- Spec naming: `<file>.spec.ts` next to the source (`booking.store.spec.ts`, `feat-checkin.spec.ts`).
  Large feature integration tests: one file per scenario (`<feature>.<scenario>.integration.spec.ts`, deck slide 9).
- Where which test lives:

| Test | Lib |
|---|---|
| Unit (pure) | `utils` (`shared/utils`, `<slice>/utils`) |
| Data-access test (wrapper + generated client + MSW) | `data-access` |
| Store test (incl. domain events) | `state` / `feat-<f>/state` |
| Isolated component test | `ui` / `feat-<f>/ui` |
| Feature integration test (container) | `feat-<f>/feature` |
| Routed slice integration test | `shell` (slice routes) |

- Test target: explicit config. A lib with specs carries `"test": {}` in `project.json` and a `tsconfig.spec.json`;
  the body is `nx.json → targetDefaults.test` (`02-toolset.md` §3). `pnpm verify` reports a missing or superfluous one.
- New slice testing lib: `nx g @mo-transfer/tooling-workspace:testing <slice>` (or part of `…:domain <slice>`).
  Never `@nx/angular:library`/`@nx/js:lib` — the workspace generators write tags, config, `paths` and the scope list.

## 2. Boundaries

| From | May import |
|---|---|
| Production layers (`types…feature`), `app` | **no** `type:testing`, no test packages |
| `type:testing` | only `type:types`, `type:testing`, `scope:shared` (+ `msw`, `openapi-msw`, `@faker-js/faker`, `vitest`) |
| `shared/testing` | no workspace lib (so specs in `shared/*` can use it) |
| Specs (`*.spec.ts`, `*.test.ts`, `test-setup.ts`) | same constraints as their lib **plus** `type:testing` — but only of the **own slice** and `shared`: the scope rules stay, a foreign slice's testing lib is blocked (there is no cross-slice code to test against) |
| Specs in `type:types` | unchanged (testing libs build on types: a types spec importing them would be a cycle) |

Implementation: `eslint.config.mjs` (`specDepConstraints` derived from the production constraints,
`enforceBuildableLibDependency: false` only in specs); excerpt in `examples/eslint.testing.config.mjs`.
`pnpm verify` proves the cases (e.g. spec → foreign slice's testing blocked).

## 3. Protection against production leaks (defence in depth)

| # | Layer | Mechanism |
|---|---|---|
| 1 | Tags | production layers don't list `type:testing`; no `type:*` glob for `feature`/`app` (it would match `type:testing`) |
| 2 | Package bans | `bannedExternalImports`: `msw`, `msw/*`, `vitest`, `vitest/*`, `@vitest/*`, `@testing-library/*`, `playwright`, `playwright/*`, `openapi-msw`, `@faker-js/*` for every production layer + app |
| 3 | No build | testing libs have no `build` target; a buildable lib importing them fails `enforceBuildableLibDependency` |
| 4 | Build inputs | lib build tsconfig excludes `**/*.spec.ts`; Nx `production` named input excludes specs |
| 5 | No worker asset | no committed `mockServiceWorker.js`, no msw in app assets (`msw/vite` serves it to Vitest) |
| 6 | Bundle scan | `pnpm verify` builds the client and scans the bundle for `msw`, `vitest`, `faker` |
| 7 | No cycles | see §4, no `ignoredCircularDependencies` |

## 4. Avoiding cycles

Nx counts spec imports as project edges (`<slice>-state → <slice>-testing`).
- Testing libs import only types/testing/shared – never `data-access`, `state`, `ui`, `feature` or `shell` of a
  slice. What they need is the generated DTOs (`<client>/types`, `type:types`) and the generated `<client>/testing`.
- A lib that has specs importing a testing lib can never be imported by that testing lib.
- Testing libs have no `build` → `^build` skips them, no task cycle. `test` has no `dependsOn: ^build`.

## 5. Shared test infrastructure: what goes where

| Kind | Place |
|---|---|
| Worker, `test` fixture, global seed, `withBaseline`, `Scenarios` | `shared/testing` |
| Builders, handlers, scenarios of a slice | `<slice>/testing` |
| Fakes for `shared/*` classes (e.g. `AuthStore`) | spec-local (`Pick<AuthStore, …>`); not in `shared/testing` — it imports no workspace lib (a `shared/state` spec using it would be a cycle) |
| Generated types/handlers/factories of a client | `<client>/testing` (generated) |
| Setup function used by one spec (`render<Feature>()`, `navigateTo()`) | local in the spec |
| Setup used by several specs | provider/fake helpers (`provide<Slice>Testing()`) in `<slice>/testing`; the component/routes stay a parameter or a spec-local import – testing libs must not import `feature`/`shell` |

Don't use global `setupFiles` with handlers or a `providersFile` for test setup. Keep test setup visible in the spec.
