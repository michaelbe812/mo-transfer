import { describe, expect, it } from 'vitest';
import type { NxGraphFile, NxGraphTarget } from './graph.ts';
import {
  analyzeGranularity,
  buildTargetGraph,
  fitCostModel,
  type CommitFiles,
  type GranularityInput,
} from './granularity.ts';
import { createOwnerLookup, DEFAULT_GLOBAL, DEFAULT_IGNORE, parseNameOnlyLog } from './granularity-input.ts';
import type { RunRecord } from './record.ts';

const LIB_BUILD: NxGraphTarget = { executor: '@nx/angular:ng-packagr-lite', dependsOn: ['^build'] };
const APP_BUILD: NxGraphTarget = {
  executor: '@nx/angular:application',
  dependsOn: ['^build'],
  options: { buildLibsFromSource: false },
};

// app → feature → ui → shared;  feature → data (no build) → shared;  admin → shared
function workspace(appBuild: NxGraphTarget = APP_BUILD): NxGraphFile {
  const node = (name: string, type: string, build?: NxGraphTarget) => ({
    name,
    type,
    data: {
      root: `${type === 'app' ? 'apps' : 'libs'}/${name}`,
      targets: (build ? { build } : {}) as Record<string, NxGraphTarget>,
    },
  });
  const edge = (source: string, target: string) => ({ source, target, type: 'static' });
  return {
    graph: {
      nodes: {
        app: node('app', 'app', appBuild),
        admin: node('admin', 'app', appBuild),
        feature: node('feature', 'lib', LIB_BUILD),
        ui: node('ui', 'lib', LIB_BUILD),
        data: node('data', 'lib'),
        shared: node('shared', 'lib', LIB_BUILD),
      },
      dependencies: {
        app: [edge('app', 'feature')],
        admin: [edge('admin', 'shared')],
        feature: [edge('feature', 'ui'), edge('feature', 'data')],
        ui: [edge('ui', 'shared'), edge('ui', 'npm:@angular/core')],
        data: [edge('data', 'shared')],
        shared: [],
      },
    },
  };
}

function record(durations: Record<string, number>): RunRecord {
  return {
    tasks: Object.entries(durations).map(([project, durationMs]) => ({
      id: `${project}:build`,
      project,
      target: 'build',
      status: 'success',
      cache: 'miss',
      exitCode: 0,
      durationMs,
    })),
  } as RunRecord;
}

function input(commits: CommitFiles[], graph = workspace(), records: RunRecord[] = []): GranularityInput {
  return {
    graph,
    target: 'build',
    sizes: { app: 10_240, admin: 10_240, feature: 4096, ui: 4096, data: 2048, shared: 2048 },
    commits,
    records,
    ownerOf: createOwnerLookup(graph),
    isGlobal: (file) => DEFAULT_GLOBAL.test(file),
    isIgnored: (file) => DEFAULT_IGNORE.test(file),
  };
}

const commit = (sha: string, ...files: string[]): CommitFiles => ({ sha, subject: sha, files });
const OPTIONS = { parallel: 3, overheadMs: 1000, restoreMs: 100 };

describe('buildTargetGraph', () => {
  it('links to the nearest projects with the target, through projects without it', () => {
    const graph = buildTargetGraph(workspace(), 'build');
    expect([...(graph.targetDeps.get('feature') ?? [])].sort()).toEqual(['shared', 'ui']);
    expect(graph.targetDeps.has('data')).toBe(false);
    expect(graph.chained.get('app')).toBe(true);
  });

  it('understands object-form dependsOn', () => {
    const file = workspace();
    file.graph.nodes.ui.data.targets = { build: { dependsOn: [{ target: 'build', dependencies: true }] } };
    expect(buildTargetGraph(file, 'build').chained.get('ui')).toBe(true);
  });
});

describe('fitCostModel', () => {
  it('splits duration into overhead and size-dependent work', () => {
    const points = [1, 2, 4, 8].map((kb) => ({ kb, ms: 1000 + 50 * kb }));
    const model = fitCostModel(points, {});
    expect(model.source).toBe('measured');
    expect(model.overheadMs).toBeCloseTo(1000);
    expect(model.msPerKb).toBeCloseTo(50);
  });

  it('falls back to assumptions or a rough split', () => {
    expect(fitCostModel([], {}).source).toBe('assumed');
    expect(fitCostModel([{ kb: 2, ms: 2000 }], {})).toMatchObject({ source: 'partial', overheadMs: 1200 });
    expect(fitCostModel([], { overheadMs: 300, measuredRestoreMs: 80 })).toMatchObject({
      overheadMs: 300,
      restoreMs: 80,
    });
  });
});

describe('analyzeGranularity', () => {
  it('replays commits: cold builds the closure, cached restores it', () => {
    const report = analyzeGranularity(input([commit('c1', 'libs/ui/src/button.ts')]), OPTIONS);
    const [simulation] = report.commits;
    // ui changed → ui, feature, app run; cold also builds shared, cached restores it
    expect(simulation.affected).toBe(3);
    expect(simulation.fineCold).toMatchObject({ tasks: 4, restored: 0 });
    expect(simulation.fineCached).toMatchObject({ tasks: 3, restored: 1 });
    expect(simulation.coarse.tasks).toBe(1); // only app consumes ui
    expect(report.entryPoints).toEqual(['admin', 'app']);
  });

  it('treats workspace-level files as global and ignores specs', () => {
    const report = analyzeGranularity(
      input([commit('global', 'nx.json'), commit('spec', 'libs/ui/src/button.spec.ts')]),
      OPTIONS,
    );
    expect(report.globalCommits).toBe(1);
    expect(report.commitsWithoutEffect).toBe(1);
    expect(report.commits[0]).toMatchObject({ global: true, affected: 5 });
    expect(report.projectStats.every((project) => project.changeShare === 0)).toBe(true);
  });

  it('flags a volatile project low in the graph', () => {
    const commits = Array.from({ length: 10 }, (_, i) => commit(`c${i}`, 'libs/shared/src/index.ts'));
    const report = analyzeGranularity(input(commits), OPTIONS);
    expect(report.findings.find((finding) => finding.kind === 'hotspot')?.projects).toEqual(['shared']);
    expect(report.verdict).toBe('mixed');
  });

  it('flags apps compiling buildable libs again from source', () => {
    const report = analyzeGranularity(
      input([], workspace({ executor: '@nx/angular:application', dependsOn: ['^build'] })),
      OPTIONS,
    );
    expect(report.findings[0]).toMatchObject({ kind: 'incremental-inactive', severity: 'high' });
    expect(report.findings[0].projects).toEqual(['admin', 'app']);
  });

  it('flags overhead and tiny projects from measured durations', () => {
    const records = [record({ app: 3000, admin: 3000, feature: 1100, ui: 1100, shared: 1050 })];
    const report = analyzeGranularity(input([commit('c1', 'libs/feature/a.ts')], workspace(), records), {
      parallel: 3,
    });
    const kinds = report.findings.map((finding) => finding.kind);
    expect(kinds).toContain('overhead-share');
    expect(report.projectStats.find((project) => project.name === 'ui')).toMatchObject({ measured: true, tiny: true });
  });

  it('compares the scenarios: no cache costs more than building from source', () => {
    const records = [record({ app: 1500, admin: 1500, feature: 1500, ui: 1500, shared: 1500 })];
    const report = analyzeGranularity(input([commit('c1', 'apps/app/src/main.ts')], workspace(), records), OPTIONS);
    // only app changed: fine/cold rebuilds feature, ui, shared too; coarse compiles them from source in one task
    const { fineCold, fineCached, coarse } = report.scenarios;
    expect(fineCold.perCommit?.mean).toBeGreaterThan(coarse.perCommit?.mean ?? 0);
    expect(fineCached.perCommit?.mean).toBeLessThan(fineCold.perCommit?.mean ?? 0);
    expect(report.findings.map((finding) => finding.kind)).toContain('no-cache-penalty');
  });

  it('fails without any project having the target', () => {
    expect(() => analyzeGranularity({ ...input([]), target: 'deploy' }, OPTIONS)).toThrow(/deploy/);
  });
});

describe('granularity input', () => {
  it('assigns files to the most specific project root', () => {
    const graph = workspace();
    graph.graph.nodes.nested = { name: 'nested', type: 'lib', data: { root: 'libs/ui/nested' } };
    graph.graph.nodes.root = { name: 'root', type: 'lib', data: { root: '.' } };
    const ownerOf = createOwnerLookup(graph);
    expect(ownerOf('libs/ui/nested/x.ts')).toBe('nested');
    expect(ownerOf('libs/ui/x.ts')).toBe('ui');
    expect(ownerOf('libs/uix/y.ts')).toBe('root');
  });

  it('parses git log --name-only', () => {
    const output = '\x1eabc\x1ffirst\n\na.ts\nb.ts\n\x1edef\x1fsecond\n\nc.ts\n';
    expect(parseNameOnlyLog(output)).toEqual([
      { sha: 'abc', subject: 'first', files: ['a.ts', 'b.ts'] },
      { sha: 'def', subject: 'second', files: ['c.ts'] },
    ]);
  });
});
