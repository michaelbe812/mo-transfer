# 04 – Store, port and service tests

Examples: `examples/store.spec.ts`, `examples/api-port.spec.ts`, `examples/unit.spec.ts`.

## 1. Test real code against the network boundary

```
spec ──▶ Store (data) ──▶ Port (api) ──▶ generated client / ApiHttp ──▶ HttpClient / fetch ──▶ ✂ MSW (Service Worker)
         real              real            real                          real                     mocked
```

- **Mock the network, not the services.** MSW answers in the browser; everything above it is production code.
  This also tests mapping (DTO → model), error translation, interceptors, URL building and the generated client.
- `HttpClient`: current Angular provides it `providedIn: 'root'` with the `FetchBackend` → no provider needed in tests,
  MSW sees the requests. Apps still declare `provideHttpClient(withFetch())` explicitly.
- No `provideHttpClientTesting()`/`HttpTestingController` in new code: it replaces the real backend layer and
  needs manual `flush()` per request. (Legacy projects without MSW may keep it.)

## 2. Store test

```ts
describe('<Domain>Store', () => {
  beforeEach(() => worker.use(...<domain>Handlers));               // defaults of this spec

  test('maps backend DTOs to records', async () => {
    const store = TestBed.inject(<Domain>Store);

    await store.load();                                             // act through the public API

    expect(store.all()).toEqual([...]);                             // assert public (readonly) signals
  });

  test('rejects and keeps its state when the backend fails', async ({ worker }) => {
    worker.use(<domain>Scenarios.serverError());                    // only this test
    const store = TestBed.inject(<Domain>Store);

    await expect(store.load()).rejects.toThrow('GET /api/<items> failed: 500');
    expect(store.count()).toBe(0);
  });
});
```

Rules:
- `TestBed.inject(Store)` – root stores are fresh per test (TestBed reset). Component-scoped stores (in a component's
  `providers`) are tested **through the component** (`03-component-testing.md`).
- Assert the public surface: readonly signals, computed values, returned promises, emitted events. No private fields,
  no spying on internal methods.
- Async: `await` the action (`load()` returns a promise) or, for resource-based stores, `await expect.poll(() => store.x())`
  – never `TestBed.tick()` + manual flushing.
- SignalStore (`@ngrx/signals`): same approach – `TestBed.inject(XStore)`, call methods, read state signals.

## 3. Port (api layer) test

The port is the slice's contract; test it against the generated client + MSW (`examples/api-port.spec.ts`):
- generated default handlers → assert the **spec examples** (deterministic), never faker values,
- typed override via `<client>Http` → mapping of what the test serves,
- documented error response → translated `Error`,
- no handler at all → the test **must fail** (`onUnhandledFrame: 'error'`; see `05-msw.md` §6).

## 4. When to fake instead (ports per DI)

Fake via DI (`{ provide: PORT, useValue: fake }`) only for what we don't control or what isn't HTTP:

| Fake | Example |
|---|---|
| Auth / OIDC | `AUTH_API` with `user` / `isAuthenticated` signals |
| Feature flags, analytics, logging transport | `FEATURE_FLAGS`, capturing fake with `calls[]` |
| Browser APIs outside our control | geolocation, camera, clipboard behind a port |
| Isolated component test | a store/service the component injects (deck: "services and children mocked") |

- Fake = small typed object/class implementing the port (`const agent: AuthApi = { … }`), no `as any`, no `vi.mock` of modules.
- Never fake a domain port in an integration test just to avoid MSW – that hides mapping and contract errors.
- Reusable fakes for a port live in the port owner's `<domain>/testing` lib.

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

Utils, mappers, validators, pipes' transform functions: plain `describe(fn.name, …)` + `expect`, no TestBed, no MSW
(`examples/unit.spec.ts`). Pipes additionally get a template test via a host (`examples/pipe.spec.ts`). They run in the same browser-mode runner – no separate node config needed in a lib.
Keep logic pure and next to the store so it is cheap to test; edge cases (`0`, `''`, `null`, boundaries) belong here.
