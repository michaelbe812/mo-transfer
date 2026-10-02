# 05 – MSW (msw 3, Vitest browser mode)

Examples: `examples/network.ts` (shared/testing), `examples/domain-testing/{fixtures,handlers}.ts`,
`examples/store.spec.ts`, `examples/api-port.spec.ts`. Based on the official recipe
<https://mswjs.io/docs/recipes/vitest-browser-mode>.
API details (handlers, `HttpResponse`, `worker.use`, lifecycle events, …): MSW docs <https://mswjs.io/docs/>.
Setting MSW up from scratch: `08-msw-setup.md`.

## 1. Building blocks

| Piece | Lib | Content |
|---|---|---|
| `worker`, `test`, `FAKER_SEED` | `libs/shared/testing` | one `setupWorker()` + Vitest `test.extend` with auto fixture `worker` |
| `a<X>()` builders | `libs/<domain>/testing/src/fixtures/` | valid objects with sensible defaults, `overrides` |
| `<domain>Handlers`, `<domain>Scenarios`, `default<X>s` | `libs/<domain>/testing/src/handlers/` | happy path + named deviations, typed via `<client>Http` |
| `<client>Http`, `<client>Handlers`, `get<Op>ResponseMock()`, `get<Op>MockHandler()`, `paths` | `libs/[<domain>/]generated/<client>/testing` | generated from the OpenAPI spec (openapi-msw, orval, openapi-typescript) |

## 2. The worker fixture (`shared/testing`)

```ts
export const worker = setupWorker();                    // no initial handlers
export const FAKER_SEED = 42;

let workerStarted: Promise<unknown> | undefined;
function startWorker(): Promise<unknown> {
  workerStarted ??= worker.start({
    onUnhandledFrame: 'error',                          // msw 3 (msw 2: onUnhandledRequest)
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },    // served by Vitest from the msw package
  });
  return workerStarted;
}

export const test = testBase.extend<{ worker: typeof worker }>({
  worker: [
    async ({}, use) => {
      faker.seed(FAKER_SEED);                           // deterministic generated data per test
      await startWorker();
      await use(worker);
      worker.resetHandlers();                           // removes defaults AND overrides
    },
    { auto: true },                                     // active even if a test doesn't destructure it
  ],
});
```

Rules:
- **One worker per test run**, started once (promise guard). Spec files of a project share one page; restarting per
  test (recipe default) is unnecessary.
- **`onUnhandledFrame: 'error'`**: a request without a handler is logged as error and answered with a 500 → the test
  goes red instead of silently hitting a real backend.
- **`resetHandlers()` after every test**, **no `stop()`** (redundant in the browser, per recipe).
- `setupWorker()` **without** handlers: each spec states its defaults (no hidden global setup file).
- Every spec imports `test` from `<scope>/shared/testing`, not from `vitest` (otherwise no fixture → no worker,
  no seed). `describe`/`expect`/`beforeEach`/`vi` still come from `vitest`.

## 3. Defaults per spec, deviations per test

```ts
import { <domain>Handlers, <domain>Scenarios } from '<scope>/<domain>/testing';
import { test, worker } from '<scope>/shared/testing';

describe('…', () => {
  beforeEach(() => worker.use(...<domain>Handlers));                     // defaults (module export `worker`)

  test('happy path', async () => { /* … */ });

  test('server error', async ({ worker }) => {
    worker.use(<domain>Scenarios.serverError());                        // prepended → wins over the default
    /* … */
  });
});
```

Order (Vitest 4 resolves auto fixtures for `beforeEach` too): fixture setup (worker running, seed set) →
`beforeEach` (defaults) → test (`worker.use` prepends, newest handler wins) → fixture teardown (`resetHandlers`).
Without `resetHandlers` a follow-up test sees stale overrides.

## 4. Fixtures and scenarios (`<domain>/testing`)

```ts
// fixtures/<domain>.fixture.ts
let nextId = 1;
export function a<X>(overrides: Partial<<X>> = {}): <X> {
  return { id: `<x>-${nextId++}`, name: 'Ada Lovelace', status: 'pending', ...overrides };
}

// handlers/<domain>.handlers.ts
export const default<X>s: <X>[] = [a<X>({ id: 'x-100' }), a<X>({ id: 'x-101', status: 'confirmed' })];

export const <domain>Handlers = [
  <client>Http.get('/<items>', ({ response }) => response(200).json(default<X>s)),
];

export const <domain>Scenarios = {
  with<X>s: (items: <X>[]) => <client>Http.get('/<items>', ({ response }) => response(200).json(items)),
  empty: () => <client>Http.get('/<items>', ({ response }) => response(200).json([])),
  serverError: () =>
    <client>Http.get('/<items>', ({ response }) => response('default').json({ message: 'boom' }, { status: 500 })),
};
```

- Builders return a **valid** object; tests override only what they care about (`aBooking({ guestName: 'Grace Hopper' })`).
- Fixed, readable default values in builders (no faker) – tests assert on them.
- Scenarios are named after the situation (`empty`, `serverError`, `withX`, `unauthorized`, `slow`), return one handler,
  are composable (`worker.use(a(), b())`).
- Handlers in the backend shape (DTO, e.g. snake_case) when the port maps; the mapping is then tested for free.
- No HTTP client spec yet? Use plain `http.get(url, () => HttpResponse.json(...))` from `msw` with the DTO type
  from `<domain>/types` and migrate to `<client>Http` when the spec exists.

## 5. Generated from the contract (`<client>/testing`)

Generated per client from `openapi.yaml|json` (never committed, `generate` target, cached):

| File | Tool | Content |
|---|---|---|
| `schema.ts` | openapi-typescript | `paths`, `components`, `operations` |
| `mocks.ts`, `model/**` | orval (msw mocks only, `useExamples`, faker) | `get<Op>MockHandler(override?)`, `get<Op>ResponseMock()` |
| `http.ts` | openapi-msw | `<client>Http = createOpenApiHttp<paths>({ baseUrl })`, `<client>BaseUrl` |
| `handlers.ts` | – | `<client>Handlers`: one default handler per operation |

```ts
beforeEach(() => worker.use(...<client>Handlers));                                // generated defaults
worker.use(<client>Http.get('/<items>', ({ response }) => response(200).json([a<X>()])));
worker.use(<client>Http.get('/<items>', ({ response }) => response('default').json({ message: 'boom' }, { status: 500 })));
// compile errors: unknown path, undocumented status, wrong body, wrong params/query
```

- **Typed handlers stop mock drift** (deck slide 10): a spec change breaks hand-written handlers at typecheck.
- Use `<client>Http` for all hand-written handlers in `<domain>/testing` and for per-test overrides.
- Generated defaults are good for "something valid comes back" (ports, smoke). Assert only on spec `example`
  values or on structure – put `example` on every property of your own specs.
- Generated factories as data: `const [example] = get<Op>ResponseMock(); { ...example, id: 'n-1' }`.

## 6. Determinism and unhandled requests

- `faker.seed(FAKER_SEED)` before every test → generated data identical in every run and order.
- **Tests never assert random values.** Assert builder defaults, explicit overrides, spec examples, or counts you served.
- No handler → red. Prove it once per port: a test without `worker.use` expecting the rejection and the MSW error log
  (`examples/api-port.spec.ts`, last test). Mutation probe: remove the `beforeEach` → spec must fail with
  `[MSW] Error: intercepted a request without a matching request handler`.
- A handler that throws is turned into a 500 by MSW ("Uncaught exception in the request handler") – fix the handler.

## 7. Asserting outgoing requests

Assert what leaves the app via the handler, not via spies on services:

```ts
const marked: string[] = [];
worker.use(<client>Http.post('/notifications/{id}/read', ({ params, response }) => {
  marked.push(params.id);
  return response(204).empty();
}));
await userEvent.click(page.getByRole('button', { name: 'Mark as read' }));
await expect.poll(() => marked).toEqual(['n-7']);
```

Query/body: `query.get('topic')`, `await request.json()` (typed by openapi-msw).

## 8. msw 3 notes

- `worker.start({ onUnhandledFrame: 'error' })` – msw 3 name of msw 2's `onUnhandledRequest`. Don't copy msw 2 snippets.
- `@vitest/mocker` declares `msw ^2` as optional peer → `pnpm.peerDependencyRules.allowedVersions.msw = "3"`.
- `msw/browser` must resolve with browser conditions (see `02-toolset.md` §4).
- Domain testing libs import only `msw` (and `<client>Http`), never `msw/browser`; only `shared/testing` owns the worker.
