/**
 * Context of a run that Nx does not hand to the hook: CI provider, commit, machine, remote cache mode.
 * Pure functions take `env` explicitly (testable); the impure helpers (git, nx version) never throw.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { arch, cpus, platform, totalmem } from 'node:os';
import { join } from 'node:path';

export type Env = Readonly<Record<string, string | undefined>>;

export interface CiInfo {
  isCi: boolean;
  provider?: string;
  pipelineId?: string;
  job?: string;
  sha?: string;
  branch?: string;
}

export interface GitInfo {
  sha?: string;
  branch?: string;
}

export interface MachineInfo {
  os: string;
  arch: string;
  cpus: number;
  cpuModel?: string;
  memoryGb: number;
  node: string;
  nx?: string;
}

/** `skipped`: no cache at all (`--skip-nx-cache`), `disabled`: local cache only, `enabled`: remote cache configured. */
export type RemoteCacheMode = 'skipped' | 'disabled' | 'enabled';

interface CiProvider {
  provider: string;
  detect: string;
  pipelineId: string;
  job: string;
  sha: string;
  branch: string[];
}

const CI_PROVIDERS: CiProvider[] = [
  {
    provider: 'github',
    detect: 'GITHUB_ACTIONS',
    pipelineId: 'GITHUB_RUN_ID',
    job: 'GITHUB_JOB',
    sha: 'GITHUB_SHA',
    branch: ['GITHUB_HEAD_REF', 'GITHUB_REF_NAME'],
  },
  {
    provider: 'gitlab',
    detect: 'GITLAB_CI',
    pipelineId: 'CI_PIPELINE_ID',
    job: 'CI_JOB_NAME',
    sha: 'CI_COMMIT_SHA',
    branch: ['CI_MERGE_REQUEST_SOURCE_BRANCH_NAME', 'CI_COMMIT_REF_NAME'],
  },
  {
    provider: 'azure',
    detect: 'TF_BUILD',
    pipelineId: 'BUILD_BUILDID',
    job: 'SYSTEM_JOBDISPLAYNAME',
    sha: 'BUILD_SOURCEVERSION',
    branch: ['SYSTEM_PULLREQUEST_SOURCEBRANCH', 'BUILD_SOURCEBRANCHNAME'],
  },
  {
    provider: 'jenkins',
    detect: 'JENKINS_URL',
    pipelineId: 'BUILD_ID',
    job: 'JOB_NAME',
    sha: 'GIT_COMMIT',
    branch: ['CHANGE_BRANCH', 'GIT_BRANCH'],
  },
  {
    provider: 'bitbucket',
    detect: 'BITBUCKET_BUILD_NUMBER',
    pipelineId: 'BITBUCKET_BUILD_NUMBER',
    job: 'BITBUCKET_STEP_UUID',
    sha: 'BITBUCKET_COMMIT',
    branch: ['BITBUCKET_BRANCH'],
  },
];

export function isTruthy(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

export function detectCi(env: Env): CiInfo {
  const match = CI_PROVIDERS.find((candidate) => isTruthy(env[candidate.detect]));
  if (!match) return isTruthy(env.CI) ? { isCi: true, provider: 'generic' } : { isCi: false };
  const branch = match.branch.map((key) => env[key]).find((value) => value);
  return {
    isCi: true,
    provider: match.provider,
    pipelineId: env[match.pipelineId],
    job: env[match.job],
    sha: env[match.sha],
    branch: branch?.replace(/^refs\/heads\//, ''),
  };
}

/** `NX_METRICS_TAGS="team=checkout,runner=large"` → `{ team: 'checkout', runner: 'large' }`. */
export function parseTags(raw: string | undefined): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const pair of (raw ?? '').split(',')) {
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    tags[pair.slice(0, separator).trim()] = pair.slice(separator + 1).trim();
  }
  return tags;
}

interface CloudSettings {
  nxCloudId?: string;
  nxCloudAccessToken?: string;
  neverConnectToCloud?: boolean;
}

const hasFlag = (argv: readonly string[], ...flags: string[]) =>
  argv.some((arg) => flags.some((flag) => arg === flag || arg === `${flag}=true`));

export function detectRemoteCache(argv: readonly string[], env: Env, nxJson: CloudSettings): RemoteCacheMode {
  if (hasFlag(argv, '--skip-nx-cache', '--skipNxCache', '--disable-nx-cache') || env.NX_SKIP_NX_CACHE === 'true')
    return 'skipped';
  if (
    hasFlag(argv, '--skip-remote-cache', '--skipRemoteCache', '--disable-remote-cache') ||
    env.NX_SKIP_REMOTE_CACHE === 'true' ||
    env.NX_DISABLE_REMOTE_CACHE === 'true'
  ) {
    return 'disabled';
  }
  const cloud =
    !nxJson.neverConnectToCloud && Boolean(nxJson.nxCloudId || nxJson.nxCloudAccessToken || env.NX_CLOUD_ACCESS_TOKEN);
  return env.NX_SELF_HOSTED_REMOTE_CACHE_SERVER || cloud ? 'enabled' : 'disabled';
}

/**
 * With the Nx daemon on, the hook runs in the daemon's plugin worker: its `process.env` is the daemon's, not the
 * one of the `nx` command (label, tags, CI variables may be stale). Nx turns the daemon off on CI by default.
 */
export function isEnvReliable(env: Env): boolean {
  if (env.NX_DAEMON === 'false') return true;
  return isTruthy(env.CI) && env.NX_DAEMON !== 'true';
}

function git(workspaceRoot: string, args: string[]): string | undefined {
  try {
    return (
      execFileSync('git', args, {
        cwd: workspaceRoot,
        encoding: 'utf-8',
        timeout: 2000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() || undefined
    );
  } catch {
    return undefined;
  }
}

/** CI variables first (detached HEAD on CI), git as fallback. */
export function gitInfo(workspaceRoot: string, ci: CiInfo): GitInfo {
  const sha = ci.sha ?? git(workspaceRoot, ['rev-parse', 'HEAD']);
  const branch = ci.branch ?? git(workspaceRoot, ['rev-parse', '--abbrev-ref', 'HEAD']);
  return { sha, branch: branch === 'HEAD' ? undefined : branch };
}

export function nxVersion(workspaceRoot: string): string | undefined {
  try {
    return (
      JSON.parse(readFileSync(join(workspaceRoot, 'node_modules', 'nx', 'package.json'), 'utf-8')) as {
        version: string;
      }
    ).version;
  } catch {
    return undefined;
  }
}

export function machineInfo(workspaceRoot: string): MachineInfo {
  const processors = cpus();
  return {
    os: platform(),
    arch: arch(),
    cpus: processors.length,
    cpuModel: processors[0]?.model,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    node: process.version,
    nx: nxVersion(workspaceRoot),
  };
}
