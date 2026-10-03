// Executor @mo-transfer/tooling-openapi:update-spec: the entry's url (openapi-clients.json) → the committed
// spec file (normalized). Not cached (network). Fails for a client without url.
import { updateSpec } from '../facade';
import { type ClientExecutorOptions, type ExecutorRunContext, runClientExecutor } from './run';

export default async function openapiUpdateSpecExecutor(
  options: ClientExecutorOptions,
  context: ExecutorRunContext,
): Promise<{ success: boolean }> {
  return runClientExecutor(options, context, async (client) => {
    const { changed } = await updateSpec(client, context.root, context.projectName as string);
    return `${client.spec.file}: ${changed ? 'updated' : 'unchanged'} (${client.spec.url})`;
  });
}
