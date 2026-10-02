// Generiert den Client aus beiden Specs mit derselben Konfiguration (ng-openapi-gen.json):
//   3.0 → client/      (input/output aus der Config)
//   3.1 → client-31/   (input/output per CLI überschrieben)
import { execFileSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const cwd = dirname(fileURLToPath(import.meta.url));
const bin = '../../node_modules/.bin/ng-openapi-gen';
const run = (...extra) => execFileSync(bin, ['--config', 'ng-openapi-gen.json', ...extra], { stdio: 'inherit', cwd });

run();
try {
  run('--input', '../../spec/bench.openapi-3.1.yaml', '--output', 'client-31');
} catch (error) {
  console.error('[ng-openapi-gen] 3.1-Generierung fehlgeschlagen:', error.message);
  process.exitCode = 1;
}
