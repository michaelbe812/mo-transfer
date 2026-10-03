/**
 * Shared executor frame: client path → ClientDefinition (openapi-clients.json at run time), errors printed with
 * phase, client, adapter, hint and cause chain (formatError). `--verbose` (Nx sets NX_VERBOSE_LOGGING, or the
 * executor option) streams generator output and prints stage progress + the tooling stack.
 */
import type { ExecutorContext } from '@nx/devkit';
import type { ClientDefinition } from '../adapter';
import { formatError } from '../errors';
import { resolveClient } from '../facade';

export interface ClientExecutorOptions {
  /** client path below libsDir, e.g. `generated/pet-client` */
  client: string;
  /** stream generator output, print stage progress and stacks (also: `nx run … --verbose`) */
  verbose?: boolean;
}

export type ExecutorRunContext = Pick<ExecutorContext, 'root' | 'projectName'> & { isVerbose?: boolean };

export const isVerbose = (options: ClientExecutorOptions, context: ExecutorRunContext): boolean =>
  Boolean(options.verbose || context.isVerbose || process.env.NX_VERBOSE_LOGGING === 'true');

export async function runClientExecutor(
  options: ClientExecutorOptions,
  context: ExecutorRunContext,
  run: (client: ClientDefinition, verbose: boolean) => Promise<string>,
): Promise<{ success: boolean }> {
  const verbose = isVerbose(options, context);
  try {
    console.log(await run(resolveClient(context.root, options.client), verbose));
    return { success: true };
  } catch (error) {
    console.error(formatError(error, verbose));
    return { success: false };
  }
}
