#!/usr/bin/env node
// Benchmark-Lauf: je Generator generieren (Zeit), Output vermessen (Dateien, LOC, any, Strict-Compile, Deps, Bundle),
// Test-Suites (types / static / runtime) ausführen und Ergebnisse je Case-ID nach results/ schreiben.
//
//   node scripts/run-bench.mjs [--only a,b] [--runs 3] [--skip-generate] [--skip-tests]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const benchRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(benchRoot, '..', '..');
const generatorsDir = join(benchRoot, 'generators');
const resultsDir = join(benchRoot, 'results');
const require = createRequire(join(repoRoot, 'package.json'));
const ts = require('typescript');
const esbuild = createRequire(join(benchRoot, 'package.json'))('esbuild');

const args = parseArgs(process.argv.slice(2));
const cases = JSON.parse(readFileSync(join(benchRoot, 'spec', 'cases.json'), 'utf8')).cases;

/** Gewichtung der Dimensionen im Gesamtscore (Fokus Typsicherheit + Korrektheit + Angular). */
export const DIMENSION_WEIGHTS = { types: 0.35, runtime: 0.35, angular: 0.2, static: 0.1 };
/** Pakete, die als Laufzeit-Abhängigkeit nicht zählen. */
const ALLOWED_RUNTIME_IMPORTS = [/^@angular\//, /^rxjs(\/|$)/, /^tslib$/];
/**
 * A-TREESHAKE: das one-op-Bundle (nur getPet) darf keinen Code fremder Operationen enthalten —
 * geprüft über deren Pfad-Literale. (Reine Größen-Ratio wäre unfair für Clients ohne Code je Operation.)
 */
/** Negativ-Case → Positiv-Kontrolle, die bestehen muss, damit der Negativ-Case zählt. */
const POSITIVE_CONTROLS = { 'R-AUTH-NONE': 'R-AUTH-BEARER' };
const FOREIGN_OPERATION_PATHS = ['/polymorphism/shapes', '/bodies/multipart', '/auth/basic', '/responses/download', '/naming/special-properties'];

function parseArgs(argv) {
  const out = { only: null, runs: 3, skipGenerate: false, skipTests: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--only') out.only = argv[++i].split(',');
    else if (arg === '--runs') out.runs = Number(argv[++i]);
    else if (arg === '--skip-generate') out.skipGenerate = true;
    else if (arg === '--skip-tests') out.skipTests = true;
  }
  return out;
}

function log(...parts) {
  console.log('[bench]', ...parts);
}

function listGenerators() {
  return readdirSync(generatorsDir)
    .filter((id) => existsSync(join(generatorsDir, id, 'meta.json')))
    .filter((id) => !args.only || args.only.includes(id))
    .sort();
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

// ------------------------------------------------------------------ generation

function measureGeneration(id) {
  const cwd = join(generatorsDir, id);
  const timings = [];
  let error = null;
  for (let run = 0; run < args.runs; run++) {
    const start = performance.now();
    const result = spawnSync('node', ['generate.mjs'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    timings.push(Math.round(performance.now() - start));
    if (result.status !== 0) {
      error = (result.stderr || result.stdout || '').slice(-2000);
      break;
    }
  }
  return { ms: median(timings), runs: timings, error };
}

// ------------------------------------------------------------------ source stats

function walkFiles(dir, predicate = () => true) {
  if (!existsSync(dir)) return [];
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(full, predicate));
    else if (predicate(full)) files.push(full);
  }
  return files;
}

const isTs = (file) => /\.(m|c)?tsx?$/.test(file);

function sourceStats(dir) {
  const files = walkFiles(dir);
  let loc = 0;
  let bytes = 0;
  for (const file of files) {
    bytes += statSync(file).size;
    if (isTs(file)) loc += readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).length;
  }
  return { files: files.length, tsFiles: files.filter(isTs).length, loc, bytes };
}

/**
 * Zählt explizite `any` (AnyKeyword) im generierten Code. `inTypes`: innerhalb von Interface-/Type-Alias-/
 * Enum-Deklarationen und Klassen-Properties ohne Initialisierungslogik (= Modell-Oberfläche).
 * `tsNoCheck`: Dateien mit `@ts-nocheck` (blendet Typfehler aus).
 */
function anyStats(dir) {
  let total = 0;
  let inTypes = 0;
  let tsNoCheck = 0;
  for (const file of walkFiles(dir, isTs)) {
    const text = readFileSync(file, 'utf8');
    if (/@ts-nocheck/.test(text)) tsNoCheck++;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = (node, inModel) => {
      const model =
        inModel ||
        ts.isInterfaceDeclaration(node) ||
        ts.isTypeAliasDeclaration(node) ||
        (ts.isPropertyDeclaration(node) && ts.isClassDeclaration(node.parent));
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        total++;
        if (model) inTypes++;
      }
      ts.forEachChild(node, (child) => visit(child, model));
    };
    visit(source, false);
  }
  return { total, inTypes, tsNoCheckFiles: tsNoCheck };
}

function runtimeImports(dir) {
  const packages = new Set();
  const importPattern = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const file of walkFiles(dir, isTs)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(importPattern)) {
      const spec = match[1] ?? match[2] ?? match[3];
      if (!spec || spec.startsWith('.') || spec.startsWith('/')) continue;
      // reine Typ-Importe zählen nicht als Laufzeit-Abhängigkeit
      if (/^\s*(import|export)\s+type\b/.test(match[0])) continue;
      const name = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (!ALLOWED_RUNTIME_IMPORTS.some((pattern) => pattern.test(name))) packages.add(name);
    }
  }
  return [...packages].sort();
}

// ------------------------------------------------------------------ compile

function countTscErrors(id, baseConfig) {
  const genDir = join(generatorsDir, id);
  const own = JSON.parse(readFileSync(join(genDir, 'tsconfig.json'), 'utf8'));
  const configPath = join(genDir, `.tsconfig.${baseConfig}.tmp.json`);
  writeFileSync(
    configPath,
    JSON.stringify({
      extends: relative(genDir, join(benchRoot, `tsconfig.${baseConfig}.json`)),
      // bewusst ohne eigene compilerOptions des Generators: gleiche Messlatte für alle
      include: own.include ?? ['client/**/*.ts'],
    }),
  );
  try {
    const tsc = join(repoRoot, 'node_modules', '.bin', 'tsc');
    const result = spawnSync(tsc, ['-p', configPath, '--pretty', 'false', '--noEmit'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const lines = (result.stdout + result.stderr).split('\n').filter((line) => /error TS\d+/.test(line));
    const byCode = {};
    for (const line of lines) {
      const code = line.match(/error (TS\d+)/)[1];
      byCode[code] = (byCode[code] ?? 0) + 1;
    }
    return {
      errors: lines.length,
      syntaxErrors: countSyntaxErrors(configPath),
      byCode,
      sample: lines.slice(0, 8).map((line) => line.replace(genDir + '/', '')),
    };
  } finally {
    rmSync(configPath, { force: true });
  }
}

/** Syntaktische Diagnosen: sobald es welche gibt, meldet tsc keine semantischen Fehler mehr (Zahl dann zu niedrig). */
function countSyntaxErrors(configPath) {
  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  if (!parsed) return 0;
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
  return program.getSyntacticDiagnostics().length;
}

// ------------------------------------------------------------------ bundle

async function bundleSize(id, entry) {
  const genDir = join(generatorsDir, id);
  const entryPath = join(genDir, 'bundle', entry);
  if (!existsSync(entryPath)) return null;
  try {
    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      minify: true,
      format: 'esm',
      platform: 'browser',
      target: 'es2022',
      write: false,
      treeShaking: true,
      external: ['@angular/*', 'rxjs', 'rxjs/*', 'tslib'],
      tsconfig: join(genDir, 'tsconfig.json'),
      logLevel: 'silent',
    });
    const code = result.outputFiles[0].contents;
    const text = new TextDecoder().decode(code);
    const foreignPaths = FOREIGN_OPERATION_PATHS.filter((path) => text.includes(path));
    return { bytes: code.length, gzip: gzipSync(code).length, foreignPaths };
  } catch (error) {
    return { error: String(error.message ?? error).slice(0, 500) };
  }
}

// ------------------------------------------------------------------ tests

function readVitestJson(file) {
  if (!existsSync(file)) return null;
  const report = JSON.parse(readFileSync(file, 'utf8'));
  const results = [];
  for (const testFile of report.testResults ?? []) {
    for (const assertion of testFile.assertionResults ?? []) {
      results.push({
        title: assertion.title,
        fullName: assertion.fullName,
        status: assertion.status,
        message: (assertion.failureMessages ?? []).join('\n').split('\n').slice(0, 3).join(' ').slice(0, 400),
      });
    }
    // Datei konnte nicht kompiliert/geladen werden → alle Tests darin fehlen
    if ((testFile.assertionResults ?? []).length === 0 && testFile.status === 'failed') {
      results.push({ title: '__FILE_ERROR__', file: testFile.name, status: 'failed', message: String(testFile.message).slice(0, 400) });
    }
  }
  return results;
}

function runSuite(id, suite) {
  mkdirSync(join(resultsDir, 'raw'), { recursive: true });
  const outFile = join(resultsDir, 'raw', `${id}.${suite}.json`);
  rmSync(outFile, { force: true });
  const start = performance.now();
  let result;
  if (suite === 'runtime') {
    result = spawnSync(
      'npx',
      ['nx', 'run', `openapi-bench-${id}:test-runtime`, '--skip-nx-cache', '--reporters=json', `--outputFile=${outFile}`],
      { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, NX_DAEMON: 'false' } },
    );
  } else {
    // types: eigenes tsc-Programm je Generator — ein Syntaxfehler (TS1xxx) in einem Generator würde sonst
    // alle semantischen Fehler (= fehlschlagende Typ-Tests) der anderen verdecken.
    const isolatedTsconfig = join(benchRoot, `.tsconfig.types-${id}.tmp.json`);
    if (suite === 'types') {
      writeFileSync(isolatedTsconfig, JSON.stringify({ extends: './tsconfig.types.json', include: [`generators/${id}/tests/**/*.test-d.ts`] }));
    }
    const extra = suite === 'types' ? [`--typecheck.tsconfig=${isolatedTsconfig}`] : [];
    result = spawnSync(
      'npx',
      ['vitest', 'run', '--config', `vitest.${suite}.config.mts`, ...extra, `generators/${id}/`, '--reporter=json', `--outputFile=${outFile}`],
      { cwd: benchRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    rmSync(isolatedTsconfig, { force: true });
  }
  const tests = readVitestJson(outFile);
  return {
    ms: Math.round(performance.now() - start),
    exitCode: result.status,
    crashed: tests === null,
    log: tests === null ? (result.stdout + result.stderr).slice(-3000) : undefined,
    tests: tests ?? [],
  };
}

const CASE_ID = /^\s*\[([A-Z0-9][A-Z0-9-]*)\]/;

function statusOf(vitestStatus) {
  if (vitestStatus === 'passed') return 'pass';
  if (vitestStatus === 'failed') return 'fail';
  return 'unsupported'; // skipped | pending | todo
}

// ------------------------------------------------------------------ scoring

function measuredCaseResults(metrics) {
  const out = {};
  const { bundle, any, strict, maxStrict, runtimeDeps } = metrics;
  const ratio = bundle.oneOp?.bytes && bundle.allOps?.bytes ? bundle.oneOp.bytes / bundle.allOps.bytes : null;
  const foreign = bundle.oneOp?.foreignPaths;
  out['A-TREESHAKE'] = {
    status: !foreign ? 'fail' : foreign.length === 0 ? 'pass' : 'fail',
    note: !foreign
      ? 'Bundle-Messung fehlgeschlagen'
      : `${foreign.length ? `fremde Operationen im one-op-Bundle: ${foreign.join(', ')}` : 'keine fremden Operationen im one-op-Bundle'}${ratio ? `; one-op/all-ops = ${(ratio * 100).toFixed(1)}%` : ''}`,
  };
  out['S-NO-ANY-MODELS'] = {
    status: any.inTypes === 0 && any.tsNoCheckFiles === 0 ? 'pass' : 'fail',
    note: `${any.inTypes} any in Typdeklarationen, ${any.total} gesamt${any.tsNoCheckFiles ? `, ${any.tsNoCheckFiles} Dateien mit @ts-nocheck` : ''}`,
  };
  out['S-STRICT-COMPILE'] = {
    status: strict.errors === 0 && any.tsNoCheckFiles === 0 ? 'pass' : 'fail',
    note: `${strict.errors} Fehler${any.tsNoCheckFiles ? ` (+ @ts-nocheck in ${any.tsNoCheckFiles} Dateien)` : ''}`,
  };
  out['S-MAX-STRICT-COMPILE'] = {
    status: maxStrict.errors === 0 && any.tsNoCheckFiles === 0 ? 'pass' : 'fail',
    note: `${maxStrict.errors} Fehler`,
  };
  out['S-NO-RUNTIME-DEPS'] = {
    status: runtimeDeps.length === 0 ? 'pass' : 'fail',
    note: runtimeDeps.length ? runtimeDeps.join(', ') : 'keine',
  };
  return out;
}

function collectCaseResults(suites, measured) {
  const byId = {};
  const duplicates = [];
  const unknown = [];
  const known = new Set(cases.map((c) => c.id));
  for (const [suite, run] of Object.entries(suites)) {
    for (const test of run.tests) {
      const match = test.title.match(CASE_ID) ?? test.fullName?.match(CASE_ID);
      if (!match) continue;
      const id = match[1];
      if (!known.has(id)) {
        unknown.push(id);
        continue;
      }
      if (byId[id]) duplicates.push(id);
      byId[id] = { status: statusOf(test.status), suite, note: test.status === 'failed' ? test.message : test.status === 'passed' ? undefined : test.title };
    }
  }
  for (const [id, result] of Object.entries(measured)) byId[id] = { ...result, suite: 'measured' };
  for (const testCase of cases) {
    if (!byId[testCase.id]) byId[testCase.id] = { status: 'missing', suite: null };
  }
  return { byId, duplicates, unknown };
}

function score(byId) {
  const dims = {};
  const cats = {};
  for (const testCase of cases) {
    const points = byId[testCase.id].status === 'pass' ? testCase.weight : 0;
    for (const [bucket, key] of [
      [dims, testCase.dimension],
      [cats, testCase.category],
    ]) {
      bucket[key] ??= { points: 0, max: 0, pass: 0, fail: 0, unsupported: 0, missing: 0 };
      bucket[key].points += points;
      bucket[key].max += testCase.weight;
      bucket[key][byId[testCase.id].status]++;
    }
  }
  for (const bucket of [dims, cats]) for (const value of Object.values(bucket)) value.pct = Math.round((value.points / value.max) * 1000) / 10;
  const overall = Object.entries(DIMENSION_WEIGHTS).reduce((sum, [dim, weight]) => sum + (dims[dim]?.pct ?? 0) * weight, 0);
  return { overall: Math.round(overall * 10) / 10, dimensions: dims, categories: cats };
}

// ------------------------------------------------------------------ environment

function tryVersion(cmd, cmdArgs) {
  try {
    // java -version schreibt auf stderr
    const result = spawnSync(cmd, cmdArgs, { encoding: 'utf8' });
    return `${result.stdout}${result.stderr}`.split('\n')[0].trim() || 'n/a';
  } catch {
    return 'n/a';
  }
}

function environment() {
  const pkgVersion = (name) => {
    try {
      return require(`${name}/package.json`).version;
    } catch {
      return 'n/a';
    }
  };
  return {
    date: new Date().toISOString(),
    node: process.version,
    typescript: ts.version,
    angular: pkgVersion('@angular/core'),
    vitest: pkgVersion('vitest'),
    java: tryVersion('java', ['-version']),
    dotnet: tryVersion('dotnet', ['--version']),
    platform: `${process.platform} ${process.arch}`,
  };
}

// ------------------------------------------------------------------ main

async function benchGenerator(id) {
  const genDir = join(generatorsDir, id);
  const meta = JSON.parse(readFileSync(join(genDir, 'meta.json'), 'utf8'));
  log(`── ${id} (${meta.name} ${meta.version})`);

  const generation = args.skipGenerate ? null : measureGeneration(id);
  if (generation) log(`   generate: ${generation.ms} ms${generation.error ? ' (FEHLER)' : ''}`);

  const clientDir = join(genDir, 'client');
  const metrics = {
    source: sourceStats(clientDir),
    source31: sourceStats(join(genDir, 'client-31')),
    any: anyStats(clientDir),
    runtimeDeps: [...new Set([...runtimeImports(clientDir), ...(meta.runtimeDeps ?? [])])].sort(),
    strict: countTscErrors(id, 'base'),
    maxStrict: countTscErrors(id, 'max-strict'),
    bundle: { oneOp: await bundleSize(id, 'one-op.ts'), allOps: await bundleSize(id, 'all-ops.ts') },
  };
  log(`   strict: ${metrics.strict.errors} / max-strict: ${metrics.maxStrict.errors} Fehler, any: ${metrics.any.total}`);

  const suites = {};
  if (!args.skipTests) {
    for (const suite of ['types', 'static', 'runtime']) {
      suites[suite] = runSuite(id, suite);
      const counts = suites[suite].tests.reduce((acc, test) => ((acc[test.status] = (acc[test.status] ?? 0) + 1), acc), {});
      log(`   ${suite}: ${JSON.stringify(counts)}${suites[suite].crashed ? ' (CRASH)' : ''} in ${suites[suite].ms} ms`);
    }
  }

  const { byId, duplicates, unknown } = collectCaseResults(suites, measuredCaseResults(metrics));
  // Negativ-Cases ohne positive Kontrolle sind wertlos: R-AUTH-NONE zählt nur, wenn Bearer überhaupt funktioniert
  for (const [negative, positive] of Object.entries(POSITIVE_CONTROLS)) {
    if (byId[negative]?.status === 'pass' && byId[positive]?.status !== 'pass') {
      byId[negative] = { status: byId[positive].status, suite: byId[negative].suite, note: `${positive} nicht bestanden → ${negative} ohne Aussagekraft` };
    }
  }
  // Workarounds in der Generator-Konfiguration (z. B. ausgeschlossene Operationen) dürfen den Score nicht schönen
  for (const workaround of meta.workarounds ?? []) {
    for (const caseId of workaround.forceFail ?? []) {
      byId[caseId] = { status: 'fail', suite: 'workaround', note: `Workaround: ${workaround.description}` };
    }
  }
  const result = {
    id,
    meta,
    generation,
    metrics,
    suites: Object.fromEntries(Object.entries(suites).map(([key, run]) => [key, { ms: run.ms, exitCode: run.exitCode, crashed: run.crashed, log: run.log }])),
    cases: byId,
    integrity: { duplicates, unknown, missing: Object.entries(byId).filter(([, r]) => r.status === 'missing').map(([caseId]) => caseId) },
    score: score(byId),
  };
  writeFileSync(join(resultsDir, `${id}.json`), JSON.stringify(result, null, 2) + '\n');
  log(`   score: ${result.score.overall} (types ${result.score.dimensions.types?.pct}, runtime ${result.score.dimensions.runtime?.pct}, angular ${result.score.dimensions.angular?.pct}, static ${result.score.dimensions.static?.pct})`);
  if (result.integrity.missing.length) log(`   WARN fehlende Cases: ${result.integrity.missing.join(', ')}`);
  return result;
}

async function main() {
  mkdirSync(resultsDir, { recursive: true });
  const ids = listGenerators();
  log(`Generatoren: ${ids.join(', ')}`);
  const results = [];
  for (const id of ids) results.push(await benchGenerator(id));

  // Gesamtergebnis: vorhandene Einzelergebnisse (auch aus früheren --only-Läufen) zusammenführen
  const all = readdirSync(resultsDir)
    .filter((file) => file.endsWith('.json') && file !== 'results.json')
    .map((file) => JSON.parse(readFileSync(join(resultsDir, file), 'utf8')))
    .sort((a, b) => b.score.overall - a.score.overall);
  writeFileSync(
    join(resultsDir, 'results.json'),
    JSON.stringify({ environment: environment(), dimensionWeights: DIMENSION_WEIGHTS, generators: all.map((r) => r.id) }, null, 2) + '\n',
  );
  log('fertig → results/*.json; Matrix: node scripts/build-matrix.mjs');
}

await main();
