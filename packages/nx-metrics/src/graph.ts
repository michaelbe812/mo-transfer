/**
 * Structure metrics of the project graph (`nx graph --file`): how far a change ripples.
 * Finer slicing pays off when the blast radius (transitive dependents) shrinks — not when the project count grows.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runNx } from './nx.ts';
import { formatPercent, summarize, type Summary } from './stats.ts';

export interface NxGraphFile {
  graph: {
    nodes: Record<string, { name: string; type: string; data: { root: string; tags?: string[] } }>;
    dependencies: Record<string, Array<{ source: string; target: string; type: string }>>;
  };
}

export interface ProjectMetric {
  name: string;
  root: string;
  type: string;
  fanOut: number;
  fanIn: number;
  /** All projects that (transitively) depend on this one = what `affected` rebuilds when it changes. */
  blastRadius: number;
}

export interface GraphMetrics {
  projects: number;
  edges: number;
  /** edges / (n · (n − 1)): 0 = isolated, 1 = everything knows everything. */
  density: number;
  fanOut: Summary;
  fanIn: Summary;
  blastRadius: Summary;
  /** Mean blast radius / project count: share of the workspace a typical change hits. */
  blastRadiusRatio: number;
  /** Longest dependency chain (projects) = minimal sequential build depth. */
  longestChain: number;
  cycles: boolean;
  topBlastRadius: ProjectMetric[];
  projectMetrics: ProjectMetric[];
}

function adjacency(file: NxGraphFile): {
  names: string[];
  deps: Map<string, Set<string>>;
  dependents: Map<string, Set<string>>;
} {
  const names = Object.keys(file.graph.nodes);
  const known = new Set(names);
  const deps = new Map(names.map((name) => [name, new Set<string>()]));
  const dependents = new Map(names.map((name) => [name, new Set<string>()]));
  for (const [source, edges] of Object.entries(file.graph.dependencies)) {
    if (!known.has(source)) continue;
    for (const edge of edges) {
      if (!known.has(edge.target) || edge.target === source) continue; // npm:* and self edges
      deps.get(source)?.add(edge.target);
      dependents.get(edge.target)?.add(source);
    }
  }
  return { names, deps, dependents };
}

function reachable(start: string, next: Map<string, Set<string>>): Set<string> {
  const seen = new Set<string>();
  const stack = [...(next.get(start) ?? [])];
  while (stack.length) {
    const current = stack.pop() as string;
    if (seen.has(current) || current === start) continue;
    seen.add(current);
    stack.push(...(next.get(current) ?? []));
  }
  return seen;
}

/** Longest path in projects; detects cycles (then the chain is a lower bound). */
function longestChain(names: string[], deps: Map<string, Set<string>>): { length: number; cycles: boolean } {
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  let cycles = false;
  const visit = (name: string): number => {
    const known = depth.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) {
      cycles = true;
      return 0;
    }
    visiting.add(name);
    let deepest = 0;
    for (const dependency of deps.get(name) ?? []) deepest = Math.max(deepest, visit(dependency));
    visiting.delete(name);
    depth.set(name, deepest + 1);
    return deepest + 1;
  };
  const length = names.reduce((max, name) => Math.max(max, visit(name)), 0);
  return { length, cycles };
}

export function computeGraphMetrics(file: NxGraphFile, top = 10): GraphMetrics {
  const { names, deps, dependents } = adjacency(file);
  const projectMetrics = names.map((name) => ({
    name,
    root: file.graph.nodes[name].data.root,
    type: file.graph.nodes[name].type,
    fanOut: deps.get(name)?.size ?? 0,
    fanIn: dependents.get(name)?.size ?? 0,
    blastRadius: reachable(name, dependents).size,
  }));
  const edges = projectMetrics.reduce((sum, project) => sum + project.fanOut, 0);
  const blast = summarize(projectMetrics.map((project) => project.blastRadius)) as Summary;
  const chain = longestChain(names, deps);
  return {
    projects: names.length,
    edges,
    density: names.length > 1 ? edges / (names.length * (names.length - 1)) : 0,
    fanOut: summarize(projectMetrics.map((project) => project.fanOut)) as Summary,
    fanIn: summarize(projectMetrics.map((project) => project.fanIn)) as Summary,
    blastRadius: blast,
    blastRadiusRatio: names.length ? blast.mean / names.length : 0,
    longestChain: chain.length,
    cycles: chain.cycles,
    topBlastRadius: [...projectMetrics].sort((a, b) => b.blastRadius - a.blastRadius).slice(0, top),
    projectMetrics,
  };
}

export function readNxGraph(repo: string): NxGraphFile {
  const dir = mkdtempSync(join(tmpdir(), 'nx-metrics-graph-'));
  try {
    const file = join(dir, 'graph.json');
    runNx(repo, ['graph', `--file=${file}`]);
    return JSON.parse(readFileSync(file, 'utf-8')) as NxGraphFile;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const fixed = (value: number, digits = 2) => value.toFixed(digits);

export function graphToMarkdown(metrics: GraphMetrics): string {
  const row = (label: string, summary: Summary) =>
    `| ${label} | ${fixed(summary.mean)} | ${fixed(summary.median, 0)} | ${fixed(summary.p90, 1)} | ${summary.max} |`;
  return [
    '# Nx project graph',
    '',
    `- projects: **${metrics.projects}**, edges: ${metrics.edges}, density: ${fixed(metrics.density, 4)}`,
    `- longest dependency chain: ${metrics.longestChain} projects${metrics.cycles ? ' (⚠ cycles in graph)' : ''}`,
    `- mean blast radius: **${fixed(metrics.blastRadius.mean)} projects = ${formatPercent(metrics.blastRadiusRatio)} of the workspace**`,
    '',
    '| per project | mean | median | p90 | max |',
    '|---|---:|---:|---:|---:|',
    row('fan-out (direct deps)', metrics.fanOut),
    row('fan-in (direct dependents)', metrics.fanIn),
    row('blast radius (transitive dependents)', metrics.blastRadius),
    '',
    '## Largest blast radius',
    '',
    '| project | root | blast radius | fan-in | fan-out |',
    '|---|---|---:|---:|---:|',
    ...metrics.topBlastRadius.map(
      (project) =>
        `| ${project.name} | \`${project.root}\` | ${project.blastRadius} | ${project.fanIn} | ${project.fanOut} |`,
    ),
    '',
  ].join('\n');
}
