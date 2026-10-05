# Examples

Runnable specs and infra files for an Nx workspace with one lib per slice × layer. Names are illustration:
read `booking`/`checkin` as `<domain>`, `booking-client` as `<client>`, `@myorg` as `<scope>`.

| File | Typically placed in | Shows |
|---|---|---|
| `component.spec.ts` (canonical) | `libs/checkin/feat-checkin/feature/src/feat-checkin.spec.ts` | feature container, `page`/`userEvent`, locator helpers, MSW cross-domain scenarios, only auth port faked |
| `routed-feature.integration.spec.ts` | `libs/checkin/shell/src/checkin.routes.spec.ts` | start via route: `provideRouter` + `RouterTestingHarness`, lazy components |
| `component-inputs-outputs.spec.ts` | `libs/checkin/ui/src/arrival-list.spec.ts` | isolated component, `inputBinding`/`outputBinding`, input signal change without CD |
| `form-input.spec.ts` | `libs/checkin/ui/src/guest-search.spec.ts` | `getByLabelText`, `userEvent.fill/type/clear`, `toHaveValue` |
| `directive.spec.ts` | `libs/shared/ui/src/highlight.spec.ts` | directive via test host + `render()`, `userEvent.hover/unhover`, `toHaveStyle` |
| `pipe.spec.ts` | `libs/shared/ui/src/format.pipe.spec.ts` | pipe: `transform` unit test + template test via host, `fill`/`selectOptions` |
| `store.spec.ts` | `libs/checkin/data/src/checkin.store.spec.ts` | real store + port vs. MSW, scenarios, error path, fake `Date` |
| `api-port.spec.ts` | `libs/booking/api/src/booking-api.spec.ts` | port vs. generated client, generated defaults, typed override, documented error, **unhandled → red** |
| `unit.spec.ts` | `libs/checkin/utils/src/checkin.utils.spec.ts` | pure function, no TestBed/MSW |
| `network.ts` | `libs/shared/testing/src/network.ts` | worker + auto fixture, `onUnhandledFrame: 'error'`, `faker.seed`, `resetHandlers` |
| `domain-testing/fixtures.ts` | `libs/booking/testing/src/fixtures/booking.fixture.ts` | builder `aBooking()` |
| `domain-testing/handlers.ts` | `libs/booking/testing/src/handlers/booking.handlers.ts` | `bookingHandlers`, `bookingScenarios` typed via `bookingClientHttp` |
| `vitest-base.config.mts` | `vitest-base.config.mts` (workspace root) | runnerConfig: msw 3 fixes for the Angular builder, worker script for Vitest 5 |
| `eslint.testing.config.mjs` (excerpt) | `eslint.config.mjs` | `type:testing` constraints, test package bans, spec override |

None of the component specs calls `detectChanges`, `whenStable`, `fakeAsync`, `tick` or waits manually.

Minimum versions: Vitest ≥ 4 (browser mode, `@vitest/browser-playwright`) · Playwright (Chromium) · msw ≥ 3 · openapi-msw ≥ 2 · openapi-typescript ≥ 7 · orval ≥ 8 · `@faker-js/faker` (pinned exactly; schema-faker seeds per value).
