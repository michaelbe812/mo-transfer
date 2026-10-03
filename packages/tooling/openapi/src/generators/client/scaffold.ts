/**
 * Lib scaffold of the client generator: settings.scaffold (a workspace module or package exporting
 * defineScaffold, loaded like adapters) or the built-in one — project.json (name, tags, edges, targets) +
 * tsconfig.json + the tsconfig.base.json `paths` entry. A workspace with its own lib conventions (buildable libs,
 * ng-packagr, spec config …) plugs in its scaffold, e.g. @mo-transfer/tooling-conventions/openapi-scaffold.
 */
import type { Tree } from '@nx/devkit';
import { defineScaffold, type LibScaffold } from '../../adapter';
import { loadScaffold } from '../../registry/load';
import type { OpenApiSettings } from '../../settings';
import { offsetFromRoot, readJsonFile, writeJsonFile } from '../../tree-helpers';
import { projectNameFor } from '../../settings';

const BASE_TSCONFIG = 'tsconfig.base.json';

export function builtinScaffold(settings: OpenApiSettings): LibScaffold {
  return defineScaffold({
    apiVersion: 1,
    id: 'builtin',
    validateDomain(tree, domain) {
      if (!tree.exists(`${settings.libsDir}/${domain}`)) throw new Error(`Domain "${domain}" has no folder ${settings.libsDir}/${domain}`);
    },
    writeLib(tree, lib) {
      const root = `${settings.libsDir}/${lib.libPath}`;
      const offset = offsetFromRoot(root);
      writeJsonFile(tree, `${root}/project.json`, {
        name: projectNameFor(lib.libPath),
        $schema: `${offset}node_modules/nx/schemas/project-schema.json`,
        projectType: 'library',
        sourceRoot: `${root}/src`,
        tags: lib.tags,
        implicitDependencies: lib.implicitDependencies,
        ...(Object.keys(lib.targets).length ? { targets: lib.targets } : {}),
      });
      writeJsonFile(tree, `${root}/tsconfig.json`, { extends: `${offset}${BASE_TSCONFIG}`, include: ['src/**/*.ts'] });
      addPathsEntry(tree, `${settings.aliasPrefix}${lib.libPath}`, `./${root}/src/index.ts`);
    },
  });
}

function addPathsEntry(tree: Tree, alias: string, target: string): void {
  if (!tree.exists(BASE_TSCONFIG)) return;
  const tsconfig = readJsonFile<{ compilerOptions?: { paths?: Record<string, string[]> } }>(tree, BASE_TSCONFIG);
  const paths = { ...tsconfig.compilerOptions?.paths, [alias]: [target] };
  const sorted = Object.fromEntries(Object.entries(paths).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  writeJsonFile(tree, BASE_TSCONFIG, { ...tsconfig, compilerOptions: { ...tsconfig.compilerOptions, paths: sorted } });
}

/** The scaffold of the workspace: settings.scaffold, else the built-in one. */
export async function resolveScaffold(tree: Tree, settings: OpenApiSettings): Promise<LibScaffold> {
  return settings.scaffold ? loadScaffold(settings.scaffold, tree.root) : builtinScaffold(settings);
}
