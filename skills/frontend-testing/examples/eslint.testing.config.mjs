// Excerpt: the testing-related parts of a workspace eslint.config.mjs.
// Not standalone: `workspaceDepConstraints` in a real config also holds the layer matrix and the
// generated scope/feat constraints.
import nx from '@nx/eslint-plugin';

/** Layers that ship to production — everything except `type:testing`. */
const productionLayers = ['type:types', 'type:utils', 'type:events', 'type:api', 'type:data', 'type:ui', 'type:feature'];

const layerConstraints = [
  // … layer matrix (types → types, utils → types/utils, …)
  // every production layer — no `type:*` glob, it would match type:testing
  { sourceTag: 'type:feature', onlyDependOnLibsWithTags: productionLayers },
  // app shell: only production libs (scope:shared alone would allow shared/testing)
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: productionLayers },
  // test-only libs: handlers + fixtures build on types and other testing libs, nothing else
  { sourceTag: 'type:testing', onlyDependOnLibsWithTags: ['type:types', 'type:testing', 'scope:shared'] },
];

/** Test tooling never ships: banned in production code, allowed in type:testing and specs. */
const testOnlyPackages = [
  'msw', 'msw/*', 'vitest', 'vitest/*', '@vitest/*', '@testing-library/*', 'playwright', 'playwright/*',
  // generated testing libs of the OpenAPI clients: typed MSW + faker factories
  'openapi-msw', '@faker-js/*',
];
const noTestPackagesInProduction = [...productionLayers, 'type:app'].map((sourceTag) => ({
  sourceTag,
  bannedExternalImports: testOnlyPackages,
}));

export const workspaceDepConstraints = [
  ...layerConstraints,
  ...noTestPackagesInProduction,
  // … scope:* / feat:* constraints generated from the project graph
];

/**
 * Specs (+ test setup files): the same architecture, plus `type:testing` —
 * also a foreign domain's testing lib (a feature spec may need the booking
 * handlers behind the booking port). Test packages are allowed.
 * Unchanged: `scope:shared` (shared never knows a domain, so only
 * shared/testing), `type:types` (testing libs build on types: a types spec
 * importing them would be a cycle), feat isolation.
 */
const keepsItsTargetsInSpecs = ['type:types', 'type:testing', 'scope:shared', 'type:tooling'];
export const specDepConstraints = workspaceDepConstraints
  .filter((constraint) => !noTestPackagesInProduction.includes(constraint))
  .map((constraint) =>
    constraint.onlyDependOnLibsWithTags &&
    !keepsItsTargetsInSpecs.includes(constraint.sourceTag) &&
    !constraint.sourceTag.startsWith('feat:')
      ? { ...constraint, onlyDependOnLibsWithTags: [...constraint.onlyDependOnLibsWithTags, 'type:testing'] }
      : constraint,
  );

export const specFiles = ['**/*.spec.ts', '**/*.test.ts', '**/test-setup.ts'];

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  {
    files: ['**/*.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        { enforceBuildableLibDependency: true, depConstraints: workspaceDepConstraints },
      ],
    },
  },
  {
    files: specFiles,
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          // buildable libs import the non-buildable testing libs — in specs only,
          // which the lib build (tsconfig.lib.json) excludes
          enforceBuildableLibDependency: false,
          depConstraints: specDepConstraints,
        },
      ],
    },
  },
];
