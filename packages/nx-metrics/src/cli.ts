#!/usr/bin/env node
/**
 * Usage: nx-metrics <command> [options]   (installed / built: dist/cli.js)
 *        node --experimental-strip-types src/cli.ts <command> [options]   (from source, Node ≥ 22.6)
 * See USAGE below.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { affectedToMarkdown, replayAffected } from './affected.ts';
import { benchToMarkdown, comparisonToMarkdown } from './bench/compare.ts';
import { loadBenchConfig } from './bench/config.ts';
import { checkoutRef } from './bench/ref.ts';
import { runBench, type BenchResult } from './bench/runner.ts';
import { cacheSizeToMarkdown, findWorkspaceDb, readCacheEntries, summarizeCacheSize } from './cache-size.ts';
import { computeGraphMetrics, graphToMarkdown, readNxGraph } from './graph.ts';
import { DEFAULT_OUTPUT_FILE, summaryLine } from './plugin.ts';
import type { RunRecord } from './record.ts';
import { buildReport, GROUP_BY, reportToMarkdown, type GroupBy } from './report.ts';
import { pushRecords, readJsonl } from './sinks.ts';
import { TOOL } from './version.ts';

const USAGE = `${TOOL}
Usage: nx-metrics <command> [options]        (all commands: --repo <path>, default cwd)

  bench      run benchmark scenarios → <out>/bench.json + bench.md
               --config <file>       default <repo>/nx-metrics.bench.json
               --name <label>        e.g. baseline, after-slicing (default: bench)
               --scenario <a,b>      only these scenarios
               --iterations <n>      override config
               --out <dir>           default <repo>/tmp/nx-metrics/<name>-<timestamp>
               --workspace-state     use the workspace's Nx cache instead of isolated dirs
               --keep-going          continue after a failing iteration
               --ref <rev>           bench another commit (baseline) in a temporary worktree, config from here
               --install <cmd|none>  install command in that worktree (default: from the lockfile)
               --keep-worktree       keep <out>/worktree afterwards
  compare    compare two bench results → markdown
               <baseline/bench.json> <candidate/bench.json> [--out <file.md>]
  report     aggregate run records from the plugin → markdown/json
               --input <file>        repeatable, default <repo>/${DEFAULT_OUTPUT_FILE}
               --group-by <key>      ${GROUP_BY.join(' | ')} (default week)
               --since <date> --until <date>   ISO dates
               --ci-only             only records from CI
               --command <regex>     only matching nx commands (e.g. "affected")
               --rate <€/h>          ROI: value of a saved developer hour (local runs)
               --ci-price <€/min>    ROI: price of a CI minute (CI runs)
               --out <dir>           writes report.md + report.json (default: print markdown)
  graph      project graph structure (blast radius, fan-in/out, chain) [--out <dir>]
  affected   replay last commits against the current graph
               --ref <rev>           default HEAD
               --commits <n>         default 50
               --with-target <t>     only projects with this target (e.g. test)
               --out <dir>
  push       send run records (JSONL, e.g. CI artifacts) to the collector, idempotent per run
               --input <file>        repeatable, default <repo>/${DEFAULT_OUTPUT_FILE}
               --endpoint <url>      default NX_METRICS_ENDPOINT; token: NX_METRICS_TOKEN
  last       summary line of the last runs (also works with the Nx daemon on)
               --count <n>           default 10;  --input <file> as for report
  watch      follow the run records live: one summary line per nx run (second terminal)
               --input <file>        default <repo>/${DEFAULT_OUTPUT_FILE}
  cache-size local Nx cache size per project/target (from .nx/workspace-data, Node ≥ 22.5)
               --target <t>          only this target (e.g. build)
               --out <dir>
  --version, --help`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    repo: { type: 'string' },
    config: { type: 'string' },
    name: { type: 'string' },
    scenario: { type: 'string' },
    iterations: { type: 'string' },
    out: { type: 'string' },
    'workspace-state': { type: 'boolean', default: false },
    'keep-going': { type: 'boolean', default: false },
    input: { type: 'string', multiple: true },
    'group-by': { type: 'string' },
    since: { type: 'string' },
    until: { type: 'string' },
    'ci-only': { type: 'boolean', default: false },
    command: { type: 'string' },
    ref: { type: 'string' },
    commits: { type: 'string' },
    'with-target': { type: 'string' },
    target: { type: 'string' },
    count: { type: 'string' },
    endpoint: { type: 'string' },
    rate: { type: 'string' },
    install: { type: 'string' },
    'keep-worktree': { type: 'boolean', default: false },
    'ci-price': { type: 'string' },
    version: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const repo = resolve(values.repo ?? process.cwd());
const log = (line: string) => console.error(line);

function positiveInt(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new Error(`--${flag} must be a positive integer`);
  return value;
}

function positiveNumber(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Number(raw.replace(',', '.'));
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${flag} must be a number ≥ 0`);
  return value;
}

function timestamp(raw: string | undefined, flag: string): number | undefined {
  if (raw === undefined) return undefined;
  const value = Date.parse(raw);
  if (Number.isNaN(value)) throw new Error(`--${flag}: not a date: ${raw}`);
  return value;
}

/** Writes `<name>.md` + `<name>.json` into --out, or prints the markdown. */
function emit(name: string, markdown: string, json: unknown, outDir = values.out): void {
  if (!outDir) {
    process.stdout.write(markdown);
    return;
  }
  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${name}.md`), markdown);
  writeFileSync(join(dir, `${name}.json`), `${JSON.stringify(json, null, 2)}\n`);
  log(`→ ${join(dir, `${name}.md`)}`);
}

async function bench(): Promise<void> {
  const name = values.name ?? 'bench';
  const outDir = resolve(
    values.out ??
      join(repo, 'tmp', 'nx-metrics', `${name}-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`),
  );
  // config always from the current checkout, so baseline and candidate run the same scenarios
  const config = loadBenchConfig(resolve(values.config ?? join(repo, 'nx-metrics.bench.json')));
  const checkout = values.ref
    ? checkoutRef({ repo, ref: values.ref, dir: join(outDir, 'worktree'), install: values.install, log })
    : undefined;
  try {
    const result = await runBench({
      repo: checkout?.dir ?? repo,
      config,
      outDir,
      name,
      scenarios: values.scenario?.split(',').map((entry) => entry.trim()),
      iterations: positiveInt(values.iterations, 'iterations'),
      workspaceState: values['workspace-state'],
      keepGoing: values['keep-going'],
      log,
    });
    if (checkout) {
      result.ref = { ref: checkout.ref, sha: checkout.sha, pluginAdded: checkout.pluginAdded };
      result.git = { sha: checkout.sha, branch: checkout.ref, dirty: false };
    }
    emit('bench', benchToMarkdown(result), result, outDir);
  } finally {
    if (checkout && !values['keep-worktree']) checkout.cleanup();
  }
}

function compare(): void {
  const [baselineFile, candidateFile] = positionals.slice(1);
  if (!baselineFile || !candidateFile) throw new Error('compare needs <baseline.json> <candidate.json>');
  const read = (file: string) => JSON.parse(readFileSync(resolve(file), 'utf-8')) as BenchResult;
  const markdown = comparisonToMarkdown(read(baselineFile), read(candidateFile));
  if (values.out) {
    writeFileSync(resolve(values.out), markdown);
    log(`→ ${resolve(values.out)}`);
  } else {
    process.stdout.write(markdown);
  }
}

function report(): void {
  const groupBy = (values['group-by'] ?? 'week') as GroupBy;
  if (!GROUP_BY.includes(groupBy)) throw new Error(`--group-by must be ${GROUP_BY.join(' | ')}`);
  const inputs = values.input?.length ? values.input.map((file) => resolve(file)) : [join(repo, DEFAULT_OUTPUT_FILE)];
  const records = inputs.flatMap((file) => readJsonl<RunRecord>(file));
  if (!records.length) throw new Error(`no run records in ${inputs.join(', ')} — plugin registered? (README → Plugin)`);
  const result = buildReport(records, {
    groupBy,
    since: timestamp(values.since, 'since'),
    until: timestamp(values.until, 'until'),
    ciOnly: values['ci-only'],
    command: values.command ? new RegExp(values.command) : undefined,
    ratePerHour: positiveNumber(values.rate, 'rate'),
    ciPricePerMinute: positiveNumber(values['ci-price'], 'ci-price'),
  });
  emit('report', reportToMarkdown(result), result);
}

function graph(): void {
  const metrics = computeGraphMetrics(readNxGraph(repo));
  emit('graph', graphToMarkdown(metrics), metrics);
}

function affected(): void {
  const replay = replayAffected({
    repo,
    ref: values.ref ?? 'HEAD',
    commits: positiveInt(values.commits, 'commits') ?? 50,
    withTarget: values['with-target'],
    log,
  });
  emit('affected', affectedToMarkdown(replay), replay);
}

async function cacheSize(): Promise<void> {
  const dbFile = findWorkspaceDb(repo);
  const entries = (await readCacheEntries(dbFile)).filter((entry) => !values.target || entry.target === values.target);
  const sizes = summarizeCacheSize(dbFile, entries);
  emit('cache-size', cacheSizeToMarkdown(sizes), sizes);
}

function recordsFile(): string {
  return values.input?.[0] ? resolve(values.input[0]) : join(repo, DEFAULT_OUTPUT_FILE);
}

const describe = (record: RunRecord) =>
  `${new Date(record.startTime).toLocaleTimeString()} ${summaryLine(record).replace('[nx-metrics] ', '')}${record.label ? ` [${record.label}]` : ''}`;

function last(): void {
  const records = readJsonl<RunRecord>(recordsFile());
  for (const record of records.slice(-(positiveInt(values.count, 'count') ?? 10))) console.log(describe(record));
}

/** Polls the file size and prints records appended since (works across the daemon, the file is the bridge). */
function watch(): Promise<void> {
  const file = recordsFile();
  let offset = existsSync(file) ? statSync(file).size : 0;
  let rest = '';
  log(`watching ${file} (Ctrl+C to stop)`);
  setInterval(() => {
    if (!existsSync(file)) return;
    const size = statSync(file).size;
    if (size < offset) offset = 0; // truncated / rotated
    if (size === offset) return;
    const buffer = Buffer.alloc(size - offset);
    const fd = openSync(file, 'r');
    readSync(fd, buffer, 0, buffer.length, offset);
    closeSync(fd);
    offset = size;
    const lines = (rest + buffer.toString('utf-8')).split('\n');
    rest = lines.pop() ?? '';
    for (const line of lines.filter((entry) => entry.trim())) {
      try {
        console.log(describe(JSON.parse(line) as RunRecord));
      } catch {
        // partial line
      }
    }
  }, 500);
  return new Promise(() => undefined);
}

async function push(): Promise<void> {
  const endpoint = values.endpoint ?? process.env.NX_METRICS_ENDPOINT;
  if (!endpoint) throw new Error('push needs --endpoint or NX_METRICS_ENDPOINT (e.g. http://localhost:4000/v1/runs)');
  const inputs = values.input?.length ? values.input.map((file) => resolve(file)) : [join(repo, DEFAULT_OUTPUT_FILE)];
  const records = inputs.flatMap((file) => readJsonl<RunRecord>(file));
  const result = await pushRecords(endpoint, records, { token: process.env.NX_METRICS_TOKEN });
  log(
    `pushed ${records.length} records from ${inputs.length} file(s): ${result.inserted} new, ${result.duplicates} already known`,
  );
}

const COMMANDS: Record<string, () => void | Promise<void>> = {
  bench,
  compare,
  report,
  graph,
  affected,
  'cache-size': cacheSize,
  push,
  last,
  watch,
};

async function main(): Promise<void> {
  const command = positionals[0];
  if (values.help || values.version || !command) {
    console.log(values.version ? TOOL : USAGE);
    process.exit(command || values.help || values.version ? 0 : 1);
  }
  const run = COMMANDS[command];
  if (!run) throw new Error(`unknown command "${command}"\n\n${USAGE}`);
  await run();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
