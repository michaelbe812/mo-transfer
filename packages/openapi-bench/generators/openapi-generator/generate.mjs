// Generiert den Client aus beiden Specs (3.0 → client/, 3.1 → client-31/) mit OpenAPI Generator `typescript-angular`.
// Nutzt die Root-Installation von @openapitools/openapi-generator-cli + Root-openapitools.json (pinnt 7.25.0).
// cwd = Repo-Root, damit der relative storageDir der Root-Config greift (kein zweiter JAR-Download).
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const cli = resolve(repoRoot, 'node_modules/.bin/openapi-generator-cli');
const config = resolve(here, 'openapi-generator.config.json');

const run = (spec, outDir) => {
  const output = resolve(here, outDir);
  rmSync(output, { recursive: true, force: true });
  execFileSync(
    cli,
    [
      '--openapitools', resolve(repoRoot, 'openapitools.json'),
      'generate',
      '-g', 'typescript-angular',
      '-i', resolve(here, spec),
      '-o', output,
      '-c', config,
      '--global-property', 'apiDocs=false,modelDocs=false,apiTests=false,modelTests=false',
    ],
    { stdio: 'inherit', cwd: repoRoot },
  );
};

run('../../spec/bench.openapi.yaml', 'client');
try {
  run('../../spec/bench.openapi-3.1.yaml', 'client-31');
} catch (error) {
  console.error('3.1-Generierung fehlgeschlagen:', error.message);
  process.exitCode = 1;
}
