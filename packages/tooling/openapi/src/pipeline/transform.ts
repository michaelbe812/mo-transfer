/**
 * Stage `transform`: the client's code hooks (pipeline.transforms) in order, on the classified files. Each hook
 * module is a cache input (its folder or package) — but it can read anything (env, network, clock), which the
 * cache cannot see: a non-deterministic hook poisons the cache. Trade-off: docs/openapi-pipeline-architektur.md.
 */
import type { ClientPart, PipelineFile, TransformContext } from '../adapter';
import { type TransformEntry, transformsOf } from '../config';
import { loadTransform } from '../registry/load';
import { validateOptions } from '../registry/validate';

export interface TransformInput {
  files: PipelineFile[];
  transforms: readonly TransformEntry[];
  parts: readonly ClientPart[];
  context: Omit<TransformContext, 'options'>;
}

export async function applyTransforms({ files, transforms, parts, context }: TransformInput): Promise<PipelineFile[]> {
  let current = files;
  for (const { module, options } of transformsOf({ pipeline: { transforms: [...transforms] } })) {
    const transform = await loadTransform(module, context.workspaceRoot, context.client.path);
    const errors = transform.optionsSchema ? validateOptions(transform.optionsSchema, options) : [];
    if (errors.length) throw new Error(`transform ${transform.id}: invalid options\n  ${errors.join('\n  ')}`);
    // hooks get copies: a failing hook cannot leave half-changed files behind
    const input = current.map((file) => ({ ...file }));
    const result = (await transform.transform(input, { ...context, options })) ?? input;
    for (const file of result) {
      if (typeof file?.path !== 'string' || typeof file.content !== 'string' || !parts.includes(file.part)) {
        throw new Error(`transform ${transform.id}: returned an invalid file ${JSON.stringify(file?.path)} (part one of ${parts.join(', ')})`);
      }
    }
    const paths = result.map((file) => file.path);
    const duplicate = paths.find((path, index) => paths.indexOf(path) !== index);
    if (duplicate) throw new Error(`transform ${transform.id}: ${duplicate} twice`);
    context.log(`transform ${transform.id}: ${result.length} files`);
    current = result;
  }
  return current;
}
