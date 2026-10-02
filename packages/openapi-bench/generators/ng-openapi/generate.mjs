// Generiert den Client aus beiden Specs (3.0 → client/, 3.1 → client-31/) aus openapi.config.ts.
//
// Warum programmatisch statt `ng-openapi -c openapi.config.ts`: die CLI lädt .ts-Configs per require()+ts-node,
// das scheitert an "type": "module" im Bench-package.json. Daher: Config per Node-Type-Stripping importieren und
// generateFromConfig() (öffentliche API von ng-openapi) aufrufen.
//
// WORKAROUND (dokumentiert in NOTES.md/meta.json): ng-openapi 0.4.1 stürzt bei Enums mit `null`-Wert ab
// (toEnumKey(null) → "Cannot read properties of null (reading 'toString')"), egal ob enumStyle enum/union.
// Die unveränderte 3.0-Spec wird IMMER zuerst versucht (Fehler wird geloggt); nur wenn das scheitert, wird eine
// In-Memory-Kopie erzeugt, in der `null` aus `enum`-Listen mit `nullable: true` entfernt wird (semantisch gleich:
// nullable bleibt erhalten). Sonst keinerlei Änderungen an Spec oder Output.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

if (!process.features.typescript) {
  // Node 22.16: Type-Stripping nur per Flag → sich selbst mit Flag neu starten.
  const child = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], {
    stdio: 'inherit',
    cwd: here,
  });
  process.exit(child.status ?? 1);
}

// package.json von ng-openapi zeigt (main) auf nicht existierendes index.cjs → index.js (CJS) direkt laden.
const ngOpenapiIndex = resolve(dirname(createRequire(import.meta.url).resolve('ng-openapi/package.json', { paths: [here] })), 'index.js');
const requireFromNgOpenapi = createRequire(ngOpenapiIndex);
const { generateFromConfig } = requireFromNgOpenapi(ngOpenapiIndex);
const yaml = requireFromNgOpenapi('js-yaml');
const { default: config30, config31 } = await import('./openapi.config.ts');

const absolutize = (config) => ({ ...config, input: resolve(here, config.input), output: resolve(here, config.output) });

/** Entfernt `null` aus enum-Listen von nullable-Schemas (Workaround für Crash in toEnumKey). */
function stripNullFromNullableEnums(node) {
  if (Array.isArray(node)) node.forEach(stripNullFromNullableEnums);
  else if (node && typeof node === 'object') {
    if (Array.isArray(node.enum) && node.nullable === true && node.enum.includes(null)) {
      node.enum = node.enum.filter((value) => value !== null);
      console.warn(`  workaround: null aus enum entfernt → [${node.enum.join(', ')}] (nullable: true bleibt)`);
    }
    Object.values(node).forEach(stripNullFromNullableEnums);
  }
}

async function generate(config) {
  rmSync(config.output, { recursive: true, force: true });
  await generateFromConfig(config);
  console.log(`ng-openapi: ${config.output} ok`);
}

for (const config of [config30, config31].map(absolutize)) {
  try {
    await generate(config);
  } catch (error) {
    console.error(`ng-openapi FAILED for unveränderte Spec ${config.input}: ${error.message}`);
    const spec = yaml.load(readFileSync(config.input, 'utf8'));
    stripNullFromNullableEnums(spec);
    const workaroundInput = join(mkdtempSync(join(tmpdir(), 'ng-openapi-bench-')), 'spec.workaround.json');
    writeFileSync(workaroundInput, JSON.stringify(spec, null, 2));
    try {
      await generate({ ...config, input: workaroundInput });
      console.warn(`ng-openapi: ${config.output} NUR mit Workaround generiert`);
    } catch (retryError) {
      console.error(`ng-openapi FAILED auch mit Workaround: ${retryError.message}`);
      process.exitCode = 1;
    }
  }
}
