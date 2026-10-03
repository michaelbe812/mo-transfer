/**
 * Build step 2 of @mo-transfer/tooling-openapi (step 1: tsc -p tsconfig.lib.json → dist/packages/tooling/openapi):
 * the publishable package.json (exports .ts → .js + types, no `private`, no devDependencies) and the assets Nx
 * reads at run time (executors.json, generators.json, JSON schemas, README). Run by Node's type stripping:
 *   node --experimental-strip-types scripts/prepare-dist.mts [--clean] [--out <dir>]
 * (`--out`: another target folder, e.g. the dist smoke test; default dist/packages/tooling/openapi)
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const distRoot = outIndex > 0 ? process.argv[outIndex + 1] : join(packageRoot, '../../../dist/packages/tooling/openapi');

if (process.argv.includes('--clean')) {
  rmSync(distRoot, { recursive: true, force: true });
  process.exit(0);
}

type Manifest = Record<string, unknown> & { exports: Record<string, string>; main: string };
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8')) as Manifest;
const toJs = (file: string): string => file.replace(/\.ts$/, '.js');
const toTypes = (file: string): string => file.replace(/\.ts$/, '.d.ts');

// workspace-only fields: `private` (blocks a publish of the sources), devDependencies (tests)
const published: Record<string, unknown> = { ...manifest };
delete published['private'];
delete published['devDependencies'];
const exports = Object.fromEntries(
  Object.entries(manifest.exports).map(([subpath, file]) =>
    file.endsWith('.ts') ? [subpath, { types: toTypes(file), default: toJs(file) }] : [subpath, file],
  ),
);
writeFileSync(
  join(distRoot, 'package.json'),
  `${JSON.stringify({ ...published, main: toJs(manifest.main), types: toTypes(manifest.main), exports, files: ['**/*'] }, null, 2)}\n`,
);

for (const file of ['executors.json', 'generators.json', 'openapi-clients.schema.json', 'README.md']) {
  cpSync(join(packageRoot, file), join(distRoot, file));
}
/** every JSON below src/ (executor/generator schemas) */
const copyJson = (dir: string): void => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) copyJson(path);
    else if (entry.name.endsWith('.json')) {
      const target = join(distRoot, relative(packageRoot, path));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(path, target);
    }
  }
};
copyJson(join(packageRoot, 'src'));
// schema-faker runtime: copied as TypeScript source into every testing lib, never compiled into the package
const runtime = 'src/pipeline/schema-faker/runtime/mock-runtime.ts';
mkdirSync(dirname(join(distRoot, runtime)), { recursive: true });
cpSync(join(packageRoot, runtime), join(distRoot, runtime));
if (!existsSync(join(distRoot, 'src/index.js'))) throw new Error('dist incomplete: run tsc -p tsconfig.lib.json first');
console.log(`${relative(process.cwd(), distRoot)}: package.json + assets ready (npm pack --dry-run there)`);
