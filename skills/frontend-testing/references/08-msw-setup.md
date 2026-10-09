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
pnpm add -D openapi-msw openapi-typescript         # only with OpenAPI clients (step 6)
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

Exists in this repo. In a new workspace: a lib `libs/shared/testing` with tags `scope:shared type:testing feat:none`,
no build target (here written by the workspace generators — never `@nx/angular:library`).

- `src/network.ts` = `examples/network.ts` (one `setupWorker()` without handlers, `onUnhandledFrame: 'error'`,
  auto fixture `worker`, `faker.seed`, `resetHandlers()` after each test, no `stop()`).
- `src/index.ts`: `export { test, worker, FAKER_SEED } from './network';` + `withBaseline`, `Scenarios` (`src/handlers.ts`).
- Only this lib imports `msw/browser`.

## 4. `libs/<slice>/testing`

```sh
nx g @mo-transfer/tooling-workspace:testing <slice>   # scaffold on the baseline of the slice's clients; --examples for sample data
```

- `src/fixtures/<x>.fixture.ts`: builders `a<X>(overrides)` returning the generated DTOs (`examples/slice-testing/fixtures.ts`).
- `src/handlers/<slice>.handlers.ts`: `<slice>Handlers` (defaults) + `<slice>Scenarios`
  (`examples/slice-testing/handlers.ts`). Imports `msw` / `<client>Http`, never `msw/browser`.

## 5. Boundaries and leak guards

The `type:testing` constraints and the bans on test packages are in `eslint.config.mjs`
(excerpt `examples/eslint.testing.config.mjs`, → `06-test-organisation.md`). Build tsconfigs exclude `*.spec.ts`.

## 6. Optional: generated mocks from OpenAPI

Per client a generated `<client>/testing` lib (openapi-typescript + openapi-msw + schema-faker) with a `generate-api-testing` target;
the `test` target `dependsOn: ["^generate-api-client", "^generate-api-testing"]` (→ `05-msw.md` §5).

## 7. First spec and verification

```ts
import { <slice>Handlers } from '@mo-transfer/<slice>/testing';
import { test, worker } from '@mo-transfer/shared/testing';   // not from 'vitest'
import { beforeEach, describe, expect } from 'vitest';

describe('…', () => {
  beforeEach(() => worker.use(...<slice>Handlers));
  test('…', async () => { /* render, act, assert */ });
});
```

1. `nx test <project>` → green.
2. Remove the `beforeEach` → must go red with `[MSW] Error: intercepted a request without a matching request handler`
   (proves no real backend is hit). Restore.
3. Spec imports `test` from `vitest` instead of `shared/testing` → must go red (no worker → request fails). Restore.
4. `pnpm verify` (builds the client and scans the bundle for `msw`, `vitest`, `faker`) → nothing found.

## 8. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `[MSW] Failed to register a Service Worker … Service Worker script does not exist at the given path. Did you forget to run "npx msw init"?` | `msw({ mode: 'worker-only' })` (`msw/vite`) missing or no `runnerConfig` – **don't** run `msw init` |
| `[MSW] Cannot bypass a request when using the "error" strategy` + `intercepted a request without a matching request handler` | intended: handler missing (`beforeEach(() => worker.use(...))`) |
| `The entry point "msw" cannot be marked as external` | `mswNotPrebundledPlugin` missing in `runnerConfig` |
| `No known conditions for "./browser" specifier in "msw" package` | `browserConditionsPlugin` missing in `runnerConfig` |
| Requests reach the real backend / no interception | spec imports `test` from `vitest` instead of `shared/testing` (no fixture → no worker) |
| Follow-up test sees an old override | `resetHandlers()` missing in fixture teardown |
| `onUnhandledRequest` has no effect | msw 2 name; msw 3 uses `onUnhandledFrame` |
| Peer dependency warning `msw ^2` | `pnpm.peerDependencyRules.allowedVersions` (step 1) |
| Other MSW error | check <https://mswjs.io/docs/> before working around it |

