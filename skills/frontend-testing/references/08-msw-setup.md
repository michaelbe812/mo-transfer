# 08 – MSW setup (step by step)

Setting up MSW 3 in a workspace without it. How to use it in specs: `05-msw.md`.
Look up MSW APIs in the official docs instead of guessing (msw 2 snippets are often outdated):

| Topic | Docs |
|---|---|
| Overview | <https://mswjs.io/docs/> |
| Recipe this setup is based on | <https://mswjs.io/docs/recipes/vitest-browser-mode> |
| `setupWorker()` / `worker.start()` options | <https://mswjs.io/docs/api/setup-worker>, <https://mswjs.io/docs/api/setup-worker/start> |
| Request handlers (`http.get`, …) | <https://mswjs.io/docs/api/http> |
| Responses (`HttpResponse.json`, …) | <https://mswjs.io/docs/api/http-response> |
| Organising handlers | <https://mswjs.io/docs/best-practices/structuring-handlers> |

## 1. Install

```sh
pnpm add -D msw @faker-js/faker
pnpm add -D openapi-msw openapi-typescript orval   # only with OpenAPI clients (step 6)
pnpm exec playwright install chromium              # browser for Vitest browser mode, once
```

`@vitest/mocker` declares `msw ^2` as optional peer → allow msw 3 in `package.json`:

```jsonc
"pnpm": {
  "peerDependencyRules": {
    "allowedVersions": { "msw": "3", "openapi-msw>msw": "3" }
  }
}
```

## 2. Runner config

Copy `examples/vitest-base.config.mts` to the workspace root and point every test target at it
(`"runnerConfig": "vitest-base.config.mts"`, `"browsers": ["chromiumHeadless"]`, → `02-toolset.md` §3).
The three plugins fix msw 3 with the Angular builder: pre-bundling overlap, `node` resolve condition, and serving
`/mockServiceWorker.js` from the `msw` package (required with Vitest 5) → `02-toolset.md` §4.

**No `msw init`**: the worker script comes from the installed `msw` package. No committed copy, no `publicDir`,
no app asset.

## 3. `libs/shared/testing`

```sh
nx g @nx/js:lib libs/shared/testing --tags=type:testing,scope:shared   # or the workspace's lib generator; no build target
```

- `src/network.ts` = `examples/network.ts` (one `setupWorker()` without handlers, `onUnhandledFrame: 'error'`,
  auto fixture `worker`, `faker.seed`, `resetHandlers()` after each test, no `stop()`).
- `src/index.ts`: `export { test, worker, FAKER_SEED } from './network';`
- Only this lib imports `msw/browser`.

## 4. `libs/<domain>/testing`

```sh
nx g @nx/js:lib libs/<domain>/testing --tags=type:testing,scope:<domain>
```

- `src/fixtures/<domain>.fixture.ts`: builders `a<X>(overrides)` (`examples/domain-testing/fixtures.ts`).
- `src/handlers/<domain>.handlers.ts`: `<domain>Handlers` (defaults) + `<domain>Scenarios`
  (`examples/domain-testing/handlers.ts`). Imports `msw` / `<client>Http`, never `msw/browser`.

## 5. Boundaries and leak guards

Add the `type:testing` constraints and the bans on test packages to the ESLint config
(`examples/eslint.testing.config.mjs`, → `06-test-organisation.md`). Build tsconfigs exclude `*.spec.ts`.

## 6. Optional: generated mocks from OpenAPI

Per client a generated `<client>/testing` lib (openapi-typescript + orval + openapi-msw) with a `generate-api-testing` target;
the `test` target `dependsOn: ["^generate-api-client", "^generate-api-testing"]` (→ `05-msw.md` §5).

## 7. First spec and verification

```ts
import { <domain>Handlers } from '<scope>/<domain>/testing';
import { test, worker } from '<scope>/shared/testing';   // not from 'vitest'
import { beforeEach, describe, expect } from 'vitest';

describe('…', () => {
  beforeEach(() => worker.use(...<domain>Handlers));
  test('…', async () => { /* render, act, assert */ });
});
```

1. `nx test <project>` → green.
2. Remove the `beforeEach` → must go red with `[MSW] Error: intercepted a request without a matching request handler`
   (proves no real backend is hit). Restore.
3. Spec imports `test` from `vitest` instead of `shared/testing` → must go red (no worker → request fails). Restore.
4. `nx build <app>` and scan the bundle for `msw`, `mockServiceWorker`, `setupWorker`, `faker` → nothing found.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `[MSW] Failed to register a Service Worker … Service Worker script does not exist at the given path. Did you forget to run "npx msw init"?` | Vitest 5: `mswServiceWorkerPlugin` missing or no `runnerConfig` – **don't** run `msw init` |
| `[MSW] Cannot bypass a request when using the "error" strategy` + `intercepted a request without a matching request handler` | intended: handler missing (`beforeEach(() => worker.use(...))`) |
| `The entry point "msw" cannot be marked as external` | `mswNotPrebundledPlugin` missing in `runnerConfig` |
| `No known conditions for "./browser" specifier in "msw" package` | `browserConditionsPlugin` missing in `runnerConfig` |
| Requests reach the real backend / no interception | spec imports `test` from `vitest` instead of `shared/testing` (no fixture → no worker) |
| Follow-up test sees an old override | `resetHandlers()` missing in fixture teardown |
| `onUnhandledRequest` has no effect | msw 2 name; msw 3 uses `onUnhandledFrame` |
| Peer dependency warning `msw ^2` | `pnpm.peerDependencyRules.allowedVersions` (step 1) |
| Other MSW error | check <https://mswjs.io/docs/> before working around it |

