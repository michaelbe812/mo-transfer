/**
 * Granularity check for one target (default `build`): is the slicing too fine (task overhead dominates), too coarse
 * (large volatile projects, hot spots low in the graph), and does it pay off with or without a remote cache?
 *
 * Replays recent commits against the CURRENT graph with a simple cost model, task = overhead + work(size),
 * calibrated from the plugin's run records where available. Three scenarios per commit:
 * - fine, cold:   `nx affected -t <target>` without any cache: affected projects plus their `^target` closure run
 * - fine, cached: ideal remote cache: only affected projects run, their dependencies are restored
 * - coarse:       one task per entry point compiling its whole closure from source
 *                 (≈ `buildLibsFromSource: true`, or merging the libs into their consumers)
 */
import type { NxGraphFile, NxGraphTarget } from './graph.ts';
import type { RunRecord } from './record.ts';
import { formatBytes, formatMs, formatPercent, median, summarize, type Summary } from './stats.ts';

export interface CommitFiles {
  sha: string;
  subject: string;
  files: string[];
}

export interface GranularityInput {
  graph: NxGraphFile;
  target: string;
  /** Source bytes per project (tracked files, ignore patterns applied). */
  sizes: Record<string, number>;
  commits: CommitFiles[];
  records: RunRecord[];
  /** Owning project of a file; undefined for workspace-level files. */
  ownerOf: (file: string) => string | undefined;
  /** Workspace-level files that invalidate everything (nx.json, lockfile, tsconfig.base.json …). */
  isGlobal: (file: string) => boolean;
  /** Files that don't feed the target (specs, docs …). */
  isIgnored: (file: string) => boolean;
}

export interface GranularityOptions {
  /** Concurrent tasks (Nx default 3). */
  parallel: number;
  overheadMs?: number;
  restoreMs?: number;
}

export interface CostModel {
  overheadMs: number;
  msPerKb: number;
  restoreMs: number;
  /** measured: regression over records; partial: few records, rough split; assumed: no records, defaults. */
  source: 'measured' | 'partial' | 'assumed';
  measuredProjects: number;
}

export interface ScenarioCost {
  tasks: number;
  restored: number;
  workMs: number;
  wallMs: number;
}

export interface CommitSimulation {
  sha: string;
  subject: string;
  global: boolean;
  affected: number;
  fineCold: ScenarioCost;
  fineCached: ScenarioCost;
  coarse: ScenarioCost;
}

export interface ProjectGranularity {
  name: string;
  root: string;
  bytes: number;
  durationMs: number;
  measured: boolean;
  /** Share of commits touching the project itself (workspace-level commits not counted). */
  changeShare: number;
  /** Share of commits that make it run (touched or a dependency touched). */
  runShare: number;
  /** Projects with the target that (transitively) depend on it. */
  blastRadius: number;
  /** runShare × duration: where the time per commit goes. */
  expectedMsPerCommit: number;
  tiny: boolean;
}

export type FindingSeverity = 'high' | 'medium' | 'low' | 'info';

export interface GranularityFinding {
  kind: string;
  severity: FindingSeverity;
  title: string;
  evidence: string;
  tip: string;
  projects?: string[];
}

export type Verdict = 'too fine' | 'too coarse' | 'mixed' | 'balanced';

export interface ScenarioSummary {
  perCommit?: Summary;
  fullBuild: ScenarioCost;
}

export interface GranularityReport {
  target: string;
  parallel: number;
  projects: number;
  targetProjects: number;
  entryPoints: string[];
  commitsAnalyzed: number;
  commitsWithoutEffect: number;
  globalCommits: number;
  longestChain: number;
  costModel: CostModel;
  scenarios: { fineCold: ScenarioSummary; fineCached: ScenarioSummary; coarse: ScenarioSummary };
  verdict: Verdict;
  verdictReason: string;
  findings: GranularityFinding[];
  projectStats: ProjectGranularity[];
  commits: CommitSimulation[];
}

/** Defaults when no run records exist: ~1.5 s per task, ~100 KB source per second. */
const ASSUMED_OVERHEAD_MS = 1500;
const ASSUMED_MS_PER_KB = 10;
const ASSUMED_RESTORE_MS = 200;
/** A task is "tiny" when its overhead is at least half of it. */
const TINY_FACTOR = 2;
/** Executors with a `buildLibsFromSource` option (default true = libs compiled again from source). */
const FROM_SOURCE_EXECUTORS = [
  '@nx/angular:application',
  '@nx/angular:browser-esbuild',
  '@nx/angular:webpack-browser',
  '@nx/webpack:webpack',
  '@nx/rspack:rspack',
  '@nx/esbuild:esbuild',
];

// ---------------------------------------------------------------- graph model

interface TargetGraph {
  names: string[];
  roots: Map<string, string>;
  targetConfig: Map<string, NxGraphTarget>;
  /** All projects that (transitively) depend on a project, whole graph. */
  dependents: Map<string, Set<string>>;
  /** Nearest dependencies having the target, passing through projects without it. */
  targetDeps: Map<string, Set<string>>;
  /** Whether the project's target runs `^target` first. */
  chained: Map<string, boolean>;
}

function runsUpstreamFirst(config: NxGraphTarget, target: string): boolean {
  return (config.dependsOn ?? []).some((entry) =>
    typeof entry === 'string'
      ? entry === `^${target}`
      : entry.target === target && (entry.dependencies === true || entry.projects === 'dependencies'),
  );
}

function directEdges(file: NxGraphFile, known: Set<string>): Map<string, Set<string>> {
  const deps = new Map([...known].map((name) => [name, new Set<string>()]));
  for (const [source, edges] of Object.entries(file.graph.dependencies)) {
    if (!known.has(source)) continue;
    for (const edge of edges) if (known.has(edge.target) && edge.target !== source) deps.get(source)?.add(edge.target);
  }
  return deps;
}

function invert(edges: Map<string, Set<string>>): Map<string, Set<string>> {
  const inverted = new Map([...edges.keys()].map((name) => [name, new Set<string>()]));
  for (const [source, targets] of edges) for (const target of targets) inverted.get(target)?.add(source);
  return inverted;
}

function transitive(start: string, next: Map<string, Set<string>>): Set<string> {
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

/** Nearest dependencies with the target: walks through projects without it, stops at the first one with it. */
function nearestTargetDeps(start: string, deps: Map<string, Set<string>>, hasTarget: (name: string) => boolean) {
  const found = new Set<string>();
  const seen = new Set<string>([start]);
  const stack = [...(deps.get(start) ?? [])];
  while (stack.length) {
    const current = stack.pop() as string;
    if (seen.has(current)) continue;
    seen.add(current);
    if (hasTarget(current)) found.add(current);
    else stack.push(...(deps.get(current) ?? []));
  }
  return found;
}

export function buildTargetGraph(file: NxGraphFile, target: string): TargetGraph {
  const names = Object.keys(file.graph.nodes);
  const deps = directEdges(file, new Set(names));
  const reverse = invert(deps);
  const targetConfig = new Map<string, NxGraphTarget>();
  for (const name of names) {
    const config = file.graph.nodes[name].data.targets?.[target];
    if (config) targetConfig.set(name, config);
  }
  const hasTarget = (name: string) => targetConfig.has(name);
  return {
    names,
    roots: new Map(names.map((name) => [name, file.graph.nodes[name].data.root])),
    targetConfig,
    dependents: new Map(names.map((name) => [name, transitive(name, reverse)])),
    targetDeps: new Map([...targetConfig.keys()].map((name) => [name, nearestTargetDeps(name, deps, hasTarget)])),
    chained: new Map([...targetConfig].map(([name, config]) => [name, runsUpstreamFirst(config, target)])),
  };
}

/** Tasks Nx runs for `projects`: the projects plus the `^target` closure of chained ones. */
function taskClosure(projects: Iterable<string>, graph: TargetGraph, followAll = false): Set<string> {
  const closure = new Set<string>();
  const stack = [...projects];
  while (stack.length) {
    const current = stack.pop() as string;
    if (closure.has(current)) continue;
    closure.add(current);
    if (followAll || graph.chained.get(current)) stack.push(...(graph.targetDeps.get(current) ?? []));
  }
  return closure;
}

/** Projects with the target nobody with the target depends on: apps, publishable packages. */
function entryPoints(graph: TargetGraph): string[] {
  const used = new Set([...graph.targetDeps.values()].flatMap((deps) => [...deps]));
  return [...graph.targetConfig.keys()].filter((name) => !used.has(name)).sort();
}

function longestTargetChain(graph: TargetGraph): number {
  const depth = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (name: string): number => {
    const known = depth.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) return 0; // cycle
    visiting.add(name);
    let deepest = 0;
    for (const dep of graph.targetDeps.get(name) ?? []) deepest = Math.max(deepest, visit(dep));
    visiting.delete(name);
    depth.set(name, deepest + 1);
    return deepest + 1;
  };
  return [...graph.targetConfig.keys()].reduce((max, name) => Math.max(max, visit(name)), 0);
}

// ---------------------------------------------------------------- cost model

/** Median duration of successful cache misses per project for the target. */
export function measuredDurations(records: RunRecord[], target: string): Map<string, number> {
  const samples = new Map<string, number[]>();
  for (const task of records.flatMap((record) => record.tasks)) {
    if (task.target !== target || task.cache !== 'miss' || task.status !== 'success' || !task.durationMs) continue;
    samples.set(task.project, [...(samples.get(task.project) ?? []), task.durationMs]);
  }
  return new Map([...samples].map(([project, values]) => [project, median(values) as number]));
}

function measuredRestoreMs(records: RunRecord[], target: string): number | undefined {
  const hits = records
    .flatMap((record) => record.tasks)
    // ≤ 10 ms = Nx didn't time the download: no information
    .filter((task) => task.target === target && task.cache === 'remote-hit' && (task.durationMs ?? 0) > 10)
    .map((task) => task.durationMs as number);
  return median(hits);
}

/**
 * Least squares `duration = overhead + msPerKb · kb` over projects with measurements. The intercept is the
 * per-task overhead (process start, compiler startup, declaration emit) — the price of one more project.
 */
export function fitCostModel(
  points: Array<{ kb: number; ms: number }>,
  overrides: { overheadMs?: number; restoreMs?: number; measuredRestoreMs?: number },
): CostModel {
  const restoreMs = overrides.restoreMs ?? overrides.measuredRestoreMs ?? ASSUMED_RESTORE_MS;
  const base = { restoreMs, measuredProjects: points.length };
  if (!points.length) {
    return {
      ...base,
      overheadMs: overrides.overheadMs ?? ASSUMED_OVERHEAD_MS,
      msPerKb: ASSUMED_MS_PER_KB,
      source: 'assumed',
    };
  }
  const minMs = Math.min(...points.map((point) => point.ms));
  const meanKb = points.reduce((sum, point) => sum + point.kb, 0) / points.length;
  const meanMs = points.reduce((sum, point) => sum + point.ms, 0) / points.length;
  const varianceKb = points.reduce((sum, point) => sum + (point.kb - meanKb) ** 2, 0);
  const covariance = points.reduce((sum, point) => sum + (point.kb - meanKb) * (point.ms - meanMs), 0);
  const slope = varianceKb > 0 ? covariance / varianceKb : 0;
  const intercept = meanMs - slope * meanKb;
  if (points.length >= 4 && slope > 0 && intercept > 0) {
    const overheadMs = overrides.overheadMs ?? Math.min(intercept, minMs);
    return { ...base, overheadMs, msPerKb: slope, source: 'measured' };
  }
  // too few points or no size correlation: overhead ≈ 60 % of the fastest task, rest scales with size
  const overheadMs = overrides.overheadMs ?? minMs * 0.6;
  const msPerKb = meanKb > 0 ? Math.max(meanMs - overheadMs, 0) / meanKb : ASSUMED_MS_PER_KB;
  return { ...base, overheadMs, msPerKb, source: 'partial' };
}

// ---------------------------------------------------------------- simulation

interface Costs {
  duration: Map<string, number>;
  model: CostModel;
}

/** Wall time ≈ max(critical path, total work / parallel); restored tasks cost the restore time. */
function scheduleCost(tasks: Set<string>, run: Set<string>, graph: TargetGraph, costs: Costs, parallel: number) {
  const cost = (name: string) => (run.has(name) ? (costs.duration.get(name) ?? 0) : costs.model.restoreMs);
  const finish = new Map<string, number>();
  const visiting = new Set<string>();
  const finishOf = (name: string): number => {
    const known = finish.get(name);
    if (known !== undefined) return known;
    if (visiting.has(name)) return 0;
    visiting.add(name);
    let start = 0;
    for (const dep of graph.targetDeps.get(name) ?? []) if (tasks.has(dep)) start = Math.max(start, finishOf(dep));
    visiting.delete(name);
    finish.set(name, start + cost(name));
    return start + cost(name);
  };
  let criticalPath = 0;
  let workMs = 0;
  for (const name of tasks) {
    criticalPath = Math.max(criticalPath, finishOf(name));
    workMs += cost(name);
  }
  return {
    tasks: run.size,
    restored: tasks.size - run.size,
    workMs,
    wallMs: Math.max(criticalPath, workMs / parallel),
  };
}

/** Independent tasks (no chain between entry points). */
function independentCost(durations: number[], parallel: number): ScenarioCost {
  const workMs = durations.reduce((sum, value) => sum + value, 0);
  return {
    tasks: durations.length,
    restored: 0,
    workMs,
    wallMs: Math.max(Math.max(0, ...durations), workMs / parallel),
  };
}

interface Simulator {
  fineCold: (run: Set<string>) => ScenarioCost;
  fineCached: (run: Set<string>) => ScenarioCost;
  coarse: (affected: Set<string>) => ScenarioCost;
}

function createSimulator(graph: TargetGraph, costs: Costs, entries: string[], parallel: number): Simulator {
  const work = (name: string) => Math.max((costs.duration.get(name) ?? 0) - costs.model.overheadMs, 0);
  const coarseCost = new Map(
    entries.map((entry) => {
      const closure = taskClosure([entry], graph, true);
      return [entry, costs.model.overheadMs + [...closure].reduce((sum, name) => sum + work(name), 0)];
    }),
  );
  return {
    fineCold: (run) => {
      const tasks = taskClosure(run, graph);
      return scheduleCost(tasks, tasks, graph, costs, parallel);
    },
    fineCached: (run) => scheduleCost(taskClosure(run, graph), run, graph, costs, parallel),
    coarse: (affected) =>
      independentCost(
        entries.filter((entry) => affected.has(entry)).map((entry) => coarseCost.get(entry) as number),
        parallel,
      ),
  };
}

interface Touch {
  global: boolean;
  touched: Set<string>;
}

function touchedBy(commit: CommitFiles, input: GranularityInput): Touch {
  const touched = new Set<string>();
  let global = false;
  for (const file of commit.files) {
    if (input.isIgnored(file)) continue;
    if (input.isGlobal(file)) {
      global = true;
      continue;
    }
    const owner = input.ownerOf(file);
    if (owner) touched.add(owner);
  }
  return { global, touched };
}

function affectedBy(touch: Touch, graph: TargetGraph): Set<string> {
  if (touch.global) return new Set(graph.names);
  const affected = new Set(touch.touched);
  for (const name of touch.touched) for (const dependent of graph.dependents.get(name) ?? []) affected.add(dependent);
  return affected;
}

// ---------------------------------------------------------------- findings

interface FindingContext {
  report: Omit<GranularityReport, 'verdict' | 'verdictReason' | 'findings'>;
  graph: TargetGraph;
  touches: Touch[];
}

const names = (projects: Array<{ name: string }>, max = 8) =>
  projects
    .slice(0, max)
    .map((project) => `\`${project.name}\``)
    .join(', ') + (projects.length > max ? ` (+${projects.length - max})` : '');

function overheadFindings({ report }: FindingContext): GranularityFinding[] {
  const { costModel, projectStats, scenarios } = report;
  const findings: GranularityFinding[] = [];
  const full = scenarios.fineCold.fullBuild;
  const overheadShare = full.workMs ? (costModel.overheadMs * full.tasks) / full.workMs : 0;
  if (overheadShare >= 0.3) {
    findings.push({
      kind: 'overhead-share',
      severity: overheadShare >= 0.5 ? 'high' : 'medium',
      title: `Task overhead is ${formatPercent(overheadShare)} of a full cold build`,
      evidence: `${full.tasks} tasks × ~${formatMs(costModel.overheadMs)} overhead = ${formatMs(costModel.overheadMs * full.tasks)} of ${formatMs(full.workMs)} work.`,
      tip: 'Merge small projects that change together, or keep them as non-buildable libs (they still get affected/cached lint and test) and make only stable, expensive boundaries buildable. A cheaper executor (tsc/swc instead of ng-packagr) lowers the overhead per project.',
    });
  }
  const tiny = projectStats.filter((project) => project.tiny).sort((a, b) => a.durationMs - b.durationMs);
  const tinyShare = projectStats.length ? tiny.length / projectStats.length : 0;
  if (tiny.length >= 3 && tinyShare >= 0.25) {
    findings.push({
      kind: 'tiny-projects',
      severity: tinyShare >= 0.5 ? 'medium' : 'low',
      title: `${tiny.length} of ${projectStats.length} projects (${formatPercent(tinyShare)}) spend more on overhead than on work`,
      evidence: `Task time < ${TINY_FACTOR}× overhead (${formatMs(costModel.overheadMs * TINY_FACTOR)}): ${names(tiny)}.`,
      tip: 'Merge them into the project they change with (see co-change below) or into their only consumer; or drop their build target (non-buildable). Split only where it shrinks the blast radius.',
      projects: tiny.map((project) => project.name),
    });
  }
  return findings;
}

function hotspotFindings({ report }: FindingContext): GranularityFinding[] {
  const threshold = Math.max(3, report.targetProjects * 0.25);
  const hotspots = report.projectStats
    .filter((project) => project.changeShare >= 0.05 && project.blastRadius >= threshold)
    .map((project) => ({ ...project, impact: (project.changeShare * project.blastRadius) / report.targetProjects }))
    .sort((a, b) => b.impact - a.impact);
  return hotspots.slice(0, 5).map((project) => ({
    kind: 'hotspot',
    severity: project.impact >= 0.1 ? 'high' : 'medium',
    title: `Volatile project low in the graph: \`${project.name}\``,
    evidence: `Changed in ${formatPercent(project.changeShare)} of commits, ${project.blastRadius} of ${report.targetProjects} projects depend on it → alone it forces ~${formatPercent(project.impact)} of the workspace to rebuild per commit.`,
    tip: 'Finer slicing elsewhere cannot help here. Split the stable part (types, contracts) from the volatile part (implementation) so dependents only see the stable one; move volatile code up towards the consumers; depend on interfaces/injection tokens instead of implementations; for generated code, regenerate only on spec changes.',
    projects: [project.name],
  }));
}

function largeVolatileFindings({ report }: FindingContext): GranularityFinding[] {
  const totalBytes = report.projectStats.reduce((sum, project) => sum + project.bytes, 0);
  const typical = median(report.projectStats.map((project) => project.durationMs)) ?? 0;
  return report.projectStats
    .filter((project) => totalBytes && project.bytes / totalBytes >= 0.15 && project.changeShare >= 0.2)
    .map((project) => ({
      kind: 'large-volatile',
      severity: project.durationMs >= 3 * typical ? 'high' : 'medium',
      title: `Large project that changes often: \`${project.name}\``,
      evidence: `${formatPercent(project.bytes / totalBytes)} of the source, changed in ${formatPercent(project.changeShare)} of commits, ${formatMs(project.durationMs)} per run (median project: ${formatMs(typical)}).`,
      tip: 'Too coarse: every small change pays the full task. Split along change boundaries (co-change in git history, feature/sub-domain), so a commit rebuilds a part instead of the whole.',
      projects: [project.name],
    }));
}

function coChangeFindings({ report, graph, touches }: FindingContext): GranularityFinding[] {
  const stats = new Map(report.projectStats.map((project) => [project.name, project]));
  const single = new Map<string, number>();
  const pairs = new Map<string, number>();
  for (const { touched } of touches) {
    const members = [...touched].filter((name) => stats.has(name)).sort();
    if (members.length > 20) continue; // sweeps carry no signal
    for (const name of members) single.set(name, (single.get(name) ?? 0) + 1);
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const key = `${members[i]}\0${members[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
  }
  const linked = (a: string, b: string) => graph.targetDeps.get(a)?.has(b) || graph.targetDeps.get(b)?.has(a);
  const candidates = [...pairs]
    .map(([key, together]) => {
      const [a, b] = key.split('\0');
      const jaccard = together / ((single.get(a) ?? 0) + (single.get(b) ?? 0) - together);
      return { a, b, together, jaccard };
    })
    .filter(
      ({ a, b, together, jaccard }) =>
        together >= 3 && jaccard >= 0.6 && (stats.get(a)?.tiny || stats.get(b)?.tiny || linked(a, b)),
    )
    .sort((x, y) => y.jaccard - x.jaccard || y.together - x.together)
    .slice(0, 10);
  if (!candidates.length) return [];
  return [
    {
      kind: 'co-change',
      severity: 'low',
      title: `${candidates.length} project pairs almost always change together`,
      evidence: candidates
        .map(({ a, b, together, jaccard }) => `\`${a}\` + \`${b}\` (${together}× together, ${formatPercent(jaccard)})`)
        .join('; '),
      tip: 'A split that every commit crosses buys nothing but overhead. Merge such pairs, or re-cut them so one side becomes stable.',
      projects: [...new Set(candidates.flatMap(({ a, b }) => [a, b]))],
    },
  ];
}

function structureFindings({ report }: FindingContext): GranularityFinding[] {
  const findings: GranularityFinding[] = [];
  const full = report.scenarios.fineCold.fullBuild;
  const work = full.workMs / report.parallel;
  if (full.wallMs > work * 1.2 && report.longestChain >= 4) {
    findings.push({
      kind: 'deep-chain',
      severity: 'medium',
      title: `Build is chain-bound: dependency chain of ${report.longestChain} projects`,
      evidence: `Critical path ${formatMs(full.wallMs)} > total work / ${report.parallel} = ${formatMs(work)}: more agents/parallelism won't help.`,
      tip: 'Flatten the graph: fewer layers (feature → ui → util is enough), move shared code into leaf libs, avoid lib→lib→lib chains of thin wrappers.',
    });
  }
  const globalShare = report.commitsAnalyzed ? report.globalCommits / report.commitsAnalyzed : 0;
  if (globalShare >= 0.15) {
    findings.push({
      kind: 'global-commits',
      severity: globalShare >= 0.3 ? 'high' : 'medium',
      title: `${formatPercent(globalShare)} of commits touch workspace-level files and invalidate everything`,
      evidence: `${report.globalCommits} of ${report.commitsAnalyzed} commits change e.g. nx.json, tsconfig.base.json, package.json or the lockfile.`,
      tip: 'No slicing helps against these. Batch dependency updates, narrow inputs (namedInputs, `externalDependencies` instead of the whole lockfile), keep path mappings stable. Note: Nx itself only invalidates projects using changed packages — this check is pessimistic.',
    });
  }
  return findings;
}

function configFindings({ graph, report }: FindingContext): GranularityFinding[] {
  const fromSource = report.entryPoints.filter((entry) => {
    const config = graph.targetConfig.get(entry);
    return (
      config?.executor &&
      FROM_SOURCE_EXECUTORS.includes(config.executor) &&
      config.options?.buildLibsFromSource !== false &&
      (graph.targetDeps.get(entry)?.size ?? 0) > 0
    );
  });
  if (!fromSource.length) return [];
  return [
    {
      kind: 'incremental-inactive',
      severity: 'high',
      title: `${fromSource.length} entry point(s) compile their buildable libs again from source`,
      evidence: `${names(fromSource.map((name) => ({ name })))} use a \`buildLibsFromSource\` executor without \`"buildLibsFromSource": false\`.`,
      tip: 'Either set `"buildLibsFromSource": false` in the build options of these projects (and keep `dependsOn: ["^build"]`), or remove the libs\' build targets: building them and then compiling them again is pure overhead.',
      projects: fromSource,
    },
  ];
}

function cacheFindings({ report }: FindingContext): GranularityFinding[] {
  const { fineCold, fineCached, coarse } = report.scenarios;
  const cold = fineCold.perCommit?.mean;
  const cached = fineCached.perCommit?.mean;
  const single = coarse.perCommit?.mean;
  if (cold === undefined || cached === undefined || single === undefined || !single) return [];
  const findings: GranularityFinding[] = [];
  if (cold > single * 1.15) {
    findings.push({
      kind: 'no-cache-penalty',
      severity: 'medium',
      title: `Without a remote cache, buildable libs cost ${formatPercent(cold / single - 1)} more per commit than building from source`,
      evidence: `Fine/cold ${formatMs(cold)} vs. coarse ${formatMs(single)} per commit (mean): every CI run rebuilds the whole \`^${report.target}\` closure.`,
      tip: 'Use a remote cache for CI (or at least persist .nx/cache between runs), or build from source where no cache exists. Incremental builds only pay off with a warm cache.',
    });
  }
  if (cached > single * 0.9) {
    findings.push({
      kind: 'cache-no-gain',
      severity: 'medium',
      title: 'Even with a perfect remote cache the slicing gains little',
      evidence: `Fine/cached ${formatMs(cached)} vs. coarse ${formatMs(single)} per commit (mean).`,
      tip: 'Typical commits touch projects low in the graph (see hot spots) or the overhead eats the gain (see overhead). Fix those before adding more projects.',
    });
  } else {
    findings.push({
      kind: 'cache-gain',
      severity: 'info',
      title: `With a remote cache the slicing saves ${formatPercent(1 - cached / single)} per commit`,
      evidence: `Fine/cached ${formatMs(cached)} vs. coarse ${formatMs(single)} per commit (mean)${cold > single ? `, but fine/cold ${formatMs(cold)}` : ''}.`,
      tip: 'Keep the remote cache hit rate high (stable inputs, no machine-specific outputs) — the granularity depends on it.',
    });
  }
  return findings;
}

function dataFindings({ report }: FindingContext): GranularityFinding[] {
  if (report.costModel.source === 'measured') return [];
  return [
    {
      kind: 'estimated-durations',
      severity: 'info',
      title:
        report.costModel.source === 'assumed'
          ? 'No run records: durations are assumptions'
          : `Only ${report.costModel.measuredProjects} projects measured: overhead is a rough split`,
      evidence: `Overhead ${formatMs(report.costModel.overheadMs)}, ${report.costModel.msPerKb.toFixed(2)} ms/KB.`,
      tip: `Register the nx-metrics plugin and run \`nx run-many -t ${report.target} --skip-nx-cache\` once (better: a few times, also on CI), or pass --overhead-ms.`,
    },
  ];
}

const SEVERITY_ORDER: FindingSeverity[] = ['high', 'medium', 'low', 'info'];

function verdictOf(findings: GranularityFinding[]): { verdict: Verdict; reason: string } {
  const has = (...kinds: string[]) => findings.some((finding) => kinds.includes(finding.kind));
  const fine = has('overhead-share', 'tiny-projects');
  const coarse = has('large-volatile');
  const structural = has('hotspot', 'deep-chain', 'incremental-inactive');
  if (structural)
    return {
      verdict: 'mixed',
      reason: 'project count is not the main problem: fix the cut first (hot spots, chains, config)',
    };
  if (fine && coarse)
    return {
      verdict: 'mixed',
      reason: 'many tiny projects and a few large volatile ones: merge the tiny, split the large',
    };
  if (fine || has('cache-no-gain'))
    return { verdict: 'too fine', reason: 'task overhead outweighs the smaller invalidation radius' };
  if (coarse) return { verdict: 'too coarse', reason: 'large projects are rebuilt for small changes' };
  return { verdict: 'balanced', reason: 'no signs of too fine or too coarse slicing for this target' };
}

// ---------------------------------------------------------------- analysis

function projectStats(
  graph: TargetGraph,
  input: GranularityInput,
  costs: Costs,
  touches: Touch[],
  runs: Map<string, number>,
): ProjectGranularity[] {
  const measured = measuredDurations(input.records, input.target);
  const changed = new Map<string, number>();
  // direct changes only: workspace-level commits hit everyone equally and would hide the real hot spots
  for (const touch of touches) for (const name of touch.touched) changed.set(name, (changed.get(name) ?? 0) + 1);
  const count = Math.max(touches.length, 1);
  return [...graph.targetConfig.keys()].map((name) => {
    const durationMs = costs.duration.get(name) ?? 0;
    const runShare = (runs.get(name) ?? 0) / count;
    return {
      name,
      root: graph.roots.get(name) ?? '',
      bytes: input.sizes[name] ?? 0,
      durationMs,
      measured: measured.has(name),
      changeShare: (changed.get(name) ?? 0) / count,
      runShare,
      blastRadius: [...(graph.dependents.get(name) ?? [])].filter((other) => graph.targetConfig.has(other)).length,
      expectedMsPerCommit: runShare * durationMs,
      tiny: durationMs < costs.model.overheadMs * TINY_FACTOR,
    };
  });
}

function buildCosts(graph: TargetGraph, input: GranularityInput, options: GranularityOptions): Costs {
  const measured = measuredDurations(input.records, input.target);
  // apps excluded from the fit: bundling cost doesn't scale with their own source
  const points = [...measured]
    .filter(([name]) => graph.targetConfig.has(name) && input.graph.graph.nodes[name]?.type !== 'app')
    .map(([name, ms]) => ({ kb: (input.sizes[name] ?? 0) / 1024, ms }));
  const model = fitCostModel(points, {
    overheadMs: options.overheadMs,
    restoreMs: options.restoreMs,
    measuredRestoreMs: measuredRestoreMs(input.records, input.target),
  });
  const duration = new Map(
    [...graph.targetConfig.keys()].map((name) => [
      name,
      measured.get(name) ?? model.overheadMs + model.msPerKb * ((input.sizes[name] ?? 0) / 1024),
    ]),
  );
  return { duration, model };
}

const summarizeScenario = (commits: CommitSimulation[], pick: (commit: CommitSimulation) => ScenarioCost) =>
  summarize(commits.map((commit) => pick(commit).wallMs));

export function analyzeGranularity(input: GranularityInput, options: GranularityOptions): GranularityReport {
  const graph = buildTargetGraph(input.graph, input.target);
  if (!graph.targetConfig.size) throw new Error(`no project has a "${input.target}" target`);
  const costs = buildCosts(graph, input, options);
  const entries = entryPoints(graph);
  const simulate = createSimulator(graph, costs, entries, options.parallel);

  const touches = input.commits.map((commit) => touchedBy(commit, input));
  const runs = new Map<string, number>();
  const commits: CommitSimulation[] = [];
  input.commits.forEach((commit, index) => {
    const affected = affectedBy(touches[index], graph);
    const run = new Set([...affected].filter((name) => graph.targetConfig.has(name)));
    if (!run.size) return;
    for (const name of run) runs.set(name, (runs.get(name) ?? 0) + 1);
    commits.push({
      sha: commit.sha,
      subject: commit.subject,
      global: touches[index].global,
      affected: run.size,
      fineCold: simulate.fineCold(run),
      fineCached: simulate.fineCached(run),
      coarse: simulate.coarse(affected),
    });
  });

  const all = new Set(graph.targetConfig.keys());
  const base = {
    target: input.target,
    parallel: options.parallel,
    projects: graph.names.length,
    targetProjects: all.size,
    entryPoints: entries,
    commitsAnalyzed: input.commits.length,
    commitsWithoutEffect: input.commits.length - commits.length,
    globalCommits: touches.filter((touch) => touch.global).length,
    longestChain: longestTargetChain(graph),
    costModel: costs.model,
    scenarios: {
      fineCold: { perCommit: summarizeScenario(commits, (c) => c.fineCold), fullBuild: simulate.fineCold(all) },
      fineCached: { perCommit: summarizeScenario(commits, (c) => c.fineCached), fullBuild: simulate.fineCold(all) },
      coarse: { perCommit: summarizeScenario(commits, (c) => c.coarse), fullBuild: simulate.coarse(all) },
    },
    projectStats: projectStats(graph, input, costs, touches, runs).sort(
      (a, b) => b.expectedMsPerCommit - a.expectedMsPerCommit,
    ),
    commits,
  };
  const context: FindingContext = { report: base, graph, touches };
  const findings = [
    configFindings,
    overheadFindings,
    hotspotFindings,
    largeVolatileFindings,
    coChangeFindings,
    structureFindings,
    cacheFindings,
    dataFindings,
  ]
    .flatMap((collect) => collect(context))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  const { verdict, reason } = verdictOf(findings);
  return { ...base, verdict, verdictReason: reason, findings };
}

// ---------------------------------------------------------------- markdown

const ICON: Record<FindingSeverity, string> = { high: '🔴', medium: '🟠', low: '🟡', info: 'ℹ️' };

function scenarioRow(label: string, scenario: ScenarioSummary): string {
  const { perCommit, fullBuild } = scenario;
  return `| ${label} | ${formatMs(perCommit?.mean)} | ${formatMs(perCommit?.median)} | ${formatMs(perCommit?.p90)} | ${formatMs(fullBuild.wallMs)} (${fullBuild.tasks} tasks) |`;
}

export function granularityToMarkdown(report: GranularityReport, top = 25): string {
  const { costModel, scenarios } = report;
  return [
    `# Nx granularity: target \`${report.target}\``,
    '',
    `**Verdict: ${report.verdict}**: ${report.verdictReason}.`,
    '',
    `- ${report.targetProjects} of ${report.projects} projects have \`${report.target}\`, ${report.entryPoints.length} entry points, longest chain ${report.longestChain}`,
    `- ${report.commitsAnalyzed} commits replayed (${report.commitsWithoutEffect} without effect on \`${report.target}\`, ${report.globalCommits} touching workspace-level files)`,
    `- cost model (${costModel.source}, ${costModel.measuredProjects} projects measured): overhead **${formatMs(costModel.overheadMs)}**/task, ${costModel.msPerKb.toFixed(2)} ms/KB source, restore ${formatMs(costModel.restoreMs)}/task, parallel ${report.parallel}`,
    '',
    '## Estimated wall time per commit',
    '',
    '| scenario | mean | median | p90 | full build |',
    '|---|---:|---:|---:|---:|',
    scenarioRow('fine, no cache (cold CI)', scenarios.fineCold),
    scenarioRow('fine, remote cache (ideal)', scenarios.fineCached),
    scenarioRow('coarse: one task per entry point', scenarios.coarse),
    '',
    '_coarse ≈ `buildLibsFromSource: true` or merging the libs into their consumers._',
    '',
    '## Findings and tips',
    '',
    ...(report.findings.length
      ? report.findings.flatMap((finding) => [
          `### ${ICON[finding.severity]} ${finding.title}`,
          '',
          finding.evidence,
          '',
          `**Tip:** ${finding.tip}`,
          '',
        ])
      : ['No findings.', '']),
    `## Projects by expected time per commit (top ${Math.min(top, report.projectStats.length)})`,
    '',
    '| project | source | task | changed | runs | blast radius | ⌀ per commit |',
    '|---|---:|---:|---:|---:|---:|---:|',
    ...report.projectStats
      .slice(0, top)
      .map(
        (project) =>
          `| ${project.name}${project.tiny ? ' · tiny' : ''} | ${formatBytes(project.bytes)} | ${formatMs(project.durationMs)}${project.measured ? '' : ' (est.)'} | ${formatPercent(project.changeShare)} | ${formatPercent(project.runShare)} | ${project.blastRadius} | ${formatMs(project.expectedMsPerCommit)} |`,
      ),
    '',
    '## Caveats',
    '',
    '- Replays history against the current graph: old file paths that no longer exist drop out.',
    '- Affected is approximated from project roots (no Nx inputs, no lockfile package analysis); specs/docs are ignored via --ignore.',
    '- Only this target is modelled: other `dependsOn` targets (codegen …) are not included. Run again with `--target test` / `lint`.',
    '- "coarse" assumes the entry points consume the libs; for publishable packages it is a lower bound.',
    '',
  ].join('\n');
}
