# 07 – Anti-patterns and checklist

## Anti-patterns

| Don't | Do |
|---|---|
| `fixture.detectChanges()`, `whenStable()`, `fakeAsync`/`tick`/`flush`, `waitForAsync`, sleeps | act with `userEvent`, assert with `await expect.element(...)` |
| `fixture.debugElement.query(By.css('.btn-primary'))` | `page.getByRole('button', { name: 'Save' })` |
| Asserting component internals (`componentInstance.items()`, private members, signal values inside components) | assert what is rendered and which requests leave |
| Mocking `HttpClient`, services or stores in integration tests | real code, MSW at the network |
| `HttpTestingController` + manual `flush()` in new code | MSW handlers/scenarios |
| `vi.mock('…module')` | DI fake for a port we don't control |
| Copied JSON blobs per test | `a<X>(overrides)` builders, `<domain>Scenarios` |
| Untyped `http.get('/api/…')` when a spec exists | `<client>Http` (openapi-msw) – drift breaks the build |
| Asserting faker values | assert builder defaults, overrides, spec examples, served counts |
| Global setup file registering handlers | `beforeEach(() => worker.use(...<domain>Handlers))` in the spec |
| `worker.stop()` / new worker per spec / `onUnhandledRequest: 'bypass'` | one worker, `resetHandlers`, `onUnhandledFrame: 'error'` |
| `import { test } from 'vitest'` in MSW specs | `import { test, worker } from '<scope>/shared/testing'` |
| Non-awaited `expect.element` / `userEvent` | always `await` |
| Testing library or generic render helper "just in case" | TestBed + `vitest/browser` + a spec-local `render()` is enough |
| Importing testing libs from production code; `testing` lib importing `data`/`feature` | specs + testing libs only; testing → types/testing/shared |
| Coverage % as PR gate | feature coverage: ≥ 1 integration test per feature, E2E per critical flow |
| `.skip`/`retry` for flaky tests | find the race (usually a missing `await` or a sync assertion on async DOM) and fix it |
| E2E for variants and error cases | integration test with an MSW scenario |
| Generated `should create` specs | delete; write a user scenario |

## Checklist (PR / AI self-check)

**Level & scope**
- [ ] Feature changed → integration test covers the user scenario (via route or feature root)
- [ ] Every routed component (`component`/`loadComponent` in `*.routes.ts`, incl. children) has ≥ 1 integration test
      (`feat-<name>.spec.ts` next to the container; route-level behaviour in `<domain>.routes.spec.ts`)
- [ ] Isolated component test only if reused / own logic matrix / costly edge case / cross-feature contract;
      no own spec for children already covered by the routed parent
- [ ] Critical flow changed → E2E updated
- [ ] Bug fix → regression test that was red before the fix

**Component / integration**
- [ ] One spec-local `render…()` / `navigateTo()` does the setup; tests interact via `page` + `userEvent`
- [ ] Rendered with `TestBed.createComponent` or `RouterTestingHarness`; real children, stores, router
- [ ] Directive/pipe: test host component with all variants; assert the visible effect (`toHaveStyle` only if the style is the purpose)
- [ ] Locators by role/label/text; `userEvent.*` for interaction; all awaited
- [ ] No `detectChanges`, `whenStable`, `fakeAsync`, `tick`, sleeps
- [ ] Only uncontrolled ports faked (auth, flags, analytics, time)

**MSW**
- [ ] `test`/`worker` from `shared/testing`; defaults in `beforeEach`; deviations via `({ worker }) => worker.use(...)`
- [ ] Handlers typed via `<client>Http`; builders for data; no assertions on random values
- [ ] Error path covered by a scenario (`serverError`, `empty`, …)

**Organisation**
- [ ] Spec next to the file; name describes behavior from the user's view
- [ ] Testing code only in `type:testing` libs; no new imports from production code into testing libs
- [ ] `nx affected -t lint typecheck test` green; new test seen red once (flipped expectation)
