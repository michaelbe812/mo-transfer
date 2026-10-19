/**
 * Mocks engine `examples` of the testing preset: `<client>Handlers`, one msw handler per operation of the spec,
 * written on the typed `<client>Http` (openapi-msw) — the typecheck of the testing lib checks the generated
 * bodies against the spec, too. Bodies are computed at generation time (./example-value): spec examples first,
 * fixed placeholders for the rest. No faker, no runtime: the testing lib needs only msw + openapi-msw.
 *
 *   handlers.ts  `<client>Handlers` (inline bodies)
 *   index.ts     schema types, http, handlers
 */
import { exampleValue, isRecord, type Json, resolveLocal } from './example-value';

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;

const pascalCase = (text: string): string =>
  text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');

/** operationId, else method + path (`get /pet/{petId}` → GetPetPetId): names the handler in comments. */
const operationName = (method: string, path: string, operation: Json): string =>
  pascalCase(typeof operation.operationId === 'string' ? operation.operationId : `${method} ${path}`);

/** Success response: 200, else the lowest 2xx, else 2XX, else default (sent as 200). */
function successResponse(responses: Json = {}): { code: string; status: number } | undefined {
  const codes = Object.keys(responses);
  const success = codes.filter((code) => /^2\d\d$/.test(code)).sort();
  const code = success.includes('200') ? '200' : (success[0] ?? codes.find((c) => c === '2XX' || c === 'default'));
  return code === undefined ? undefined : { code, status: /^\d+$/.test(code) ? Number(code) : 200 };
}

export interface Media {
  type: string;
  kind: 'json' | 'text';
}

/** JSON first (application/json, +json, *\/*), else text/*; anything else (xml, binary) is sent without body. */
function pickMedia(content: Json = {}): Media | undefined {
  const types = Object.keys(content);
  const json = types.find((type) => /^application\/(.+\+)?json$|^\*\/\*$/.test(type.split(';')[0]));
  if (json) return { type: json, kind: 'json' };
  const text = types.find((type) => type.startsWith('text/'));
  return text ? { type: text, kind: 'text' } : undefined;
}

/** Media example (`example`, else first of `examples`) wins over the schema. */
function mediaExample(document: Json, media: Json): unknown {
  if (media.example !== undefined) return media.example;
  const [first] = Object.values(isRecord(media.examples) ? media.examples : {});
  return first === undefined ? undefined : (resolveLocal(document, first) as Json).value;
}

export interface Operation {
  name: string;
  method: (typeof METHODS)[number];
  path: string;
  status: number;
  code?: string;
  media?: Media;
  content?: Json;
}

/** Every operation with its success response, static paths before templated ones (msw: first match wins). */
export function collectOperations(document: Json): Operation[] {
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(isRecord(document.paths) ? document.paths : {})) {
    if (!isRecord(item)) continue;
    for (const method of METHODS) {
      const operation = item[method];
      if (!isRecord(operation)) continue;
      const responses = isRecord(operation.responses) ? operation.responses : undefined;
      const success = successResponse(responses);
      const response = success && responses ? (resolveLocal(document, responses[success.code]) as Json) : undefined;
      const content = isRecord(response?.content) ? response.content : undefined;
      const media = pickMedia(content);
      operations.push({
        name: operationName(method, path, operation),
        method,
        path,
        status: success?.status ?? 200,
        code: success?.code,
        media,
        content: media && content ? (content[media.type] as Json) : undefined,
      });
    }
  }
  const templated = (path: string): number => (path.match(/\{/g) ?? []).length;
  return operations.sort((a, b) => templated(a.path) - templated(b.path));
}

const json = (value: unknown): string => JSON.stringify(value);

/** The body of an operation: media example, else the value of its schema. */
export function responseBody(document: Json, op: Operation): unknown {
  const example = op.content ? mediaExample(document, op.content) : undefined;
  return example !== undefined ? structuredClone(example) : exampleValue(document, op.content?.schema ?? {});
}

/** One handler: typed on `<client>Http` when the spec documents the response, else plain msw. */
function handlerLines(document: Json, op: Operation, name: string): string[] {
  const route = `${op.method.toUpperCase()} ${op.path}`;
  if (op.code === undefined) {
    const mswPath = op.path.replace(/\{([^}]+)\}/g, ':$1');
    return [
      `  // ${op.name}: ${route} → ${op.status}, no documented response`,
      `  http.${op.method}(\`\${${name}BaseUrl}${mswPath}\`, () => new HttpResponse(null, { status: ${op.status} })),`,
    ];
  }
  // wildcard/default codes are typed by their key, sent with a concrete status
  const status = /^\d+$/.test(op.code) ? op.code : json(op.code);
  const init = /^\d+$/.test(op.code) ? '' : `, { status: ${op.status} }`;
  const send = !op.media
    ? `empty(${init.slice(2)})`
    : op.media.kind === 'text'
      ? `text(${json(String(responseBody(document, op)))}${init})`
      : `json(${json(responseBody(document, op))}${init})`;
  return [`  // ${op.name}: ${route} → ${op.status}`, `  ${name}Http.${op.method}(${json(op.path)}, ({ response }) => response(${status}).${send}),`];
}

/** file → content (without header) of the testing lib, besides schema.ts and http.ts. */
export function generateExampleHandlers({ document, name }: { document: Json; name: string }): Record<string, string> {
  const operations = collectOperations(document);
  const untyped = operations.some((op) => op.code === undefined);
  const typed = operations.some((op) => op.code !== undefined);
  const fromHttp = [untyped && `${name}BaseUrl`, typed && `${name}Http`].filter(Boolean);
  return {
    'handlers.ts': [
      untyped ? "import { http, type HttpHandler, HttpResponse } from 'msw';" : "import type { HttpHandler } from 'msw';",
      ...(fromHttp.length ? [`import { ${fromHttp.join(', ')} } from './http';`] : []),
      '',
      '/** Default handlers: every operation answers its success status with the spec examples (fixed placeholders for the rest). */',
      `export const ${name}Handlers: HttpHandler[] = [`,
      ...operations.flatMap((op) => handlerLines(document, op, name)),
      '];',
      '',
    ].join('\n'),
    'index.ts': [
      "export type { components, operations, paths } from './schema';",
      "export * from './http';",
      "export * from './handlers';",
      '',
    ].join('\n'),
  };
}
