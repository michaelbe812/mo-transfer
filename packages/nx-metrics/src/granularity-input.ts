/** Collects what `analyzeGranularity` needs from a workspace: graph, source sizes, git history, run records. */
import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { NxGraphFile } from './graph.ts';
import { readNxGraph } from './graph.ts';
import type { CommitFiles, GranularityInput } from './granularity.ts';
import type { RunRecord } from './record.ts';
import { readJsonl } from './sinks.ts';

/** Files that don't feed a build: tests, stories, docs, lint/test configs. */
export const DEFAULT_IGNORE =
  /(\.(spec|test|stories|cy)\.[cm]?[jt]sx?$)|(\.md$)|((^|\/)(eslint\.config\.[cm]?js|\.eslintrc(\.json)?|tsconfig\.spec\.json|(vitest|jest)\.config\.[cm]?[jt]s)$)/;

/** Workspace-level files that (pessimistically) invalidate every project. */
export const DEFAULT_GLOBAL =
  /^(package\.json|nx\.json|tsconfig\.base\.json|tsconfig\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|bun\.lockb?)$/;

export interface CollectOptions {
  repo: string;
  target: string;
  ref: string;
  commits: number;
  recordFiles: string[];
  ignore?: RegExp;
  global?: RegExp;
}

function git(repo: string, args: string[]): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf-8', maxBuffer: 512 * 1024 * 1024 });
}

/** Longest project root wins (nested projects); a root project (`.`) only gets what nobody else owns. */
export function createOwnerLookup(graph: NxGraphFile): (file: string) => string | undefined {
  const projects = Object.values(graph.graph.nodes).map((node) => ({ name: node.name, root: node.data.root }));
  const rootProject = projects.find((project) => project.root === '.' || project.root === '');
  const nested = projects.filter((project) => project !== rootProject).sort((a, b) => b.root.length - a.root.length);
  return (file) => nested.find(({ root }) => file === root || file.startsWith(`${root}/`))?.name ?? rootProject?.name;
}

const RECORD = '\x1e';
const FIELD = '\x1f';

export function parseNameOnlyLog(output: string): CommitFiles[] {
  return output
    .split(RECORD)
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const [header, ...paths] = chunk.split('\n');
      const [sha, subject] = header.split(FIELD);
      return { sha, subject, files: [...new Set(paths.map((path) => path.trim()).filter(Boolean))] };
    });
}

function readCommits(repo: string, ref: string, count: number): CommitFiles[] {
  return parseNameOnlyLog(
    git(repo, [
      'log',
      '--no-merges',
      '--name-only',
      `--max-count=${count}`,
      `--format=${RECORD}%H${FIELD}%s`,
      ref,
      '--',
    ]),
  );
}

function sourceSizes(repo: string, ownerOf: (file: string) => string | undefined, ignore: RegExp) {
  const sizes: Record<string, number> = {};
  for (const file of git(repo, ['ls-files', '-z']).split('\0')) {
    if (!file || ignore.test(file)) continue;
    const owner = ownerOf(file);
    if (!owner) continue;
    try {
      sizes[owner] = (sizes[owner] ?? 0) + statSync(join(repo, file)).size;
    } catch {
      // deleted in the working tree
    }
  }
  return sizes;
}

export function collectGranularityInput(options: CollectOptions): GranularityInput {
  const graph = readNxGraph(options.repo);
  const ownerOf = createOwnerLookup(graph);
  const ignore = options.ignore ?? DEFAULT_IGNORE;
  const global = options.global ?? DEFAULT_GLOBAL;
  return {
    graph,
    target: options.target,
    sizes: sourceSizes(options.repo, ownerOf, ignore),
    commits: readCommits(options.repo, options.ref, options.commits),
    records: options.recordFiles.flatMap((file) => readJsonl<RunRecord>(file)),
    ownerOf,
    isGlobal: (file) => global.test(file),
    isIgnored: (file) => ignore.test(file),
  };
}
