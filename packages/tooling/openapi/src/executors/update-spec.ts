// Executor @mo-transfer/tooling-openapi:update-spec: the entry's url (openapi-clients.json) → the committed
// spec file (normalized). Not cached (network). Fails for a client without url.
import type { ExecutorContext } from '@nx/devkit';
import { resolveClient, updateSpec } from '../facade/facade';
import type { ClientExecutorOptions } from './generate';

export default async function openapiUpdateSpecExecutor(
  { client: clientPath }: ClientExecutorOptions,
  context: Pick<ExecutorContext, 'root' | 'projectName'>,
): Promise<{ success: boolean }> {
  try {
    const client = resolveClient(context.root, clientPath);
    const { changed } = await updateSpec(client, context.root, context.projectName as string);
    console.log(`${client.spec.file}: ${changed ? 'updated' : 'unchanged'} (${client.spec.url})`);
    return { success: true };
  } catch (error) {
    console.error((error as Error).message);
    return { success: false };
  }
}
