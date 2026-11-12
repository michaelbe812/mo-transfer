import { describe, expect, it } from 'vitest';
import { detectCi, detectRemoteCache, isEnvReliable, parseTags } from './environment.ts';
import { cacheOutcome, commandOf, toRunRecord, type HookTaskResult, type RunMeta } from './record.ts';
import { resolveOutputFile } from './plugin.ts';

const task = (id: string, status: string, start?: number, end?: number, cache = true): HookTaskResult => {
  const [project, target] = id.split(':');
  return {
    status,
    code: status === 'failure' ? 1 : 0,
    task: { id, target: { project, target }, hash: `h-${id}`, cache, startTime: start, endTime: end },
  };
};

const meta: RunMeta = {
  tags: {},
  ci: { isCi: false },
  git: {},
  machine: { os: 'linux', arch: 'x64', cpus: 4, memoryGb: 16, node: 'v22' },
  remoteCache: 'enabled',
  envReliable: true,
};

describe('cacheOutcome', () => {
  it.each([
    ['local-cache', true, 'local-hit'],
    ['local-cache-kept-existing', true, 'local-hit'],
    ['remote-cache', true, 'remote-hit'],
    ['success', true, 'miss'],
    ['failure', true, 'miss'],
    ['success', false, 'not-cacheable'],
    ['skipped', true, 'not-run'],
    ['stopped', true, 'not-run'],
  ] as const)('%s (cache %s) → %s', (status, cacheable, expected) => {
    expect(cacheOutcome(status, cacheable)).toBe(expected);
  });
});

describe('toRunRecord', () => {
  const record = toRunRecord(
    {
      id: 'run-1',
      argv: ['/usr/bin/node', '/repo/node_modules/nx/dist/bin/nx.js', 'affected', '-t', 'test'],
      startTime: 1000,
      endTime: 5000,
      taskResults: {
        'a:test': task('a:test', 'success', 1000, 3000),
        'b:test': task('b:test', 'remote-cache', 1000, 1100),
        'c:test': task('c:test', 'local-cache', 1000, 1010),
        'd:test': task('d:test', 'failure', 1000, 4000),
        'e:serve': task('e:serve', 'success', 1000, 2000, false),
      },
    },
    meta,
  );

  it('maps tasks with durations', () => {
    expect(record.command).toBe('affected -t test');
    expect(record.durationMs).toBe(4000);
    expect(record.tasks.find((entry) => entry.id === 'a:test')).toMatchObject({
      project: 'a',
      target: 'test',
      cache: 'miss',
      durationMs: 2000,
    });
  });

  it('summarizes cache outcomes; hit rate ignores non-cacheable tasks', () => {
    expect(record.summary).toEqual({
      total: 5,
      localHit: 1,
      remoteHit: 1,
      miss: 2,
      notCacheable: 1,
      notRun: 0,
      failed: 1,
      hitRate: 0.5,
    });
  });

  it('leaves duration undefined without timestamps', () => {
    const untimed = toRunRecord(
      { id: 'x', argv: [], startTime: 0, endTime: 0, taskResults: { 'a:b': task('a:b', 'success') } },
      meta,
    );
    expect(untimed.tasks[0].durationMs).toBeUndefined();
    expect(commandOf([])).toBe('');
  });
});

describe('environment', () => {
  it('detects GitHub Actions with PR branch', () => {
    expect(
      detectCi({
        GITHUB_ACTIONS: 'true',
        GITHUB_RUN_ID: '42',
        GITHUB_JOB: 'ci',
        GITHUB_SHA: 'abc',
        GITHUB_HEAD_REF: 'feat/x',
        GITHUB_REF_NAME: '1/merge',
      }),
    ).toEqual({
      isCi: true,
      provider: 'github',
      pipelineId: '42',
      job: 'ci',
      sha: 'abc',
      branch: 'feat/x',
    });
  });

  it('detects Azure DevOps and strips refs/heads', () => {
    expect(
      detectCi({
        TF_BUILD: 'True',
        BUILD_SOURCEBRANCHNAME: 'main',
        SYSTEM_PULLREQUEST_SOURCEBRANCH: 'refs/heads/feat/y',
      }),
    ).toMatchObject({ provider: 'azure', branch: 'feat/y' });
  });

  it('falls back to generic CI / local', () => {
    expect(detectCi({ CI: 'true' })).toEqual({ isCi: true, provider: 'generic' });
    expect(detectCi({ CI: 'false' })).toEqual({ isCi: false });
  });

  it('parses tags', () => {
    expect(parseTags('team=checkout, runner = large,broken,=x')).toEqual({ team: 'checkout', runner: 'large' });
    expect(parseTags(undefined)).toEqual({});
  });

  it('detects the remote cache mode from flags, env and nx.json', () => {
    expect(detectRemoteCache(['--skip-nx-cache'], { NX_SELF_HOSTED_REMOTE_CACHE_SERVER: 'http://c' }, {})).toBe(
      'skipped',
    );
    expect(
      detectRemoteCache([], { NX_SELF_HOSTED_REMOTE_CACHE_SERVER: 'http://c', NX_SKIP_REMOTE_CACHE: 'true' }, {}),
    ).toBe('disabled');
    expect(detectRemoteCache([], { NX_SELF_HOSTED_REMOTE_CACHE_SERVER: 'http://c' }, {})).toBe('enabled');
    expect(detectRemoteCache([], {}, { nxCloudId: 'x' })).toBe('enabled');
    expect(detectRemoteCache([], {}, { nxCloudId: 'x', neverConnectToCloud: true })).toBe('disabled');
  });

  it('trusts env only without daemon', () => {
    expect(isEnvReliable({ NX_DAEMON: 'false' })).toBe(true);
    expect(isEnvReliable({ CI: 'true' })).toBe(true);
    expect(isEnvReliable({ CI: 'true', NX_DAEMON: 'true' })).toBe(false);
    expect(isEnvReliable({})).toBe(false);
  });
});

describe('resolveOutputFile', () => {
  it('env beats options, off disables, relative paths resolve against the workspace', () => {
    expect(resolveOutputFile('/ws', {}, {})).toBe('/ws/.nx/metrics/runs.jsonl');
    expect(resolveOutputFile('/ws', { outputFile: 'out/r.jsonl' }, {})).toBe('/ws/out/r.jsonl');
    expect(resolveOutputFile('/ws', { outputFile: 'out/r.jsonl' }, { NX_METRICS_FILE: '/abs/x.jsonl' })).toBe(
      '/abs/x.jsonl',
    );
    expect(resolveOutputFile('/ws', {}, { NX_METRICS_FILE: 'off' })).toBeUndefined();
    expect(resolveOutputFile('/ws', { outputFile: false }, {})).toBeUndefined();
  });
});
