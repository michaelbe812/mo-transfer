import { faker } from '@faker-js/faker';
import { setupWorker } from 'msw/browser';
import { test as testBase } from 'vitest';

/**
 * One MSW worker for the whole test browser, without initial handlers: a
 * request nobody mocked is an error instead of a silent real fetch.
 * Exported for `beforeEach(() => worker.use(...defaultHandlers))`.
 */
export const worker = setupWorker();

/**
 * Seed of the GLOBAL faker instance, reset before every test — for code that draws from the global `faker`:
 * hand-written builders and the deprecated `orval` mocks engine. The default engine `schema-faker` does not
 * need it: its runtime uses a private faker instance seeded per value (stable without this seed, see
 * packages/tooling/openapi/README.md → Stabile Fake-Daten).
 */
export const FAKER_SEED = 42;

let workerStarted: Promise<unknown> | undefined;

/** Registers the service worker once; later calls reuse the running worker. */
function startWorker(): Promise<unknown> {
  workerStarted ??= worker.start({
    onUnhandledFrame: 'error',
    quiet: true,
    serviceWorker: { url: '/mockServiceWorker.js' },
  });
  return workerStarted;
}

/**
 * Vitest browser-mode `test` with MSW, as in the recipe
 * https://mswjs.io/docs/recipes/vitest-browser-mode/ (no `stop`) — except
 * that the worker is started only once (all specs of a lib share the page)
 * and has no initial handlers: each spec sets its defaults in `beforeEach`.
 *
 * `worker` is an auto fixture: Vitest resolves fixtures for `beforeEach`
 * too, so the worker runs before a spec's `beforeEach` adds its default
 * handlers. `worker.use(...)` inside a test is prepended and wins;
 * `resetHandlers()` after each test removes both. The global faker is re-seeded per test (hand-written
 * faker data independent of test order; schema-faker handlers are stable anyway).
 */
export const test = testBase.extend<{ worker: typeof worker }>({
  worker: [
    // Vitest reads fixture dependencies from the destructuring pattern — `{}` = none
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      faker.seed(FAKER_SEED);
      await startWorker();
      await use(worker);
      worker.resetHandlers();
    },
    { auto: true },
  ],
});
