/**
 * Generator processes (ctx.run of adapters): workspace root as cwd, node_modules/.bin in PATH, $PWD pinned to the
 * cwd (openapi-generator-cli resolves its storageDir against $PWD). --verbose streams the output, otherwise it is
 * captured and travels with the error.
 */
import { execFileSync } from 'node:child_process';
import { delimiter, join } from 'node:path';

export class ProcessError extends Error {
  constructor(
    message: string,
    readonly output: string,
  ) {
    super(output ? `${message}:\n${output}` : message);
    this.name = 'ProcessError';
  }
}

export interface RunOptions {
  cwd?: string;
  env?: Record<string, string>;
  verbose?: boolean;
}

type ExecError = Error & { status?: number | null; stdout?: Buffer | string; stderr?: Buffer | string };

export function runProcess(workspaceRoot: string, command: string, args: string[], options: RunOptions = {}): void {
  const cwd = options.cwd ?? workspaceRoot;
  const env = {
    ...process.env,
    PATH: [join(workspaceRoot, 'node_modules/.bin'), process.env.PATH ?? ''].join(delimiter),
    ...options.env,
    PWD: cwd,
  };
  try {
    execFileSync(command, args, { cwd, env, stdio: options.verbose ? 'inherit' : 'pipe' });
  } catch (error) {
    const { status, stdout = '', stderr = '' } = error as ExecError;
    const reason = status === null || status === undefined ? (error as Error).message : `exit ${status}`;
    throw new ProcessError(`${command} failed (${reason})`, `${String(stdout)}${String(stderr)}`);
  }
}
