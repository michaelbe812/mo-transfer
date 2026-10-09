# 04 – Store, data-access and service tests

Examples: `examples/store.spec.ts`, `examples/data-access.spec.ts`, `examples/unit.spec.ts`.

## 1. Test real code against the network boundary

```
spec ──▶ Store (state) ──▶ <Slice>Api (data-access) ──▶ generated client service ──▶ HttpClient / fetch ──▶ ✂ MSW (Service Worker)
         real               real                         real                        real                     mocked
```

- **Mock the network, not the services.** MSW answers in the browser; everything above it is production code.
  This also tests error translation (`Error` with status), interceptors, URL building and the generated client.
- **No mapping to test:** the generated DTOs are the model in every layer. `data-access` returns them as they are
  (Promise instead of Observable, `Error` with status), stores hold them as they are. Assert the DTOs that the
  handler served — `toEqual(defaultCheckins)`, not a hand-written copy in another shape.
- `HttpClient`: current Angular provides it `providedIn: 'root'` with the `FetchBackend` → no provider needed in tests,
  MSW sees the requests. Apps still declare `provideHttpClient(withFetch())` explicitly.
- No `provideHttpClientTesting()`/`HttpTestingController` in new code: it replaces the real backend layer and
  needs manual `flush()` per request. (Legacy projects without MSW may keep it.)

## 2. Store test (`state`)

```ts
describe('<Slice>Store', () => {
  beforeEach(() => worker.use(...<slice>Handlers));                 // slice defaults (curated + baseline)

  test('holds the curated backend DTOs as they are', async () => {
    const store = TestBed.inject(<Slice>Store);

    await store.load();                                             // act through the public API

    expect(store.all()).toEqual(default<X>s);                       // the builders' DTOs the handler served
  });

  test('rejects and keeps its state when the backend fails', async ({ worker }) => {
    worker.use(<slice>Scenarios.serverError());                     // only this test
    const store = TestBed.inject(<Slice>Store);

    await expect(store.load()).rejects.toThrow('GET /api/<items> failed: 500');
    expect(store.count()).toBe(0);
  });
});
```

Rules:
- `TestBed.inject(Store)` – root stores are fresh per test (TestBed reset). Component-scoped stores (in a component's
  `providers`, e.g. a `ui`-local `*.store.ts`) are tested **through the component** (`03-component-testing.md`).
- Assert the public surface: readonly signals, computed values, returned promises. No private fields, no spying on
  internal methods.
- Domain events (`<slice>.events.ts` in `state`): create them with their creator (`guestArrived(...)`), pass them to
  `store.handle(...)`, assert the resulting signals.
- Async: `await` the action (`load()` returns a promise) or, for resource-based stores, `await expect.poll(() => store.x())`
  – never `TestBed.tick()` + manual flushing.
- SignalStore (`@ngrx/signals`): same approach – `TestBed.inject(XStore)`, call methods, read state signals.

## 3. Data-access test (wrapper around the generated client)

`data-access` is the only layer with HTTP (`<name>-api.ts` → `<Name>Api`, wrappers like `BookingNotifications`).
Test it against the generated client + MSW (`examples/data-access.spec.ts`):
- generated default handlers (`<client>Handlers`) → assert the **spec examples** (deterministic), never faker values,
- typed override via `<client>Http` → what the test serves comes back unchanged,
- documented error response → translated `Error` (`GET /api/<items> failed: 503`),
- no handler at all → the test **must fail** (`onUnhandledFrame: 'error'`; see `05-msw.md` §6).

Data-access specs use the generated `<client>Handlers`/`<client>Http`, not the curated `<slice>Handlers`.

## 4. When to fake instead

There are no ports or DI tokens. Fake via TestBed provider **of the class** (`{ provide: AuthStore, useValue: fake }`)
only for what we don't control or what isn't HTTP:

| Fake | Example |
|---|---|
| Auth / OIDC | `AuthStore` (`shared/state`) with `user` / `isAuthenticated` signals |
| Feature flags, analytics, logging transport | the service class, capturing fake with `calls[]` |
| Browser APIs outside our control | geolocation, camera, clipboard behind a small service class |
| Isolated component test | a store/service the component injects (deck: "services and children mocked") |

- Fake = small typed object (`const agent: Pick<AuthStore, 'user' | 'isAuthenticated'> = { … }`), no `as any`, no
  `vi.mock` of modules.
- Never fake a `data-access` class or a store in an integration test just to avoid MSW – that hides contract errors.
- Fakes for `shared/*` classes stay spec-local (`shared/testing` imports no workspace lib, see
  `06-test-organisation.md` §5); reusable fakes for a slice's classes live in `<slice>/testing`.

## 5. Time

Time is not ours → fake it, but only `Date` (MSW, fetch and Angular scheduling keep real timers):

```ts
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-01T08:30:00.000Z'));
});
afterEach(() => vi.useRealTimers());
```

For debounce/intervals fake `setTimeout`/`setInterval` explicitly and advance with `await vi.advanceTimersByTimeAsync(ms)`;
keep such tests free of network calls or restore real timers before them.

## 6. Unit tests (pure logic)

Utils, validators, pipes' transform functions: plain `describe(fn.name, …)` + `expect`, no TestBed, no MSW
(`examples/unit.spec.ts`). Pipes additionally get a template test via a host (`examples/pipe.spec.ts`). They run in
the same browser-mode runner – no separate node config needed in a lib. Keep logic pure (in `utils`) so it is cheap
to test; edge cases (`0`, `''`, `null`, boundaries) belong here. Inputs are generated DTOs too — build them with the
slice's builders (`aCheckin(...)`) instead of hand-written literals.
