# 02 – Toolset

## 1. Stack

| Tool | Minimum | Role |
|---|---|---|
| Vitest (`vitest`, `@vitest/browser-playwright`, `@vitest/ui`, `@vitest/coverage-v8`) | 4 | runner, browser mode, UI, coverage |
| Playwright | current | browser provider (Chromium) for Vitest; E2E runner |
| MSW (`msw`) | 3 | network mocking via Service Worker |
| openapi-msw | 2 | `createOpenApiHttp<paths>()` – typed handlers |
| openapi-typescript | 7 | `paths`/`components` types from the spec |
| orval | 8 | generated MSW mock handlers + response factories |
| `@faker-js/faker` | any | data in generated mocks (schema-faker: private instance, seeded per value) |

Vitest ≥ 4; with Vitest 5 add the worker plugin (§4). msw 3 needs `pnpm.peerDependencyRules.allowedVersions` for
`msw` (`@vitest/mocker` peer) and `openapi-msw>msw`.

## 2. Vitest browser mode – why

- Tests run in a **real Chromium** (Playwright provider): real layout, events, focus, `fetch`, Service Worker.
  No jsdom gaps, MSW intercepts like in a browser.
- `vitest/browser` provides `page` (locators), `userEvent` (real input via the provider, CDP) and
  `expect.element` (retrying DOM assertions).
- One runner for unit, component and integration tests (deck: "Vitest for everything else").

## 3. Runner and Nx target

Angular's unit-test builder drives Vitest (TestBed init, polyfills, AOT compile, `runnerConfig`).
In Nx libs use `@nx/angular:unit-test` – a thin wrapper that calls the same `@angular/build` builder but accepts
Nx lib build targets (`@nx/angular:ng-packagr-lite`). `@angular/build:unit-test` directly fails for such libs
("The 'buildTarget' is configured to use '@nx/angular:ng-packagr-lite', which is not supported").

```jsonc
// test target (ideally inferred by a local Nx plugin for every lib with a *.spec.ts in src/)
"test": {
  "executor": "@nx/angular:unit-test",
  "cache": true,
  "dependsOn": ["^generate-api-client", "^generate-api-testing"], // generated OpenAPI clients/testing libs first
  "options": {
    "tsConfig": "libs/tsconfig.spec.json",    // include: **/src/**/*.spec.ts
    "runnerConfig": "vitest-base.config.mts",
    "browsers": ["chromiumHeadless"],
    "watch": false
  }
}
```

Apps: `@angular/build:unit-test` with the same options (`runner: "vitest"` is the default).

Useful builder options: `browsers`, `headless`, `ui`, `watch`, `filter` (regex on test names), `include`,
`coverage`, `coverageThresholds`, `reporters`, `providersFile` (global Angular providers), `setupFiles`,
`browserViewport` (e.g. `"1280x800"`), `isolate`.

`isolate`: leave unset = Angular's non-isolated default – all spec files of a project share one page. The MSW fixture is built for
that (worker started once, handlers reset per test). TestBed resets between tests anyway.

## 4. `vitest-base.config.mts` (runnerConfig)

See `examples/vitest-base.config.mts`. Plugins for msw 3 with the Angular builder:

| Problem | Fix |
|---|---|
| Angular pre-bundles `msw` (`optimizeDeps.include`), Vitest browser excludes it → esbuild "cannot be marked as external" | plugin drops the overlap from `include` |
| Builder mixes `node` into the browser resolve conditions; msw 3 maps `msw/browser` to `null` under `node` | plugin removes `node` from client conditions when `browser` is set |
| Worker script `/mockServiceWorker.js` must come from the installed msw (Vitest 5 no longer serves it: "Service Worker script does not exist at the given path") | official `msw({ mode: 'worker-only' })` from `msw/vite` (msw ≥ 3.0.2) |

Keep all three: the two custom plugins are no-ops where their problem doesn't occur (depends on Angular/Vitest/msw versions).

`/mockServiceWorker.js` comes from the installed `msw` package via `msw/vite`, independent of the Vitest version.
No `msw init`, no committed copy, no `publicDir`, no app asset. Not `mode: 'auto'`/`virtual:msw` (experimental network API).

## 5. Running

```sh
pnpm exec playwright install chromium              # once
nx test <project>                                  # headless, CI
nx affected -t lint typecheck test                 # PR gate
nx run <project>:test --ui                         # Vitest UI: watch + headed Chromium with live preview, MSW active
nx run <project>:test --ui --headless              # UI, browser headless
nx run <project>:test --browsers=chromium --watch  # headed, no UI
nx run <project>:test --coverage                   # v8 coverage (indicator, not a gate)
nx run <project>:test --filter='server error'      # only matching tests
```

A combined `--ui` switch (watch + headed) needs a small executor wrapper; plain `@angular/build:unit-test` supports
`ui`, `watch` and `headless` as separate options. Parallel `test` tasks each take a Vitest port (auto fallback: "Port … is in use").

## 6. E2E

Playwright against a real (ephemeral, seeded) backend. Locators and
assertions use the same vocabulary as component tests (`getByRole`, `getByLabel`, `expect(locator).toBeVisible()`),
which makes moving a scenario between levels cheap. Details per project (deck slide 12).
