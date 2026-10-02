// Generiert den Client aus beiden Specs (3.0 → client/, 3.1 → client-31/) via orval.config.ts.
import { execFileSync } from 'node:child_process';
const run = (project) =>
  execFileSync('npx', ['orval', '--config', 'orval.config.ts', '--project', project], { stdio: 'inherit' });
run('bench');
run('bench31');
