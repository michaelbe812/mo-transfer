// Executor @mo-transfer/tooling-openapi:generate-testing (target generate-api-testing): pipeline, preset testing —
// the client's testing lib (openapi-typescript, orval msw mocks, openapi-msw) from its spec only.
import { generateTesting } from '../facade';
import { type ClientExecutorOptions, type ExecutorRunContext, runClientExecutor } from './run';

export default async function openapiGenerateTestingExecutor(
  options: ClientExecutorOptions,
  context: ExecutorRunContext,
): Promise<{ success: boolean }> {
  return runClientExecutor(options, context, async (client, verbose) => {
    const { files, baseUrl } = await generateTesting(client, context.root, { verbose });
    return `${context.projectName}: ${files} files (baseUrl ${JSON.stringify(baseUrl)})`;
  });
}
