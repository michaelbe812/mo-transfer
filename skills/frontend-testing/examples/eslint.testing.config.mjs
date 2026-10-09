// Excerpt: the testing-related parts of the workspace eslint.config.mjs (reduced blueprint, see docs/nx-reduziert.md).
// Not standalone: the real config also holds the full layer matrix, the HTTP ban outside data-access, the
// generated scope/feat constraints, tooling constraints, the deep-import ban and the naming rules.
import nx from '@nx/eslint-plugin';

/** Layers that ship to production — everything except `type:testing`. */
const productionLayers = ['type:types', 'type:utils', 'type:data-access', 'type:state', 'type:ui', 'type:feature'];

const layerConstraints = [
  // … layer matrix (types → types, utils → types/utils, data-access → …, state → …, ui → types/utils/ui)
  // every production layer — no `type:*` glob, it would match type:testing
  { sourceTag: 'type:feature', onlyDependOnLibsWithTags: productionLayers },
  // app shell: only slice entries and shared ...
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: ['entry', 'scope:shared'] },
  // ... and of those only production libs (scope:shared alone would allow shared/testing)
  { sourceTag: 'type:app', onlyDependOnLibsWithTags: productionLayers },
  // test-only libs: handlers + fixtures build on types (incl. the generated DTOs) and other testing libs, nothing else
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

/** Closed slices (no ports): one constraint per scope, generated from the tags in the project graph. */
const scopeConstraints = (slices) => [
  { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
  ...slices.map((scope) => ({ sourceTag: scope, onlyDependOnLibsWithTags: [scope, 'scope:shared'] })),
];

export const blueprintDepConstraints = [
  ...layerConstraints,
  ...noTestPackagesInProduction,
  ...scopeConstraints(['scope:booking', 'scope:checkin', 'scope:layout']),
  // … feat:<f> → feat:<f>, feat:none (no sibling feats), tooling constraints
];

/**
 * Specs (+ test setup files): the same architecture, plus `type:testing` of the own slice and shared — the scope
 * constraints stay (closed slices: no foreign slice's testing lib, there is no cross-slice code to test against).
 * Test packages are allowed. Unchanged: every `scope:*`, `type:types` (testing libs build on types: a types spec
 * importing them would be a cycle), `type:testing`, `type:tooling`, feat isolation.
 */
const keepsItsTargetsInSpecs = ['type:types', 'type:testing', 'type:tooling'];
export const specDepConstraints = blueprintDepConstraints
  .filter((constraint) => !noTestPackagesInProduction.includes(constraint))
  .map((constraint) =>
    constraint.onlyDependOnLibsWithTags &&
    !keepsItsTargetsInSpecs.includes(constraint.sourceTag) &&
    !constraint.sourceTag.startsWith('scope:') &&
    !constraint.sourceTag.startsWith('feat:') &&
    !constraint.sourceTag.startsWith('tooling:')
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
        { enforceBuildableLibDependency: true, depConstraints: blueprintDepConstraints },
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
