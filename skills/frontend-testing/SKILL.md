---
name: angular-testing
description: Frontend testing strategy and patterns for Angular in Nx workspaces (Vitest ≥ 4 browser mode with Playwright/Chromium, page/userEvent/expect.element from vitest/browser, MSW ≥ 3, OpenAPI-generated mocks via openapi-msw/orval, Playwright E2E). Use when writing, reviewing or fixing tests or specs (*.spec.ts), component/integration/store/service tests, MSW handlers, fixtures or test data builders, testing libs (type:testing), vitest/unit-test config, flaky tests, or when deciding what to test where (testing honeycomb).
---

# Frontend Testing Strategy


# # Hints
- Right now we dont do E2E Tests.

## Workflow

1. Detect context: zoneless change detection, test executor (`@angular/build:unit-test` /
   `@nx/angular:unit-test`, `browsers` set?), `msw` version, `libs/shared/testing` + `libs/<domain>/testing` present,
   generated `<client>/testing` libs. Follow what exists; mention deviations. No MSW yet → set it up via
   `references/08-msw-setup.md` (MSW docs: <https://mswjs.io/docs/>).
2. Pick the level (→ `references/01-principles.md`): **every routed component gets ≥ 1 integration test**. Find them
   via the routes: `app.routes.ts` → slice shells (`loadChildren`) → each `component`/`loadComponent` in
   `<domain>.routes.ts`, i.e. the `Feat<Name>` containers. Isolated component tests only for components that are
   reused, have their own logic matrix, costly edge cases or a cross-feature input/output contract. In doubt:
   integration test.
3. Write the spec next to the file (`*.spec.ts`), with `test`/`worker` from `<scope>/shared/testing`,
   default handlers in `beforeEach`, deviations per test (→ `references/05-msw.md`).
4. Interact and assert like a user (→ `references/03-component-testing.md`). No `detectChanges`, no waiting.
5. Verify: `nx test <project>` green **and** make it red once (flip one expectation) to prove the test can fail.
   Then `nx affected -t lint typecheck test`. Report real results.

## Rules (short form)

**Principles** → `references/01-principles.md`
- Test what a user can see and do: click, type, navigate; assert rendered output and requests leaving the app.
  Never internal state, signal values of components, private methods. A red test = a user would notice a bug.
- Honeycomb: few E2E (Playwright, real backend, critical flows only), **many integration tests** (≥ 1 per feature,
  Vitest browser mode + MSW), targeted isolated tests (component, unit).
- Heuristic: **at least one integration test per routed component**, spec next to the container
  (`feat-<name>.spec.ts`). Route-level behaviour (guards, resolvers, params, navigation) additionally in
  `<domain>.routes.spec.ts` in the shell via `RouterTestingHarness`. Children are covered by the parent's test; a
  child gets its own component test only if reused, logic-heavy, edge-case-heavy or a cross-feature contract.
- Mock only what we don't control: backend (MSW), auth/OIDC, feature flags, analytics, time (fake timers),
  foreign browser APIs. Everything else is real: components, children, services, stores, router, HttpClient, interceptors.
- Coverage is an indicator, not a gate. Isolated + integration tests block every PR. Flaky tests get fixed, not skipped.

**Toolset** → `references/02-toolset.md`
- Vitest (≥ 4) **browser mode** (Chromium via `@vitest/browser-playwright`) for everything except E2E; no jsdom, no Karma/Jest.
- Runner: `@angular/build:unit-test` (Nx: `@nx/angular:unit-test`, a thin wrapper), `browsers: ["chromiumHeadless"]`,
  `runnerConfig: vitest-base.config.mts`. Debug: `nx run <lib>:test --ui` (Vitest UI, headed preview).

**Components** → `references/03-component-testing.md`
- Render with `TestBed.createComponent(...)` (no render library). Zoneless TestBed
  auto-detects changes; the host is in `document.body`.
- Query with `page.getByRole/getByLabelText/getByText` (role first), act with `userEvent.click/fill/type`,
  assert with `await expect.element(locator).toBeVisible()/toHaveTextContent()/toHaveValue()`.
- **Never** `fixture.detectChanges()`, `whenStable()`, `fakeAsync/tick/flush`, `waitForAsync`, sleeps. Locators and
  `expect.element` retry until the DOM matches.
- Inputs/outputs: `TestBed.createComponent(C, { bindings: [inputBinding('x', signal), outputBinding('y', fn)] })`.
- Routed features: `provideRouter(<domain>Routes)` + `RouterTestingHarness`, start via URL like a user.
- **Every spec has a local `render…()`** (setup: providers + create); tests interact only via the page API.
- Directives/pipes: spec-local **test host component** + `render()`; pipes additionally unit-test `transform`.

**Stores & services** → `references/04-store-and-service-testing.md`
- Real store + real port + real generated client + real `HttpClient`; mock the **network** with MSW.
- Fake via DI only at ports we don't control (auth, flags, analytics) or a domain port in an isolated test.
- `TestBed.inject(Store)`; await the action; assert public signals. Error path via scenario → `rejects.toThrow(...)`.

**MSW** → usage `references/05-msw.md`, setup from scratch `references/08-msw-setup.md`
- **MSW docs: <https://mswjs.io/docs/>** – look up APIs there instead of guessing (many msw 2 snippets are outdated).
  Recipe: <https://mswjs.io/docs/recipes/vitest-browser-mode>.
- One worker per test run (`setupWorker()` without handlers), `onUnhandledFrame: 'error'`, started once,
  `resetHandlers()` after every test, **no `stop()`**; all via the auto fixture `worker` in `shared/testing`.
- Defaults: `beforeEach(() => worker.use(...<domain>Handlers))`. Deviations: `test('…', async ({ worker }) => worker.use(<domain>Scenarios.serverError()))`.
- Layering: `<domain>Handlers = withBaseline(curated, <client>Handlers…)` (`shared/testing`): curated handlers
  (builders in the domain model, typed via `<client>Http`) win, the generated baseline answers every other operation
  of the slice's clients; scenarios `satisfies Scenarios`. State/feature specs use the slice handlers + scenarios,
  data-access specs the generated `<client>Handlers` + typed `<client>Http` overrides.
- Generated defaults only with fake data (`settings.testing.mocks: schema-faker`; library default `none` = typed
  `<client>Http` only); builders `a<X>(overrides)`; `faker.seed` per test. Tests never assert random values.

**Organisation** → `references/06-test-organisation.md`
- `libs/shared/testing` (worker + `test`), `libs/<domain>/testing` (fixtures, handlers, scenarios),
  generated `libs/[<domain>/]generated/<client>/testing`; all `type:testing`, no `build` target.
- Only specs and testing libs import testing libs; testing libs → only `type:types`, `type:testing`, `scope:shared`.
- Production leak guards: tag constraints, `bannedExternalImports` (msw, vitest, faker, …), no build target,
  build tsconfig excludes specs, bundle scan. No cycles.

**Anti-patterns & checklist** → `references/07-anti-patterns-and-checklist.md`

## References
- `references/01-principles.md` – honeycomb, levels, what is real vs. mocked, gates (from the pptx)
- `references/02-toolset.md` – Vitest browser mode, runner, Nx targets, UI, coverage, minimum versions
- `references/03-component-testing.md` – page/userEvent, locators, retrying assertions, inputs/outputs, routing,
  directives/pipes via test host
- `references/04-store-and-service-testing.md` – stores, ports, services, fakes, time
- `references/05-msw.md` – worker fixture, handlers/scenarios, generated mocks, determinism, unhandled requests
- `references/06-test-organisation.md` – libs, tags, boundaries, naming, leak guards, cycles
- `references/07-anti-patterns-and-checklist.md` – what not to do + PR / AI self-check
- `references/08-msw-setup.md` – MSW setup step by step (install, runnerConfig, testing libs, verification, troubleshooting, doc links)
- `examples/` – runnable specs and infra files (see `examples/README.md`)

