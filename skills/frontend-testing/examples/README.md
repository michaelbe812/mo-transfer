# Examples

Specs and infra files for this workspace (reduced Nx blueprint: vertical slices, one lib per slice × layer, no
ports, generated OpenAPI DTOs in every layer — `docs/nx-reduziert.md`). They mirror the real libs: placed at the
path in the table, they compile, lint and pass (checked once by copying them in). Read `booking`/`checkin` as
`<slice>`, `booking-client`/`checkin-client` as `<client>`.

| File | Typically placed in | Shows |
|---|---|---|
| `component.spec.ts` (canonical) | `libs/checkin/feat-checkin/feature/src/feat-checkin.spec.ts` | feature container, `page`/`userEvent`, locator helpers, slice handlers + scenarios, only `AuthStore` faked (provider of the class) |
| `routed-feature.integration.spec.ts` | `libs/checkin/shell/src/checkin.routes.spec.ts` | start via route: `provideRouter` + `RouterTestingHarness`, lazy feat containers |
| `component-inputs-outputs.spec.ts` | `libs/checkin/ui/src/arrival-list.spec.ts` | isolated `ui` component, generated DTOs as input, plain value as output, `inputBinding`/`outputBinding` |
| `form-input.spec.ts` | `libs/checkin/ui/src/guest-search.spec.ts` | `getByLabelText`, `userEvent.fill/type/clear`, `toHaveValue` (self-contained component) |
| `directive.spec.ts` | `libs/shared/ui/src/highlight.spec.ts` | directive via test host + `render()`, `userEvent.hover/unhover`, `toHaveStyle` |
| `pipe.spec.ts` | `libs/shared/ui/src/format-pipe.spec.ts` | pipe: `transform` unit test + template test via host, `fill`/`selectOptions` |
| `store.spec.ts` | `libs/checkin/state/src/checkin.store.spec.ts` | real store + `CheckinApi` vs. MSW, DTOs held as they are, scenarios, error path, domain event + fake `Date` |
| `data-access.spec.ts` | `libs/booking/data-access/src/booking-api.spec.ts` | wrapper vs. generated client, **unhandled → red**, generated defaults (spec examples), typed error override |
| `unit.spec.ts` | `libs/checkin/utils/src/checkin.utils.spec.ts` | pure function on a generated DTO, no TestBed/MSW |
| `network.ts` | `libs/shared/testing/src/network.ts` | worker + auto fixture, `onUnhandledFrame: 'error'`, `faker.seed`, `resetHandlers` |
| `slice-testing/fixtures.ts` | `libs/booking/testing/src/fixtures/booking.fixture.ts` | builder `aBooking()` returning the generated `Booking` DTO |
| `slice-testing/handlers.ts` | `libs/booking/testing/src/handlers/booking.handlers.ts` | `bookingHandlers` (curated on the generated baseline), `bookingScenarios` typed via `bookingClientHttp` |
| `vitest-base.config.mts` | `vitest-base.config.mts` (workspace root) | runnerConfig: msw 3 fixes for the Angular builder, worker via `msw/vite`, `globals: false` |
| `eslint.testing.config.mjs` (excerpt) | `eslint.config.mjs` | `type:testing` constraints, test package bans, spec override (scope rules stay) |

A lib's first spec also needs `tsconfig.spec.json` + `"test": {}` in its `project.json` (`checkin/ui` has none:
`ArrivalList` is used once and covered by the `feat-checkin` integration test). None of the component specs calls `detectChanges`, `whenStable`, `fakeAsync`,
`tick` or waits manually.

Minimum versions: Vitest ≥ 4 (browser mode, `@vitest/browser-playwright`) · Playwright (Chromium) · msw ≥ 3.0.2 (`msw/vite`) · openapi-msw ≥ 2 · openapi-typescript ≥ 7 · `@faker-js/faker` (pinned exactly; schema-faker seeds per value).
