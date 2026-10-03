// Executor @mo-transfer/tooling-openapi:generate-testing: the client's testing lib (openapi-typescript,
// orval msw mocks, openapi-msw) from its committed spec only. Pipeline: src/testing/testing.ts.
import type { ExecutorContext } from '@nx/devkit';
import { resolveClient } from '../facade/facade';
import { generateTestingLib } from '../testing/testing';
import type { ClientExecutorOptions } from './generate';

export default async function openapiGenerateTestingExecutor(
  { client: clientPath }: ClientExecutorOptions,
  context: Pick<ExecutorContext, 'root' | 'projectName'>,
): Promise<{ success: boolean }> {
  try {
    const { files, baseUrl } = await generateTestingLib(resolveClient(context.root, clientPath), context.root);
    console.log(`${context.projectName}: ${files} files (baseUrl ${JSON.stringify(baseUrl)})`);
    return { success: true };
  } catch (error) {
    console.error((error as Error).message);
    return { success: false };
  }
}
