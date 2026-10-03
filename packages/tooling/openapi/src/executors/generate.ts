// Executor @mo-transfer/tooling-openapi:generate (target generate-api-client): pipeline, preset client.
// Option `client` = client path; adapter, options and pipeline come from openapi-clients.json at run time.
import { generateClient } from '../facade';
import { type ClientExecutorOptions, type ExecutorRunContext, runClientExecutor } from './run';

export type { ClientExecutorOptions } from './run';

export default async function openapiGenerateExecutor(
  options: ClientExecutorOptions,
  context: ExecutorRunContext,
): Promise<{ success: boolean }> {
  return runClientExecutor(options, context, async (client, verbose) => {
    const written = await generateClient(client, context.root, { verbose });
    return `${context.projectName}: ${client.generator.adapter} → ${JSON.stringify(written)} files`;
  });
}
