/**
 * Lib scaffold for @mo-transfer/tooling-openapi (openapi-clients.json → settings.scaffold): the generated client
 * libs get the same explicit config as every blueprint lib (lib-files.ts: project.json with derived tags,
 * tsconfig*, package.json + ng-package.json for buildable parts) + their paths entry.
 *
 * Structural SPI v1 (apiVersion, id, validateDomain, writeLib) — no import of the openapi package: conventions
 * stays the base that knows no other tooling lib. Loaded at run time by the openapi client generator.
 */
import type { Tree } from '@nx/devkit';
import { assertSliceExists, writeLibConfig } from './tree';

interface ScaffoldLib {
  libPath: string;
  implicitDependencies: string[];
  targets: Record<string, Record<string, unknown>>;
}

const openapiScaffold = {
  apiVersion: 1 as const,
  id: 'blueprint',
  validateDomain: (tree: Tree, domain: string): void => assertSliceExists(tree, domain),
  writeLib(tree: Tree, lib: ScaffoldLib): void {
    // tags + buildability follow the path (deriveTags: generated client part → scope, layer, generated);
    // no peerDependencies: the generated code is gitignored
    writeLibConfig(tree, lib.libPath, {
      implicitDependencies: lib.implicitDependencies,
      peerDependencies: {},
      ...(Object.keys(lib.targets).length ? { targets: lib.targets } : {}),
    });
  },
};

export default openapiScaffold;
