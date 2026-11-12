import { describe, expect, it } from 'vitest';
import { parseCommitLog } from './affected.ts';
import { computeGraphMetrics, type NxGraphFile } from './graph.ts';
import type { RunRecord, TaskRecord } from './record.ts';
import { buildReport, isoWeek, savedByHit, missBaselines } from './report.ts';
import { formatMs, percentile, summarize } from './stats.ts';

describe('stats', () => {
  it('interpolates percentiles', () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([10], 90)).toBe(10);
    expect(summarize([3, 1, 2])).toMatchObject({ n: 3, median: 2, min: 1, max: 3, mean: 2 });
    expect(summarize([])).toBeUndefined();
  });

  it('formats durations', () => {
    expect(formatMs(850)).toBe('850 ms');
    expect(formatMs(1234)).toBe('1.23 s');
    expect(formatMs(83_000)).toBe('1m 23s');
    expect(formatMs(undefined)).toBe('–');
  });
});

describe('computeGraphMetrics', () => {
  // app → feature → ui → shared, feature → shared, other → shared; npm edge ignored
  const node = (name: string) => ({ name, type: 'lib', data: { root: `libs/${name}` } });
  const graph: NxGraphFile = {
    graph: {
      nodes: {
        app: node('app'),
        feature: node('feature'),
        ui: node('ui'),
        shared: node('shared'),
        other: node('other'),
      },
      dependencies: {
        app: [{ source: 'app', target: 'feature', type: 'static' }],
        feature: [
          { source: 'feature', target: 'ui', type: 'static' },
          { source: 'feature', target: 'shared', type: 'static' },
        ],
        ui: [
          { source: 'ui', target: 'shared', type: 'static' },
          { source: 'ui', target: 'npm:@angular/core', type: 'static' },
        ],
        shared: [],
        other: [{ source: 'other', target: 'shared', type: 'static' }],
      },
    },
  };
  const metrics = computeGraphMetrics(graph);

  it('counts blast radius transitively', () => {
    const blast = Object.fromEntries(metrics.projectMetrics.map((project) => [project.name, project.blastRadius]));
    expect(blast).toEqual({ app: 0, feature: 1, ui: 2, shared: 4, other: 0 });
    expect(metrics.topBlastRadius[0].name).toBe('shared');
  });

  it('computes edges, chain and ratio', () => {
    expect(metrics.projects).toBe(5);
    expect(metrics.edges).toBe(5);
    expect(metrics.longestChain).toBe(4);
    expect(metrics.cycles).toBe(false);
    expect(metrics.blastRadiusRatio).toBeCloseTo(7 / 5 / 5);
  });

  it('survives cycles', () => {
    const cyclic: NxGraphFile = {
      graph: {
        nodes: { a: node('a'), b: node('b') },
        dependencies: {
          a: [{ source: 'a', target: 'b', type: 'static' }],
          b: [{ source: 'b', target: 'a', type: 'static' }],
        },
      },
    };
    const result = computeGraphMetrics(cyclic);
    expect(result.cycles).toBe(true);
    expect(result.projectMetrics.map((project) => project.blastRadius)).toEqual([1, 1]);
  });
});

describe('parseCommitLog', () => {
  it('drops the root commit', () => {
    expect(parseCommitLog('aaa\x1fbbb\x1ffeat: x\nbbb\x1f\x1finitial\n')).toEqual([{ sha: 'aaa', subject: 'feat: x' }]);
  });
});

describe('report', () => {
  const taskRecord = (id: string, cache: TaskRecord['cache'], durationMs: number): TaskRecord => ({
    id,
    project: id.split(':')[0],
    target: id.split(':')[1],
    status: cache === 'miss' ? 'success' : cache === 'remote-hit' ? 'remote-cache' : 'local-cache',
    cache,
    exitCode: 0,
    durationMs,
  });
  const run = (startTime: number, ci: boolean, tasks: TaskRecord[]): RunRecord =>
    ({
      schema: 1,
      runId: String(startTime),
      command: 'affected -t test',
      startTime,
      endTime: startTime + 1000,
      durationMs: 1000,
      tags: {},
      ci: ci ? { isCi: true, provider: 'github' } : { isCi: false },
      git: { branch: 'main' },
      machine: { os: 'linux', arch: 'x64', cpus: 4, memoryGb: 16, node: 'v22' },
      remoteCache: 'enabled',
      envReliable: true,
      summary: { total: tasks.length, localHit: 0, remoteHit: 0, miss: 0, notCacheable: 0, notRun: 0, failed: 0 },
      tasks,
    }) as RunRecord;

  const records = [
    run(Date.UTC(2026, 10, 9), true, [taskRecord('a:test', 'miss', 10_000), taskRecord('b:test', 'miss', 2000)]),
    run(Date.UTC(2026, 10, 10), true, [taskRecord('a:test', 'remote-hit', 500), taskRecord('b:test', 'local-hit', 10)]),
    run(Date.UTC(2026, 10, 16), false, [taskRecord('c:test', 'remote-hit', 100)]),
  ];

  it('estimates saved time from the median miss of the same task, else of the target', () => {
    const baselines = missBaselines(records);
    expect(savedByHit(records[1].tasks[0], baselines)).toBe(9500);
    expect(savedByHit(records[2].tasks[0], baselines)).toBe(6000 - 100); // target median of 10 000 and 2000
    expect(savedByHit(records[0].tasks[0], baselines)).toBe(0);
  });

  it('groups by ISO week and by CI', () => {
    expect(isoWeek(Date.UTC(2026, 10, 12))).toBe('2026-W46');
    expect(isoWeek(Date.UTC(2027, 0, 1))).toBe('2026-W53');
    const byWeek = buildReport(records, { groupBy: 'week' });
    expect(byWeek.groups.map((group) => [group.key, group.runs])).toEqual([
      ['2026-W46', 2],
      ['2026-W47', 1],
    ]);
    const byCi = buildReport(records, { groupBy: 'ci', ciOnly: true });
    expect(byCi.groups.map((group) => group.key)).toEqual(['ci:github']);
    expect(byCi.groups[0].tasks).toMatchObject({ miss: 2, remoteHit: 1, localHit: 1, hitRate: 0.5 });
    expect(byCi.groups[0].savedMs).toBe(9500 + 1990);
  });
});
