/**
 * Mocks engine `schema-faker` of the testing preset (default; `orval` deprecated): walks the spec itself — no orval,
 * only msw + faker at test time.
 *
 *   mock-runtime.ts  copy of ./runtime/mock-runtime.ts: fake(schema) (examples first, faker fallback) + mockHandler()
 *   mocks.ts         per operation get<Op>ResponseMock() (typed from schema.ts `paths`) + get<Op>MockHandler(),
 *                    the reachable component schemas as data
 *   model.ts         `export type <Schema> = components['schemas']['<Schema>']` (orval's model/** replacement)
 *   handlers.ts      `<client>Handlers` = every get<Op>MockHandler()
 *
 * Same export names as orval (get<Op>ResponseMock / get<Op>MockHandler / component types), so specs don't change.
 * Only local refs (`#/…`); external refs fail (bundle the spec first).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

type Json = Record<string, unknown>;

const METHODS = ['get', 'put', 'post', 'delete', 'patch', 'head', 'options'] as const;
const SCHEMA_REF = '#/components/schemas/';
/** Keys the runtime ignores: dropped from the emitted data (size). */
const DOC_KEYS = new Set(['description', 'title', 'xml', 'externalDocs', 'deprecated', 'readOnly', 'default']);

/** The runtime source, copied into every testing lib (an asset next to this file, also in the built dist). */
export const RUNTIME_FILE = join(__dirname, 'runtime/mock-runtime.ts');

const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);

const pascalCase = (text: string): string =>
  text
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join('');

/** orval's naming: operationId, else method + path (`get /pet/{petId}` → GetPetPetId). */
const operationName = (method: string, path: string, operation: Json): string =>
  pascalCase(typeof operation.operationId === 'string' ? operation.operationId : `${method} ${path}`);

/** `#/components/responses/X` etc. inside the document; schema refs stay (resolved at test time). */
function resolveLocal(document: Json, value: unknown): unknown {
  if (!isRecord(value) || typeof value.$ref !== 'string') return value;
  const ref = value.$ref;
  if (!ref.startsWith('#/')) throw new Error(`unsupported $ref ${ref} (only local refs)`);
  const target = ref
    .slice(2)
    .split('/')
    .reduce<unknown>((node, key) => (isRecord(node) ? node[key.replaceAll('~1', '/').replaceAll('~0', '~')] : undefined), document);
  if (target === undefined) throw new Error(`unresolved $ref ${ref}`);
  return resolveLocal(document, target);
}

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

/** JSON first (application/json, +json, *\/*), else text/*; anything else (xml, binary) has no mock body. */
function pickMedia(content: Json = {}): Media | undefined {
  const types = Object.keys(content);
  const json = types.find((type) => /^application\/(.+\+)?json$|^\*\/\*$/.test(type.split(';')[0]));
  if (json) return { type: json, kind: 'json' };
  const text = types.find((type) => type.startsWith('text/'));
  return text ? { type: text, kind: 'text' } : undefined;
}

/** Media example (`example`, else first of `examples`) wins over the schema (orval: useExamples). */
function mediaExample(document: Json, media: Json): unknown {
  if (media.example !== undefined) return media.example;
  const [first] = Object.values(isRecord(media.examples) ? media.examples : {});
  return first === undefined ? undefined : (resolveLocal(document, first) as Json).value;
}

/** Copy without doc keys, collecting every component schema the value refers to. */
function stripSchema(value: unknown, refs: Set<string>): unknown {
  if (Array.isArray(value)) return value.map((item) => stripSchema(item, refs));
  if (!isRecord(value)) return value;
  if (typeof value.$ref === 'string') {
    if (!value.$ref.startsWith(SCHEMA_REF)) throw new Error(`unsupported schema $ref ${value.$ref}`);
    refs.add(value.$ref.slice(SCHEMA_REF.length));
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !DOC_KEYS.has(key))
      .map(([key, child]) => [key, key === 'example' || key === 'examples' ? child : stripSchema(child, refs)]),
  );
}

/** Component schemas reachable from `refs` (transitively), stripped, sorted by name. */
function reachableSchemas(document: Json, refs: Set<string>): Json {
  const components = isRecord(document.components) ? document.components : {};
  const all = isRecord(components.schemas) ? components.schemas : {};
  const result: Json = {};
  const queue = [...refs];
  while (queue.length) {
    const name = queue.shift() as string;
    if (name in result) continue;
    if (!(name in all)) throw new Error(`unresolved $ref ${SCHEMA_REF}${name}`);
    const nested = new Set<string>();
    result[name] = stripSchema(all[name], nested);
    queue.push(...nested);
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

export interface Operation {
  name: string;
  method: string;
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

/** Object response → `get<Op>ResponseMock(overrides)` like orval (refs resolved in the document). */
function isObject(schema: Json, document: Json): boolean {
  const resolved = (schema.$ref ? resolveLocal(document, schema) : schema) as Json;
  if (Array.isArray(resolved.allOf)) return resolved.allOf.some((part) => isObject(part as Json, document));
  const types = [resolved.type].flat().filter((type) => type && type !== 'null');
  return types[0] === 'object' || (!types.length && Boolean(resolved.properties || resolved.additionalProperties));
}

/** The operation lines of mocks.ts (component refs collected into `refs`). */
function operationLines(document: Json, op: Operation, refs: Set<string>): string[] {
  const route = `${op.method.toUpperCase()} ${op.path}`;
  const mswPath = `*${op.path.replace(/\{([^}]+)\}/g, ':$1')}`;
  if (!op.media || !op.content) {
    return [
      `/** ${route} → ${op.status} without body. */`,
      `export const get${op.name}MockHandler = (overrideResponse?: MockOverride<void>, options?: RequestHandlerOptions): HttpHandler =>`,
      `  mockHandler(${json(op.method)}, ${json(mswPath)}, ${op.status}, 'empty', () => undefined, overrideResponse, options);`,
      '',
    ];
  }
  const type = `paths[${json(op.path)}][${json(op.method)}]['responses'][${json(op.code)}]['content'][${json(op.media.type)}]`;
  const example = mediaExample(document, op.content);
  const schema = stripSchema(op.content.schema ?? {}, refs) as Json;
  const data = json(example === undefined ? schema : { ...schema, example });
  // the operation keys the fake data: its values never depend on other operations
  const faked = `fake(${data}, schemas, ${json(op.name)})`;
  return [
    `type ${op.name}Response = ${type};`,
    '',
    `/** ${route} → ${op.status} ${op.media.type}: ${example === undefined ? 'faker from the schema (property examples first)' : 'the spec example'}. */`,
    isObject(schema, document)
      ? `export const get${op.name}ResponseMock = (overrideResponse: Partial<${op.name}Response> = {}): ${op.name}Response => ({ ...(${faked} as object), ...overrideResponse }) as ${op.name}Response;`
      : `export const get${op.name}ResponseMock = (): ${op.name}Response => ${faked} as ${op.name}Response;`,
    '',
    `export const get${op.name}MockHandler = (overrideResponse?: MockOverride<${op.name}Response>, options?: RequestHandlerOptions): HttpHandler =>`,
    `  mockHandler(${json(op.method)}, ${json(mswPath)}, ${op.status}, ${json(op.media.kind)}, () => get${op.name}ResponseMock(), overrideResponse, options);`,
    '',
  ];
}

/** file → content (without header) of the testing lib, besides schema.ts and http.ts. */
export function generateSchemaFakerMocks({ document, name, specPath }: { document: Json; name: string; specPath: string }): Record<string, string> {
  const operations = collectOperations(document);
  if (!operations.length) throw new Error(`${specPath}: no operations, no msw handlers`);
  const refs = new Set<string>();
  const lines = operations.flatMap((op) => operationLines(document, op, refs));
  const mocks = [
    "import type { HttpHandler, RequestHandlerOptions } from 'msw';",
    "import { fake, mockHandler, type MockOverride, type Schemas } from './mock-runtime';",
    "import type { paths } from './schema';",
    '',
    '/** Reference date of the date formats (fixed, UTC); configureFakeData({ refDate }) changes it for every client. */',
    "export { configureFakeData, MOCK_REF_DATE } from './mock-runtime';",
    '',
    '/** Component schemas reachable from the responses (doc keys dropped), resolved by fake() at test time. */',
    `const schemas: Schemas = ${JSON.stringify(reachableSchemas(document, refs), null, 2)};`,
    '',
    ...lines,
  ].join('\n');
  const components = isRecord(document.components) && isRecord(document.components.schemas) ? document.components.schemas : {};
  const model = Object.keys(components)
    .filter((schemaName) => /^[A-Za-z_$][\w$]*$/.test(schemaName))
    .map((schemaName) => `export type ${schemaName} = components['schemas'][${json(schemaName)}];`);
  return {
    'mock-runtime.ts': readFileSync(RUNTIME_FILE, 'utf-8'),
    'mocks.ts': mocks,
    'model.ts': [model.length ? "import type { components } from './schema';" : 'export {};', '', ...model, ''].join('\n'),
    'handlers.ts': [
      "import type { HttpHandler } from 'msw';",
      `import { ${operations.map((op) => `get${op.name}MockHandler`).join(', ')} } from './mocks';`,
      '',
      '/** Default handlers: every operation of the spec answers its success status with examples, faker fills the rest. */',
      `export const ${name}Handlers: HttpHandler[] = [`,
      ...operations.map((op) => `  get${op.name}MockHandler(),`),
      '];',
      '',
    ].join('\n'),
    'index.ts': [
      "export type { components, operations, paths } from './schema';",
      "export type * from './model';",
      "export * from './mocks';",
      "export * from './http';",
      "export * from './handlers';",
      '',
    ].join('\n'),
  };
}
