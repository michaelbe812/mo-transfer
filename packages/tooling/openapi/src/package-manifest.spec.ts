/**
 * The published manifest (review Low): every generator tool the package imports at run time is an optional peer,
 * Node range declared.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8')) as {
  engines?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

/** imported lazily by adapters / presets / finalize: needed only when that feature is used */
const OPTIONAL_TOOLS = [
  'prettier',
  'orval',
  'openapi-typescript',
  'openapi-msw',
  'msw',
  '@faker-js/faker',
  '@hey-api/openapi-ts',
  '@openapitools/openapi-generator-cli',
  '@nx-plugin-openapi/core',
  '@nx-plugin-openapi/plugin-openapi',
  '@nx-plugin-openapi/plugin-hey-api',
];

describe('package manifest', () => {
  it.each(OPTIONAL_TOOLS)('%s: optional peer dependency', (name) => {
    expect(manifest.peerDependencies?.[name]).toBeDefined();
    expect(manifest.peerDependenciesMeta?.[name]?.optional).toBe(true);
  });

  it('@faker-js/faker: one major only — fake values depend on the faker version (schema-faker runtime)', () => {
    expect(manifest.peerDependencies?.['@faker-js/faker']).toBe('^10.6.0');
  });

  it('nx, @nx/devkit, typescript: required peers; engines.node from the loader (require(esm), node:util)', () => {
    for (const name of ['nx', '@nx/devkit', 'typescript']) {
      expect(manifest.peerDependencies?.[name]).toBeDefined();
      expect(manifest.peerDependenciesMeta?.[name]?.optional).toBeUndefined();
    }
    expect(manifest.engines).toEqual({ node: '>=22.12.0' });
  });
});
