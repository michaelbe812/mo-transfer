import { msw } from 'msw/vite';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Base config for the Angular unit-test builder (`runnerConfig`). Only test
 * runs load it — the app build never sees MSW or its service worker.
 *
 * `/mockServiceWorker.js` needs no publicDir and no committed copy: the official msw Vite plugin
 * (`msw/vite`, mode `worker-only`) serves the worker of the installed msw package, so it always
 * matches the msw version. `worker-only`: no `virtual:msw` (experimental network API) — the worker
 * is set up in `libs/shared/testing/src/network.ts`. Checked by `pnpm verify:nx-internals`
 * (step "MSW worker").
 */

/**
 * The Angular builder pre-bundles every external package the specs import
 * (`optimizeDeps.include`), Vitest browser mode excludes `msw` from
 * pre-bundling. esbuild rejects "include + exclude" ("The entry point "msw"
 * cannot be marked as external") — keep Vitest's exclude, drop the include.
 */
function mswNotPrebundledPlugin(): Plugin {
  return {
    name: 'blueprint:msw-not-prebundled',
    configResolved(config) {
      const { optimizeDeps } = config;
      optimizeDeps.include = optimizeDeps.include?.filter((id) => !optimizeDeps.exclude?.includes(id));
    },
  };
}

/**
 * The Angular builder merges its resolve conditions (`browser`, …) into Vitest's Node defaults, so
 * the browser project resolves with `node` as well. msw 3 maps `msw/browser` to `null` under `node`
 * ("No known conditions for "./browser" specifier in "msw" package") — the browser project must
 * resolve like a browser: drop `node` from the client conditions.
 */
function browserConditionsPlugin(): Plugin {
  return {
    name: 'blueprint:browser-conditions',
    configResolved(config) {
      const client = config.environments?.['client']?.resolve;
      if (!client?.conditions.includes('browser')) return;
      client.conditions = client.conditions.filter((condition) => condition !== 'node');
    },
  };
}

export default defineConfig({
  plugins: [msw({ mode: 'worker-only' }), mswNotPrebundledPlugin(), browserConditionsPlugin()],
  test: {
    // The Angular builder defaults to `globals: true` (project default, merged under this config).
    // Specs import `describe`/`expect`/`vi` from 'vitest' explicitly; the builder's own setup files
    // (`init-testbed`, `vitest-mock-patch`) do too. Without zone.js nothing patches globals.
    globals: false,
  },
});
