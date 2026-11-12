/** Markdown for one bench result and the before/after comparison of two (baseline vs. candidate). */
import { formatMs, formatPercent } from '../stats.ts';
import type { BenchResult, ScenarioResult } from './runner.ts';

export interface ScenarioDelta {
  scenario: string;
  baseline?: ScenarioResult;
  candidate?: ScenarioResult;
  deltaMs?: number;
  deltaRatio?: number;
  /** |Δ median| larger than both runs' stddev combined — below that it is noise. */
  significant: boolean;
}

export function compareBench(baseline: BenchResult, candidate: BenchResult): ScenarioDelta[] {
  const names = [...new Set([...baseline.scenarios, ...candidate.scenarios].map((scenario) => scenario.name))];
  return names.map((scenario) => {
    const before = baseline.scenarios.find((entry) => entry.name === scenario);
    const after = candidate.scenarios.find((entry) => entry.name === scenario);
    if (!before?.stats || !after?.stats) return { scenario, baseline: before, candidate: after, significant: false };
    const deltaMs = after.stats.median - before.stats.median;
    return {
      scenario,
      baseline: before,
      candidate: after,
      deltaMs,
      deltaRatio: deltaMs / before.stats.median,
      significant: Math.abs(deltaMs) > before.stats.stddev + after.stats.stddev,
    };
  });
}

/** Differences that make the comparison unfair (other machine, other Nx, other iteration count). */
export function comparabilityWarnings(baseline: BenchResult, candidate: BenchResult): string[] {
  const warnings: string[] = [];
  const machine = (result: BenchResult) =>
    `${result.machine.os}/${result.machine.arch}, ${result.machine.cpus} CPUs, ${result.machine.memoryGb} GB`;
  if (machine(baseline) !== machine(candidate))
    warnings.push(`different machine: ${machine(baseline)} vs. ${machine(candidate)}`);
  if (baseline.machine.nx !== candidate.machine.nx)
    warnings.push(`different Nx version: ${baseline.machine.nx} vs. ${candidate.machine.nx}`);
  if (baseline.machine.node !== candidate.machine.node)
    warnings.push(`different Node version: ${baseline.machine.node} vs. ${candidate.machine.node}`);
  if (baseline.iterations !== candidate.iterations)
    warnings.push(`different iteration count: ${baseline.iterations} vs. ${candidate.iterations}`);
  if (candidate.git.dirty || baseline.git.dirty) warnings.push('a bench ran on a dirty working tree');
  return warnings;
}

const signed = (ms: number) => `${ms > 0 ? '+' : ms < 0 ? '−' : '±'}${formatMs(Math.abs(ms))}`;
const signedPercent = (ratio: number) => `${ratio > 0 ? '+' : ratio < 0 ? '−' : '±'}${formatPercent(Math.abs(ratio))}`;

function header(result: BenchResult): string {
  return `**${result.name}** · ${result.git.branch ?? '?'}@${result.git.sha?.slice(0, 8) ?? '?'}${result.git.dirty ? ' (dirty)' : ''} · ${result.startedAt.slice(0, 16).replace('T', ' ')} · ${result.machine.cpuModel ?? result.machine.arch}, ${result.machine.cpus} CPUs · Nx ${result.machine.nx ?? '?'}`;
}

export function benchToMarkdown(result: BenchResult): string {
  const lines = [
    `# Nx bench: ${result.name}`,
    '',
    header(result),
    '',
    `${result.iterations} iterations + ${result.warmup} warmup per scenario, Nx state ${result.isolatedState ? 'isolated per scenario' : 'of the workspace'}.`,
    ...(result.pluginRecorded
      ? []
      : ['', '> Plugin not registered: cache columns empty (wall-clock only). See README → Plugin.']),
    '',
    '| Scenario | median | p90 | min | max | ± stddev | tasks | miss | local hit | remote hit | failed |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const scenario of result.scenarios) {
    const { stats, tasks } = scenario;
    const perIteration = (value?: number) =>
      value === undefined ? '–' : (value / scenario.iterations.length).toFixed(1);
    lines.push(
      `| ${scenario.name} | ${formatMs(stats?.median)} | ${formatMs(stats?.p90)} | ${formatMs(stats?.min)} | ${formatMs(stats?.max)} | ${formatMs(stats?.stddev)} | ${perIteration(tasks?.total)} | ${perIteration(tasks?.miss)} | ${formatPercent(scenario.localHitRate)} | ${formatPercent(scenario.remoteHitRate)} | ${scenario.failed} |`,
    );
  }
  lines.push('', '## Scenarios', '');
  for (const scenario of result.scenarios) {
    const touched = scenario.touch.length ? `, touches ${scenario.touch.map((file) => `\`${file}\``).join(', ')}` : '';
    lines.push(
      `- **${scenario.name}**: \`${scenario.command}\` (cache ${scenario.cache}${scenario.remoteCache ? '' : ', remote off'}${touched})${scenario.description ? ` — ${scenario.description}` : ''}`,
    );
    if (scenario.slowestMisses.length) {
      lines.push(
        `  - slowest misses (median): ${scenario.slowestMisses.map((task) => `\`${task.id}\` ${formatMs(task.medianMs)}`).join(', ')}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

export function comparisonToMarkdown(baseline: BenchResult, candidate: BenchResult): string {
  const warnings = comparabilityWarnings(baseline, candidate);
  const lines = [
    `# Nx bench: ${baseline.name} → ${candidate.name}`,
    '',
    `- before: ${header(baseline)}`,
    `- after: ${header(candidate)}`,
    ...(warnings.length ? ['', ...warnings.map((warning) => `> ⚠ ${warning}`)] : []),
    '',
    '| Scenario | median before | median after | Δ | Δ % | p90 before | p90 after | hit rate before | hit rate after | |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ];
  for (const delta of compareBench(baseline, candidate)) {
    const { baseline: before, candidate: after } = delta;
    const verdict =
      delta.deltaMs === undefined ? 'n/a' : !delta.significant ? 'noise' : delta.deltaMs < 0 ? 'faster' : 'slower';
    lines.push(
      `| ${delta.scenario} | ${formatMs(before?.stats?.median)} | ${formatMs(after?.stats?.median)} | ${delta.deltaMs === undefined ? '–' : signed(delta.deltaMs)} | ${delta.deltaRatio === undefined ? '–' : signedPercent(delta.deltaRatio)} | ${formatMs(before?.stats?.p90)} | ${formatMs(after?.stats?.p90)} | ${formatPercent(before?.tasks?.hitRate)} | ${formatPercent(after?.tasks?.hitRate)} | ${verdict} |`,
    );
  }
  lines.push('', '"noise": |Δ median| ≤ stddev before + stddev after — more iterations or a quieter machine needed.');
  return `${lines.join('\n')}\n`;
}
