import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Base config for the Angular unit-test builder (`runnerConfig`). Only test
 * runs load it — the app build never sees MSW or its service worker.
 *
 * `/mockServiceWorker.js` needs no publicDir and no committed copy: it is served from the installed
 * msw package (always matches the msw version). Vitest 4 does that itself (plugin
 * `vitest:browser:resolve-virtual`), Vitest 5 no longer does → `mswServiceWorkerPlugin` below.
 */

/**
 * The Angular builder pre-bundles every external package the specs import
 * (`optimizeDeps.include`), Vitest browser mode excludes `msw` from
 * pre-bundling. esbuild rejects "include + exclude" ("The entry point "msw"
 * cannot be marked as external") — keep Vitest's exclude, drop the include.
 */
function mswNotPrebundledPlugin(): Plugin {
  return {
    name: 'testing:msw-not-prebundled',
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
    name: 'testing:browser-conditions',
    configResolved(config) {
      const client = config.environments?.['client']?.resolve;
      if (!client?.conditions.includes('browser')) return;
      client.conditions = client.conditions.filter((condition) => condition !== 'node');
    },
  };
}

/**
 * Serves `/mockServiceWorker.js` from the installed msw package. Required with Vitest 5
 * (otherwise "Service Worker script does not exist at the given path"), a no-op duplicate with Vitest 4.
 */
function mswServiceWorkerPlugin(): Plugin {
  return {
    name: 'testing:msw-service-worker',
    resolveId(id) {
      if (id === '/mockServiceWorker.js') return this.resolve('msw/mockServiceWorker.js', undefined, { skipSelf: true });
      return undefined;
    },
  };
}

export default defineConfig({
  plugins: [mswNotPrebundledPlugin(), browserConditionsPlugin(), mswServiceWorkerPlugin()],
});
