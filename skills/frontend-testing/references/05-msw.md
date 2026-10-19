# 05 – MSW (msw 3, Vitest browser mode)

Examples: `examples/network.ts` (shared/testing), `examples/slice-testing/{fixtures,handlers}.ts`,
`examples/store.spec.ts`, `examples/data-access.spec.ts`. Based on the official recipe
<https://mswjs.io/docs/recipes/vitest-browser-mode>.
API details (handlers, `HttpResponse`, `worker.use`, lifecycle events, …): MSW docs <https://mswjs.io/docs/>.
Setting MSW up from scratch: `08-msw-setup.md`.

## 1. Building blocks

| Piece | Lib | Content |
|---|---|---|
| `worker`, `test`, `withBaseline`, `Scenarios`, `aNotification()` | `libs/shared/testing` | one `setupWorker()` + Vitest `test.extend` with auto fixture `worker`; layering helper + scenario type; builders of the shared clients |
| `a<X>()` builders | `libs/<slice>/testing/src/fixtures/` | valid generated DTOs with sensible defaults, `overrides` |
| `<slice>Handlers`, `<slice>Scenarios`, `default<X>s` | `libs/<slice>/testing/src/handlers/` | curated defaults on the generated baseline + named deviations, typed via `<client>Http` |
| `<client>Http`, `paths` (+ `<client>Handlers`, bodies from spec examples) | `libs/[<slice>/]generated/<client>/testing` | generated from the OpenAPI spec (openapi-typescript, openapi-msw; mocks engine `examples`) |

## 2. The worker fixture (`shared/testing`)

```ts
export const worker = setupWorker();                    // no initial handlers

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
- Every spec imports `test` from `@mo-transfer/shared/testing`, not from `vitest` (otherwise no fixture → no worker). `describe`/`expect`/`beforeEach`/`vi` still come from `vitest`.

## 3. Defaults per spec, deviations per test

```ts
import { <slice>Handlers, <slice>Scenarios } from '@mo-transfer/<slice>/testing';
import { test, worker } from '@mo-transfer/shared/testing';

describe('…', () => {
  beforeEach(() => worker.use(...<slice>Handlers));                      // defaults (module export `worker`)

  test('happy path', async () => { /* … */ });

  test('server error', async ({ worker }) => {
    worker.use(<slice>Scenarios.serverError());                         // prepended → wins over the default
    /* … */
  });
});
```

Order (Vitest 4 resolves auto fixtures for `beforeEach` too): fixture setup (worker running) →
`beforeEach` (defaults) → test (`worker.use` prepends, newest handler wins) → fixture teardown (`resetHandlers`).
Without `resetHandlers` a follow-up test sees stale overrides.

## 4. Fixtures and scenarios (`<slice>/testing`)

```ts
// fixtures/<x>.fixture.ts — <X> is the generated DTO (`@mo-transfer/<slice>/generated/<client>/types`)
let nextId = 1;
export function a<X>(overrides: Partial<<X>> = {}): <X> {
  return { id: `<x>-${nextId++}`, name: 'Ada Lovelace', status: 'pending', ...overrides };
}

// handlers/<slice>.handlers.ts
export const default<X>s: <X>[] = [a<X>({ id: 'x-100' }), a<X>({ id: 'x-101', status: 'confirmed' })];

const curated<Slice>Handlers = [
  <client>Http.get('/<items>', ({ response }) => response(200).json(default<X>s)),
];

// curated first (wins), then the generated baseline of every client the slice uses (own + shared)
export const <slice>Handlers = withBaseline(curated<Slice>Handlers, <client>Handlers, <sharedClient>Handlers);

export const <slice>Scenarios = {
  with<X>s: (items: <X>[]) => <client>Http.get('/<items>', ({ response }) => response(200).json(items)),
  empty: () => <client>Http.get('/<items>', ({ response }) => response(200).json([])),
  serverError: () =>
    <client>Http.get('/<items>', ({ response }) => response('default').json({ message: 'boom' }, { status: 500 })),
} satisfies Scenarios;
```

- **Layering** (`withBaseline` from `shared/testing`): MSW answers with the first matching handler → curated
  handlers win, the baseline answers every other operation (a store or feature touching a new endpoint gets valid
  spec data without extra setup), a test's `worker.use(scenario)` wins over both. Prove "curated wins" once: spec
  examples ≠ curated defaults, the store spec asserts the curated values.
- Who uses what: state/feature specs → `<slice>Handlers` + `<slice>Scenarios`; data-access specs (the wrapper
  around the generated client) → `<client>Handlers` + typed `<client>Http` overrides.
- New slice: `nx g @mo-transfer/tooling-workspace:testing <slice>` (or `…:domain <slice>`) writes only the
  scaffold (empty `curated…`, baseline of the slice's own clients, empty scenarios); `--examples` adds example
  builders/handlers/scenarios + a store spec.

- Builders return a **valid** object; tests override only what they care about (`aBooking({ guestName: 'Grace Hopper' })`).
- Fixed, readable default values in builders (no faker) – tests assert on them.
- Scenarios are named after the situation (`empty`, `serverError`, `withX`, `unauthorized`, `slow`), return one handler,
  are composable (`worker.use(a(), b())`).
- Builders return the **generated DTO** (`Partial<Checkin>` → `Checkin`, snake_case if the backend sends it) —
  the same type the app uses in every layer. No second, hand-written shape; there is no mapping in between.
- No generated client yet (fresh slice from the `domain` generator)? Use plain `http.get(url, () => HttpResponse.json(...))`
  from `msw` with the placeholder type from `<slice>/types` and migrate to `<client>Http` + the generated DTOs
  as soon as the client exists (`nx g @mo-transfer/tooling-openapi:client <name> --domain=<slice>`).

## 5. Generated from the contract (`<client>/testing`)

Generated per client from `openapi.yaml|json` (never committed, `generate-api-testing` target, cached):

| File | Tool | Content |
|---|---|---|
| `schema.ts` | openapi-typescript | `paths`, `components`, `operations` |
| `http.ts` | openapi-msw | `<client>Http = createOpenApiHttp<paths>({ baseUrl })`, `<client>BaseUrl` |
| `handlers.ts` | testing preset (`examples`) | `<client>Handlers`: one handler per operation on `<client>Http`, body computed at generation time (spec examples, fixed placeholders otherwise) – typecheck checks it against the spec |

Mocks engine (`openapi-clients.json → settings.testing.mocks`, per client `pipeline.testing.mocks`): **`none`** is the
library default (only `schema.ts`, `http.ts`, `index.ts` — handlers by hand on `<client>Http`); `examples` adds
`handlers.ts` (this repo opts in, the slice baseline needs `<client>Handlers`). No generated test data, no faker:
generated lib = contract + baseline, test data = builders in the slice testing lib. Details:
`packages/tooling/openapi/README.md`.

```ts
beforeEach(() => worker.use(...<client>Handlers));                                // generated defaults
worker.use(<client>Http.get('/<items>', ({ response }) => response(200).json([a<X>()])));
worker.use(<client>Http.get('/<items>', ({ response }) => response('default').json({ message: 'boom' }, { status: 500 })));
// compile errors: unknown path, undocumented status, wrong body, wrong params/query
```

- **Typed handlers stop mock drift** (deck slide 10): a spec change breaks hand-written handlers at typecheck.
- Use `<client>Http` for all hand-written handlers in `<slice>/testing` and for per-test overrides.
- Generated defaults are good for "something valid comes back" (data-access, smoke). Assert on spec `example` values
  literally (`[{ id: 10, name: 'doggie' }]`) or on structure – put `example` on every property of your own specs
  (otherwise placeholders: property name, `0`, `false`, `2026-01-01`).
- Test data for overrides: builders, not generated factories – `aCheckin({ id: 'c-7' })`, `aNotification({ read: true })`.

## 6. Determinism and unhandled requests

- Generated baseline is deterministic by construction: bodies are literals written at generation time (same spec →
  byte-identical `handlers.ts`), no seed, no faker. Limits: one static response per operation (query/path params
  ignored), no list↔detail consistency.
- **Tests never assert random values.** Assert builder defaults, explicit overrides, spec examples, or counts you
  served.
- No handler → red. Prove it once per data-access class: a test without `worker.use` expecting the rejection and the MSW error log
  (`examples/data-access.spec.ts`, first test). Mutation probe: remove the `beforeEach` → spec must fail with
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
- Slice testing libs import only `msw` (and `<client>Http`), never `msw/browser`; only `shared/testing` owns the worker.
