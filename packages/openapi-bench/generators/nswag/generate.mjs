// Generiert den NSwag-Angular-Client aus beiden Specs (3.0 → client/api.ts, 3.1 → client-31/api.ts).
// Konfiguration: nswag.json (openApiToTypeScriptClient, Template Angular); Input/Output per /variables:.
// NSwag-CLI ist ein .NET-Tool (npm-Wrapper `nswag`), Runtime Net80.
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const nswagBin = new URL('../../node_modules/.bin/nswag', import.meta.url).pathname;

function generate(input, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const result = spawnSync(
    nswagBin,
    ['run', 'nswag.json', '/runtime:Net80', `/variables:Input=${input},Output=${outDir}/api.ts`],
    { encoding: 'utf8' },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  process.stdout.write(output);
  if (result.status === 0) return;
  // Generierung fehlgeschlagen (3.1-Spec) → Exception (ohne Stacktrace) dokumentieren, nicht abbrechen.
  const exceptionLines = output.split('\n').filter((line) => /Exception|--->/.test(line) && !/^\s+at /.test(line));
  writeFileSync(
    `${outDir}/GENERATION-FAILED.txt`,
    [`nswag run nswag.json /runtime:Net80 (Input=${input}) → exit ${result.status}`, '', ...exceptionLines, ''].join('\n'),
  );
  console.error(`[nswag] generation failed for ${input}`);
}

generate('../../spec/bench.openapi.yaml', 'client');
generate('../../spec/bench.openapi-3.1.yaml', 'client-31');
