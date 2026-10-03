// Executor @mo-transfer/tooling-openapi:generate. Option `client` = client path below libs/; the definition
// (adapter, options, spec) comes from openapi-clients.json at run time. Facade: src/facade/facade.ts.
import type { ExecutorContext } from '@nx/devkit';
import { generateClient, resolveClient } from '../facade/facade';

export interface ClientExecutorOptions {
  /** client path below libs/, e.g. `generated/pet-client` */
  client: string;
}

export default async function openapiGenerateExecutor(
  { client: clientPath }: ClientExecutorOptions,
  context: Pick<ExecutorContext, 'root' | 'projectName'>,
): Promise<{ success: boolean }> {
  try {
    const client = resolveClient(context.root, clientPath);
    const written = await generateClient(client, context.root);
    console.log(`${context.projectName}: ${client.generator.adapter} → ${JSON.stringify(written)} files`);
    return { success: true };
  } catch (error) {
    console.error((error as Error).message);
    return { success: false };
  }
}
