/**
 * Errors of the OpenAPI tooling: where it broke (phase = pipeline stage or setup step), for which client and
 * adapter, why (cause) and what to do (hint). Executors print all of it (src/executors/run.ts).
 */

export type OpenApiPhase =
  | 'config'
  | 'registry'
  | 'load'
  | 'options'
  | 'requires'
  | 'spec'
  | 'generate'
  | 'classify'
  | 'transform'
  | 'split'
  | 'barrel'
  | 'finalize'
  | 'write'
  | 'update-spec'
  | 'scaffold';

export interface OpenApiErrorDetails {
  phase: OpenApiPhase;
  client?: string;
  adapter?: string;
  hint?: string;
  cause?: unknown;
}

export class OpenApiError extends Error {
  readonly phase: OpenApiPhase;
  client?: string;
  adapter?: string;
  hint?: string;

  constructor(message: string, details: OpenApiErrorDetails) {
    super(message, details.cause === undefined ? undefined : { cause: details.cause });
    this.name = 'OpenApiError';
    this.phase = details.phase;
    this.client = details.client;
    this.adapter = details.adapter;
    this.hint = details.hint;
  }

  /** An OpenApiError keeps its phase (the innermost one is the precise one), missing client/adapter are filled in. */
  static wrap(error: unknown, details: OpenApiErrorDetails): OpenApiError {
    if (error instanceof OpenApiError) {
      error.client ??= details.client;
      error.adapter ??= details.adapter;
      error.hint ??= details.hint;
      return error;
    }
    const message = error instanceof Error ? error.message : String(error);
    return new OpenApiError(message, { ...details, cause: error });
  }
}

/**
 * Human-readable error: `[phase] client (adapter): message`, hint, cause chain with stacks. The stack of the
 * OpenApiError itself only with `verbose` (it points into the tooling, the causes point to the culprit).
 */
export function formatError(error: unknown, verbose = false): string {
  if (!(error instanceof OpenApiError)) {
    return error instanceof Error ? (error.stack ?? error.message) : String(error);
  }
  const where = [error.client, error.adapter && `(adapter ${error.adapter})`].filter(Boolean).join(' ');
  const lines = [`[openapi:${error.phase}]${where ? ` ${where}` : ''}: ${error.message}`];
  if (error.hint) lines.push(`  hint: ${error.hint}`);
  if (verbose && error.stack) lines.push(error.stack);
  let cause: unknown = error.cause;
  while (cause !== undefined) {
    lines.push(`  caused by: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`);
    cause = cause instanceof Error ? cause.cause : undefined;
  }
  return lines.join('\n');
}
