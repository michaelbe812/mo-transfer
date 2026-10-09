# 01 – Principles

Source: slide deck `Frontend-Testing-Strategie für Angular.pptx` (12 slides + speaker notes). These principles are
binding; everything else in this skill implements them.

## 1. Guiding principle: test what a user can see and do

| | |
|---|---|
| **Through the UI** | Click, type and navigate instead of calling methods on the component. |
| **Visible result** | Assert what is rendered and which requests leave the system. |
| **Refactoring-safe** | If only the implementation changes, every test stays green. |

> A red test means: a user would notice a bug.

Not tested: internal state, signal values inside components, private methods. This keeps tests realistic and maintainable.

## 2. The testing honeycomb

```
            ┌───────────────────────┐
            │  End-to-end tests     │  Playwright vs. real backend, business-critical flows only
      ┌─────┴───────────────────────┴─────┐
      │  Integration tests · FOCUS        │  Vitest browser mode + MSW, ≥ 1 per feature,
      │                                   │  real components, services, router, stores
      └─────┬───────────────────────┬─────┘
            │  Isolated tests       │  component tests (browser mode), unit tests for pure logic
            └───────────────────────┘
```

The width of each layer is the **number** of tests, not their importance. No layer replaces another.

## 3. Levels

### End-to-end (Playwright, real system)
Only for business-critical flows. A flow is critical if at least one applies:
1. Without it, no usage (login, onboarding).
2. It generates revenue or is the core process.
3. A failure has legal or compliance consequences.
4. Several systems interact.

Happy path + the most important aborts. Variants belong in integration tests. Flaky tests are fixed, not ignored.
Environment, test data and execution time are defined per project. A critical flow **additionally** keeps its
integration tests: variants and error cases are cheaper there.

### Integration test per feature (Vitest browser mode + MSW)
A whole feature of a vertical slice, as real as possible. The test starts the feature like a user: via the **route** or the
feature root component. Every test describes one user scenario. Error cases are provoked via MSW handlers.

| Real | Mocked |
|---|---|
| Components, child components, directives, pipes | Backend APIs and WebSockets (MSW) |
| Services, stores, guards, resolvers | Auth (OIDC), feature flags, analytics |
| Router and routing configuration | Time (fake timers) |
| `HttpClient` incl. interceptors | Browser APIs outside our control |
| Shared libraries (`shared/*`) | |

> Rule of thumb: mock only what we don't control.

#### Finding the integration-test targets

**Heuristic: every routed component gets at least one feature/integration test.** A routed component is every
`component` / `loadComponent` in a `Routes` array, including child routes. It is what a user can navigate to, so it
is the natural unit of "a feature".

How to find them:

1. Start at the app routes (`apps/<app>/src/app/app.routes.ts`). `loadChildren` entries point to the slice shells
   (`libs/<slice>/shell`, tag `entry`). They are not components themselves, so follow them.
2. In every `<slice>.routes.ts` (shell lib), collect each `component` / `loadComponent` entry. Follow nested
   `children` and `loadChildren` the same way. Redirects (`redirectTo`) are not targets.
3. In this organisation the routed components are the feat containers: `Feat<Name>` in
   `libs/<slice>/feat-<name>/feature/src/feat-<name>.ts`. The lint rule `blueprint/layer-symbol-naming`
   enforces this shape, so the containers can also be listed by name.

```bash
# routed components per slice (component/loadComponent, incl. children)
rg -n "loadComponent|component:" libs/*/shell/src --glob '*.routes.ts'

# routed containers without a spec next to them → missing integration test
for f in libs/*/feat-*/feature/src/feat-*.ts; do
  case "$f" in *.spec.ts) continue;; esac
  [ -f "${f%.ts}.spec.ts" ] || echo "missing integration test: $f"
done
```

Where the test lives and how it starts the feature:

| Situation | Spec location | Start |
|---|---|---|
| Default: one routed container | next to it: `libs/<slice>/feat-<name>/feature/src/feat-<name>.spec.ts` | `TestBed.createComponent(Feat<Name>)` with real stores; fake only what we don't control (auth, flags) |
| Route-level behaviour matters: guards, resolvers, route params, redirects, navigation between routes, lazy loading | slice shell: `libs/<slice>/shell/src/<slice>.routes.spec.ts` | `provideRouter(<slice>Routes)` + `RouterTestingHarness.navigateByUrl(url)` (→ `03-component-testing.md` §7) |

Both are integration tests: real components, children, stores, data-access and `HttpClient`, backend served by MSW.
Each test describes one user scenario. The shell spec does not replace the container spec; it covers what only
exists at route level.

#### When to write an isolated component test

The integration test of the routed parent covers its children (dumb `ui` components, feat-local components).
A child does **not** get its own spec just because it exists. Add an isolated component test only if at least one
trigger applies:

| Trigger | Typical example |
|---|---|
| Reused in several features (`shared/ui`, design system, a slice `ui` component used by more than one feat) | button, card, list, form field |
| Own logic with many input combinations that would need many integration scenarios | formatting/state matrix, conditional rendering by role |
| Edge cases that are costly to reach through the route | empty/error/overflow states deep in a flow |
| Its inputs/outputs are a contract other features rely on | value emitted by a shared list (`(arrived)` → `Arrival`) |

Not a trigger: "to raise coverage", "the component looks complex", or behaviour the parent's integration test
already shows. Pure logic without DOM (utils, validators) gets a **unit test** instead.
Directives and pipes get their own spec via a **test host component** + `render()` (pipes: plus a unit test for
the `transform` matrix) → `03-component-testing.md` §9.

```
routed (component/loadComponent)? ── yes ─▶ integration test (mandatory, ≥ 1)
        │ no
        ▼
reused / logic matrix / costly edge cases / contract? ── yes ─▶ isolated component test
        │ no
        ▼
covered by the routed parent's integration test → no own spec
```

### Isolated tests
| | |
|---|---|
| **Component test** | One component, services and children mocked, driven through the DOM. Runs in Vitest browser mode. |
| **Unit test** | Pure logic: utils, validators, pipe `transform`. Runs in Vitest. |
| **Directive / pipe test** | Test host component + `render()`, driven through the page API. Runs in Vitest browser mode. |

Only when the integration test is not enough:
- complex logic with many combinations,
- reusable design-system components,
- edge cases with disproportionate setup.

Isolated tests complement integration tests, they don't replace them. **In doubt: integration test.**

## 4. Tooling per layer

| Layer | Runner | Mocking | Scope |
|---|---|---|---|
| End-to-end | Playwright | none, real backend | few critical flows |
| Integration | Vitest browser mode | MSW + external providers | ≥ 1 per feature |
| Component | Vitest browser mode | services, children | targeted |
| Unit | Vitest | hardly any | targeted |

Supplementary tools (e.g. accessibility) hook into existing tests. One toolbox: Playwright for E2E, Vitest for
everything else, MSW for API mocks.

## 5. Structure and test infrastructure

- **One setup call** for providers, routing, MSW and external mocks (deck: `renderFeature()`).
- **Test data builders** with sensible defaults instead of copied JSON blocks.
- **One spec file per scenario** for large integration tests; test names describe behavior from the user's view.
- MSW handlers, timers and global state are reset after every test.

How this maps to this workspace (one lib per slice × layer): `06-test-organisation.md`.

## 6. API mocks generated from the contract

> If mocks drift from the backend, tests stay green — and production breaks.

| | |
|---|---|
| **OpenAPI as source** | Types (= the DTOs the app uses in every layer), MSW handlers and example data are generated from the spec. |
| **Typed mocks** | An API change breaks the build instead of drifting silently. |
| **E2E as safety net** | Tests against the real backend check the contract end-to-end. |

Bonus: the same handlers serve local development without backend and Storybook. Implementation: `05-msw.md`.

## 7. Feature coverage instead of a percentage

Every feature has an integration test. Every critical flow has an E2E test.
- Isolated and integration tests block every PR.
- E2E tests run at least before every release.
- Code coverage is an indicator, not a gate (a percentage target leads to tests that cover lines, not behavior).
- Flaky tests are fixed promptly.

