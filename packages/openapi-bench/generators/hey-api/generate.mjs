// Generiert client/ (3.0) und client-31/ (3.1) mit der bench-lokalen @hey-api/openapi-ts 0.99.0
// (Repo-Root hat eine ältere 0.83.1 → bewusst ../../node_modules/.bin/openapi-ts).
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const bin = fileURLToPath(new URL('../../node_modules/.bin/openapi-ts', import.meta.url));
const cwd = fileURLToPath(new URL('.', import.meta.url));
execFileSync(bin, ['-f', 'openapi-ts.config.ts', '--no-log-file'], { stdio: 'inherit', cwd });
