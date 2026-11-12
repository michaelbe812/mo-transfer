/**
 * Affected replay: replays the last N commits (first parent) against the CURRENT project graph and counts what
 * `nx affected` would run. Run it on the old and on the new structure with the same commit range → the affected
 * ratio before/after slicing. Files that no longer exist after a move simply drop out (caveat in the README).
 */
import { execFileSync } from 'node:child_process';
import { runNx } from './nx.ts';
import { formatPercent, summarize, type Summary } from './stats.ts';

export interface AffectedOptions {
  repo: string;
  ref: string;
  commits: number;
  withTarget?: string;
  log?: (line: string) => void;
}

export interface AffectedCommit {
  sha: string;
  subject: string;
  affected: number;
  ratio: number;
}

export interface AffectedReplay {
  ref: string;
  withTarget?: string;
  totalProjects: number;
  commits: AffectedCommit[];
  affected?: Summary;
  ratio?: Summary;
  /** Commits that hit every project (lockfile, nx.json, root tsconfig …). */
  allAffected: number;
}

interface CommitRef {
  sha: string;
  subject: string;
}

export function parseCommitLog(output: string): CommitRef[] {
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [sha, parents, ...subject] = line.split('\x1f');
      return { sha, parents: parents.trim().split(' ').filter(Boolean), subject: subject.join('\x1f') };
    })
    .filter((commit) => commit.parents.length > 0) // root commit has nothing to diff against
    .map(({ sha, subject }) => ({ sha, subject }));
}

function commitsOf(repo: string, ref: string, count: number): CommitRef[] {
  const output = execFileSync(
    'git',
    ['log', '--first-parent', `--max-count=${count}`, '--format=%H%x1f%P%x1f%s', ref],
    { cwd: repo, encoding: 'utf-8' },
  );
  return parseCommitLog(output);
}

function projects(repo: string, extra: string[]): string[] {
  return JSON.parse(runNx(repo, ['show', 'projects', '--json', ...extra])) as string[];
}

export function replayAffected(options: AffectedOptions): AffectedReplay {
  const targetFilter = options.withTarget ? ['--with-target', options.withTarget] : [];
  const totalProjects = projects(options.repo, targetFilter).length;
  const commits: AffectedCommit[] = [];
  for (const commit of commitsOf(options.repo, options.ref, options.commits)) {
    const affected = projects(options.repo, [
      '--affected',
      `--base=${commit.sha}~1`,
      `--head=${commit.sha}`,
      ...targetFilter,
    ]).length;
    commits.push({ ...commit, affected, ratio: totalProjects ? affected / totalProjects : 0 });
    options.log?.(
      `  ${commit.sha.slice(0, 8)} ${String(affected).padStart(4)} / ${totalProjects}  ${commit.subject.slice(0, 70)}`,
    );
  }
  return {
    ref: options.ref,
    withTarget: options.withTarget,
    totalProjects,
    commits,
    affected: summarize(commits.map((commit) => commit.affected)),
    ratio: summarize(commits.map((commit) => commit.ratio)),
    allAffected: commits.filter((commit) => commit.affected === totalProjects).length,
  };
}

export function affectedToMarkdown(replay: AffectedReplay): string {
  const { affected, ratio } = replay;
  return [
    `# Affected replay (${replay.commits.length} commits on ${replay.ref}${replay.withTarget ? `, projects with target \`${replay.withTarget}\`` : ''})`,
    '',
    `- projects in graph: ${replay.totalProjects}`,
    `- affected per commit: mean **${affected?.mean.toFixed(1) ?? '–'}** (${formatPercent(ratio?.mean)}), median ${affected?.median ?? '–'}, p90 ${affected?.p90.toFixed(1) ?? '–'}, max ${affected?.max ?? '–'}`,
    `- commits affecting everything: ${replay.allAffected} / ${replay.commits.length}`,
    '',
    '| commit | affected | share | subject |',
    '|---|---:|---:|---|',
    ...replay.commits.map(
      (commit) =>
        `| ${commit.sha.slice(0, 8)} | ${commit.affected} | ${formatPercent(commit.ratio)} | ${commit.subject.replaceAll('|', '\\|')} |`,
    ),
    '',
  ].join('\n');
}
