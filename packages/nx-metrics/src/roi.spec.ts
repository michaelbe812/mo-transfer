import { describe, expect, it } from 'vitest';
import type { RunRecord, TaskRecord } from './record.ts';
import { buildReport, reportToMarkdown } from './report.ts';

const task = (id: string, cache: TaskRecord['cache'], durationMs: number): TaskRecord => ({
  id,
  project: id.split(':')[0],
  target: id.split(':')[1],
  status: cache === 'miss' ? 'success' : 'remote-cache',
  cache,
  exitCode: 0,
  durationMs,
});

const run = (runId: string, ci: boolean, tasks: TaskRecord[]) =>
  ({
    schema: 1,
    runId,
    command: 'affected -t build',
    startTime: Date.UTC(2026, 10, 12),
    endTime: Date.UTC(2026, 10, 12) + 1000,
    durationMs: 1000,
    ci: { isCi: ci },
    git: {},
    tags: {},
    summary: { failed: 0 },
    tasks,
  }) as unknown as RunRecord;

describe('ROI', () => {
  // miss baseline a:build = 600 000 ms (10 min); one local hit and two CI hits of 0 ms each
  const records = [
    run('m', true, [task('a:build', 'miss', 600_000)]),
    run('l', false, [task('a:build', 'remote-hit', 0)]),
    run('c1', true, [task('a:build', 'remote-hit', 0)]),
    run('c2', true, [task('a:build', 'remote-hit', 0)]),
  ];

  it('values local hours with the rate and CI minutes with the price', () => {
    const { roi } = buildReport(records, { groupBy: 'none', ratePerHour: 90, ciPricePerMinute: 0.01 });
    expect(roi.savedLocalHours).toBeCloseTo(1 / 6);
    expect(roi.savedCiMinutes).toBeCloseTo(20);
    expect(roi.localEur).toBeCloseTo(15);
    expect(roi.ciEur).toBeCloseTo(0.2);
    expect(roi.totalEur).toBeCloseTo(15.2);
  });

  it('leaves money empty without rates but still reports the saved time', () => {
    const report = buildReport(records, { groupBy: 'none' });
    expect(report.roi.totalEur).toBeUndefined();
    expect(reportToMarkdown(report)).toContain('| lokal | 0.17 h | `--rate` | – |');
  });
});
