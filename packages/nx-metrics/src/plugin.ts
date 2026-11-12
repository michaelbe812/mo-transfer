/**
 * Nx plugin: records every `nx run`/`run-many`/`affected` via the `postTasksExecution` hook (Nx ≥ 20.5).
 *
 *   nx.json → "plugins": [{ "plugin": "@berger-engineering/nx-metrics/plugin", "options": { "outputFile": ".nx/metrics/runs.jsonl" } }]
 *
 * Env overrides (CI): NX_METRICS_DISABLED, NX_METRICS_FILE (`off` disables the file), NX_METRICS_ENDPOINT,
 * NX_METRICS_TOKEN (never in nx.json), NX_METRICS_LABEL, NX_METRICS_TAGS="k=v,k=v", NX_METRICS_CONSOLE=summary|json.
 * Measuring must never break a build: every error ends as a warning.
 */
import { isAbsolute, join, relative } from 'node:path';
import {
  detectCi,
  detectRemoteCache,
  gitInfo,
  isEnvReliable,
  isTruthy,
  machineInfo,
  parseTags,
  type Env,
} from './environment.ts';
import { toRunRecord, type HookContext, type RunMeta, type RunRecord } from './record.ts';
import { appendJsonl, postJson } from './sinks.ts';
import { formatMs, formatPercent } from './stats.ts';

export interface NxMetricsOptions {
  /** JSON-lines file, relative to the workspace root; `false` disables it. Default `.nx/metrics/runs.jsonl`. */
  outputFile?: string | false;
  /** Collector URL; each run is POSTed as JSON. */
  endpoint?: string;
  timeoutMs?: number;
  /** Static tags merged into every record (e.g. `{ "repo": "checkout" }`). */
  tags?: Record<string, string>;
  disabled?: boolean;
  /** Print each run to the terminal (stderr): `summary` one line, `json` the full record. Default off. */
  console?: ConsoleMode;
}

export type ConsoleMode = 'off' | 'summary' | 'json';

interface PluginContext extends HookContext {
  readonly workspaceRoot: string;
  readonly nxJsonConfiguration: { nxCloudId?: string; nxCloudAccessToken?: string; neverConnectToCloud?: boolean };
}

export const DEFAULT_OUTPUT_FILE = '.nx/metrics/runs.jsonl';

export const name = '@berger-engineering/nx-metrics';

export function resolveOutputFile(workspaceRoot: string, options: NxMetricsOptions, env: Env): string | undefined {
  const configured = env.NX_METRICS_FILE ?? options.outputFile ?? DEFAULT_OUTPUT_FILE;
  if (configured === false || configured === '' || configured === 'off') return undefined;
  return isAbsolute(configured) ? configured : join(workspaceRoot, configured);
}

/** Relative inside the workspace, absolute outside (no `../../..`). */
export function displayPath(workspaceRoot: string, file: string): string {
  const path = relative(workspaceRoot, file);
  return path.startsWith('..') ? file : path;
}

export function resolveConsoleMode(options: NxMetricsOptions, env: Env): ConsoleMode {
  const configured = env.NX_METRICS_CONSOLE ?? options.console ?? 'off';
  if (configured === 'json') return 'json';
  if (configured === 'summary' || configured === 'true' || configured === '1') return 'summary';
  return 'off';
}

/** `[nx-metrics] affected -t test · 12 tasks: 3 miss, 8 local, 1 remote (75.0 % hit) · 4.21 s → .nx/metrics/runs.jsonl` */
export function summaryLine(record: RunRecord, destination?: string): string {
  const { summary } = record;
  const hitRate = summary.hitRate === undefined ? '' : ` (${formatPercent(summary.hitRate)} hit)`;
  const failed = summary.failed ? `, ${summary.failed} failed` : '';
  const target = destination ? ` → ${destination}` : '';
  return `[nx-metrics] ${record.command} · ${summary.total} tasks: ${summary.miss} miss, ${summary.localHit} local, ${summary.remoteHit} remote${hitRate}${failed} · ${formatMs(record.durationMs)}${target}`;
}

export function collectMeta(context: PluginContext, options: NxMetricsOptions, env: Env): RunMeta {
  const ci = detectCi(env);
  return {
    label: env.NX_METRICS_LABEL || undefined,
    tags: { ...options.tags, ...parseTags(env.NX_METRICS_TAGS) },
    ci,
    git: gitInfo(context.workspaceRoot, ci),
    machine: machineInfo(context.workspaceRoot),
    remoteCache: detectRemoteCache(context.argv, env, context.nxJsonConfiguration),
    envReliable: isEnvReliable(env),
  };
}

export async function postTasksExecution(options: NxMetricsOptions | undefined, context: PluginContext): Promise<void> {
  const settings = options ?? {};
  const env = process.env;
  if (settings.disabled || isTruthy(env.NX_METRICS_DISABLED)) return;
  try {
    const record = toRunRecord(context, collectMeta(context, settings, env));
    const file = resolveOutputFile(context.workspaceRoot, settings, env);
    if (file) appendJsonl(file, record);
    const endpoint = env.NX_METRICS_ENDPOINT || settings.endpoint;
    const consoleMode = resolveConsoleMode(settings, env);
    if (consoleMode === 'json') console.error(JSON.stringify(record, null, 2));
    if (consoleMode === 'summary') {
      console.error(
        summaryLine(record, [file && displayPath(context.workspaceRoot, file), endpoint].filter(Boolean).join(' + ')),
      );
    }
    if (endpoint)
      await postJson(endpoint, record, { token: env.NX_METRICS_TOKEN, timeoutMs: settings.timeoutMs ?? 3000 });
  } catch (error) {
    console.warn(`[nx-metrics] run not recorded: ${error instanceof Error ? error.message : String(error)}`);
  }
}
