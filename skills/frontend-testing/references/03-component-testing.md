# 03 – Component and integration tests (browser mode)

Canonical example: `examples/component.spec.ts` (typically `libs/checkin/feat-checkin/feature/src/feat-checkin.spec.ts`).
Further: `component-inputs-outputs.spec.ts`, `form-input.spec.ts`,
`routed-feature.integration.spec.ts`, `directive.spec.ts`, `pipe.spec.ts`.

## 1. The pattern

```ts
import { TestBed } from '@angular/core/testing';
import { a<X>, <domain>Scenarios } from '<scope>/<domain>/testing';
import { test, worker } from '<scope>/shared/testing';
import { beforeEach, describe, expect } from 'vitest';
import { page, userEvent } from 'vitest/browser';

/** Real container, real stores; only ports we don't control are faked, HTTP goes through MSW. */
function renderDesk(): void {
  TestBed.configureTestingModule({ providers: [{ provide: AUTH_API, useValue: signedInAgent }] });
  TestBed.createComponent(FeatCheckin);
}

// locator helpers: role + accessible name, created lazily, resolved on every use
const loadArrivalsButton = () => page.getByRole('button', { name: 'Load arrivals' });

describe('FeatCheckin', () => {
  beforeEach(() => worker.use(bookingScenarios.withBookings([aBooking({ guestName: 'Grace Hopper' })])));

  test('loads arrivals and offers one check-in per guest', async () => {
    renderDesk();

    await userEvent.click(loadArrivalsButton());

    await expect.element(page.getByText('1 arrival', { exact: true })).toBeVisible();
    await expect.element(page.getByRole('button', { name: 'Check in Grace Hopper' })).toBeVisible();
  });

  test('shows no arrivals when the backend has none', async ({ worker }) => {
    worker.use(bookingScenarios.empty());
    renderDesk();

    await userEvent.click(loadArrivalsButton());

    await expect.element(page.getByText('0 arrivals')).toBeVisible();
  });
});
```

## 2. Rendering: plain TestBed, no render library

Render with **`TestBed.createComponent(...)`** – no `@testing-library/angular`, no
`vitest-browser-angular`, no custom `render()` that appends hosts or calls `autoDetectChanges()`. That is enough because:

- **Host in the DOM:** TestBed inserts the component's root element into `document.body` (and removes it on reset),
  so `page` locators and `userEvent` reach it.
- **Zoneless TestBed auto-detects changes:** with zoneless change detection (current Angular default, no `zone.js`
  in the test build) `ComponentFixture.autoDetect` defaults to `true` (`autoDetectChanges(false)` even throws).
  Signal writes, outputs, `userEvent` and resolved HTTP calls schedule change detection like in the app.
- **TestBed reset per test** by the Angular unit-test builder: fresh injector, fresh root-provided stores.

**Every spec has a local `render…()`** (`render<Feature>()`, `render()` for a test host, `navigateTo()` for routes):
it does the whole setup (providers + create), the tests only interact via the page API (`page`, `userEvent`,
`expect.element`). This is the deck's "one setup call". Put it into `<domain>/testing` only when several specs need
the same one.

## 3. Why no `detectChanges()`, no `whenStable()`, no `fakeAsync`

| Old habit | Why it is unnecessary |
|---|---|
| `fixture.detectChanges()` | zoneless TestBed auto-detects; the scheduler runs CD after signal/event changes |
| `await fixture.whenStable()` | `expect.element(l)` = `expect.poll(() => l.element())`: retries until the DOM matches (default 1 s, config `expect.poll.timeout`) |
| `fakeAsync` / `tick` / `flush` / `waitForAsync` | zone.js-only APIs; real async (MSW, fetch) runs in the real browser |
| `setTimeout`/sleep before asserting | retrying assertions and actionability checks of `userEvent` replace waiting |
| `fixture.debugElement.query(By.css(…))` | locators read the page like a user (role, label, text) |

Result: a test reads like a user story – act, then `await expect.element(...)`.

Mechanics:
- **Locators are lazy.** `page.getByRole(...)` stores a query, resolved on every use – the same helper works before
  and after re-renders.
- **`userEvent.*` waits for actionability** (element present, visible, enabled) and dispatches real browser input via
  Playwright.
- **`expect.element(locator)` retries** the matcher until it passes or times out → no race with CD, HTTP or `@defer`.
  Always `await` it.
- Synchronous checks on non-DOM values (`expect(arrived).toEqual(...)`) are fine **after** an awaited `userEvent`
  (the event handler has run). For counts use `expect(locator.elements()).toHaveLength(n)` only after an awaited
  `expect.element` that guarantees the DOM is settled.

## 4. Locators and assertions

Query priority (accessibility first, like Playwright/Testing Library):

1. `page.getByRole('button', { name: 'Save' })` – roles + accessible name (`heading`, `link`, `listitem`, `status`, …)
2. `page.getByLabelText('Search guest')` – form fields
3. `page.getByPlaceholder(...)`, `page.getByText('2 arrivals')` (`{ exact: true }` when a prefix would match)
4. `page.getByAltText`, `page.getByTitle`
5. `page.getByTestId('…')` – only for non-semantic elements

Scope with chaining: `page.getByRole('list', { name: 'Guests' }).getByRole('listitem')`.

Assertions (`expect.element(locator)`): `toBeVisible`, `toBeInTheDocument`, `not.toBeInTheDocument`,
`toHaveTextContent`, `toHaveValue`, `toBeEnabled`/`toBeDisabled`, `toBeChecked`, `toHaveAttribute`,
`toHaveAccessibleName`, `toHaveFocus`.

Interactions (`userEvent`): `click`, `dblClick`, `fill` (replaces value), `type` (key by key, appends),
`clear`, `keyboard('{Enter}')`, `tab`, `hover`, `selectOptions`, `upload`. `locator.click()`/`locator.fill()` exist as
shorthand – prefer `userEvent.*` for consistency.

## 5. Inputs and outputs (isolated component test)

```ts
const records = signal<CheckinRecord[]>([]);
const arrived: GuestArrived[] = [];
TestBed.createComponent(ArrivalList, {
  bindings: [inputBinding('records', records), outputBinding<GuestArrived>('arrived', (e) => arrived.push(e))],
});

records.set([grace]);                                          // input change → re-render, no detectChanges
await expect.element(page.getByText('Grace Hopper (b-7)')).toBeVisible();

await userEvent.click(page.getByRole('button', { name: 'Walk-in guest' }));
expect(arrived).toEqual([{ type: 'checkin.guestArrived', bookingId: 'walk-in', guestName: 'Walk-in guest' }]);
```

No wrapper host component, no `fixture.componentRef.setInput` + `detectChanges`. (`twoWayBinding` exists for `model()`.)

## 6. Forms

Drive inputs by label: `await userEvent.fill(page.getByLabelText('Search guest'), 'ho')`, assert the visible effect
(`toHaveValue`, result list, validation message, disabled submit) – never the form model.
See `examples/form-input.spec.ts`.

## 7. Routing (integration test via the route)

The deck: start the feature like a user – via the route. Use the slice's real routes (lazy `loadComponent` included):

```ts
async function navigateTo(url: string): Promise<void> {
  TestBed.configureTestingModule({
    providers: [provideRouter(<domain>Routes), { provide: AUTH_API, useValue: signedInAgent }],
  });
  const harness = await RouterTestingHarness.create();
  await harness.navigateByUrl(url);
}
```

Guards, resolvers and lazy loading run for real. Assert the rendered page (`getByRole('heading', …)`). Navigation
triggered by the UI: assert the next page's content (or `TestBed.inject(Router).url` if the URL itself is the requirement).

## 8. What to fake in component tests

| Integration test (default) | Isolated component test |
|---|---|
| Fake only ports we don't control: auth (`AUTH_API`), feature flags, analytics (`{ provide: PORT, useValue: fake }`) | Additionally fake services/stores the component injects, or render dumb (`ui`) components with inputs only |
| HTTP: MSW | HTTP: none should happen (unhandled request → red) |
| Child components real | Children may be real; replace only heavy ones |

Fakes are typed against the port (`const signedInAgent: AuthApi = { … }`), never `as any`.

## 9. Directives and pipes (test host)

Same pattern as components: a **test host component** in the spec uses the directive/pipe in a template, `render()`
creates it, the tests interact via the page API. No `new Directive()`, no `By.directive`, no `debugElement`.

```ts
@Component({
  imports: [Highlight],
  template: `
    <p appHighlight>default</p>
    <p appHighlight="lightblue">custom</p>
  `,
})
class HighlightHost {}

function render(): void {
  TestBed.createComponent(HighlightHost);
}

test('highlights yellow while hovered', async () => {
  render();
  const paragraph = page.getByText('default');

  await userEvent.hover(paragraph);

  await expect.element(paragraph).toHaveStyle({ backgroundColor: 'yellow' });
});
```

- **Directive:** one element per variant (default, each relevant input) in the host template; assert the visible
  effect. `toHaveStyle`/`toHaveAttribute` is fine here when the style/attribute *is* the directive's purpose.
- **Pipe:** a plain unit test for the `transform` matrix (`new Pipe().transform(...)`, no TestBed) **plus** a short
  template test: host with form fields → `userEvent.fill/selectOptions` → `expect.element(...).toHaveTextContent(...)`.
  Host state lives in `signal`s of the host, never asserted directly.
- Host components are spec-local and never exported.

See `examples/directive.spec.ts`, `examples/pipe.spec.ts`.

## 10. Anti-patterns

- Reading component internals: `fixture.componentInstance.items()`, `protected` members via casts.
- Asserting CSS classes or DOM structure instead of user-visible state (exception: style/attribute directives, §9).
- `detectChanges`, `whenStable`, `fakeAsync`, `tick`, sleeps, `vi.waitFor` around DOM checks (use `expect.element`).
- Non-awaited `expect.element(...)` (silently passes) or non-awaited `userEvent.*`.
- `getByTestId` where a role/label exists; brittle `exact` text when a role + name is available.
- Mocking `HttpClient`/services in an integration test instead of MSW.
- One giant spec per feature – split by scenario (`<feature>.<scenario>.integration.spec.ts`) when it grows.
