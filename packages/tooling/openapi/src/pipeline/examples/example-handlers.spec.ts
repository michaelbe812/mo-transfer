import { describe, expect, it } from 'vitest';
import { collectOperations, generateExampleHandlers, responseBody } from './example-handlers';
import { EXAMPLE_DATE, exampleValue } from './example-value';

type Json = Record<string, unknown>;

const ok = (schema: Json = { type: 'string' }, media: Json = {}): Json => ({
  responses: { '200': { description: 'ok', content: { 'application/json': { schema, ...media } } } },
});

describe('exampleValue', () => {
  const document: Json = {
    components: {
      schemas: {
        Pet: {
          type: 'object',
          required: ['id', 'name', 'status', 'born', 'tags'],
          properties: {
            id: { type: 'integer', minimum: 10, multipleOf: 4 },
            name: { type: 'string', example: 'doggie' },
            status: { type: 'string', enum: ['sold', 'available'] },
            born: { type: 'string', format: 'date' },
            tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } },
            nickname: { type: 'string' },
            motto: { type: 'string', example: 'woof' },
            secret: { type: 'string', writeOnly: true },
          },
        },
        Tag: { type: 'object', required: ['label'], properties: { label: { type: 'string', minLength: 8 } } },
        Tree: { type: 'object', required: ['children'], properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } } },
      },
    },
  };

  it('examples first, then enum/format/bounds placeholders; required + optional with example, never writeOnly', () => {
    expect(exampleValue(document, { $ref: '#/components/schemas/Pet' })).toEqual({
      id: 12,
      name: 'doggie',
      status: 'sold',
      born: EXAMPLE_DATE.slice(0, 10),
      tags: [{ label: 'labelxxx' }],
      motto: 'woof',
    });
  });

  it('example/examples/const/default win; same input → same value', () => {
    expect(exampleValue(document, { type: 'string', example: 'a', default: 'b' })).toBe('a');
    expect(exampleValue(document, { type: 'string', examples: ['c'] })).toBe('c');
    expect(exampleValue(document, { const: 3 })).toBe(3);
    expect(exampleValue(document, { type: 'boolean', default: true })).toBe(true);
    expect(exampleValue(document, { $ref: '#/components/schemas/Pet' })).toEqual(exampleValue(document, { $ref: '#/components/schemas/Pet' }));
  });

  it('types and formats: fixed placeholders', () => {
    expect(exampleValue(document, { type: 'boolean' })).toBe(false);
    expect(exampleValue(document, { type: 'number', exclusiveMinimum: 1 })).toBe(1.01);
    expect(exampleValue(document, { type: 'integer', minimum: 1, exclusiveMinimum: true })).toBe(2);
    expect(exampleValue(document, { type: 'integer', minimum: 5, maximum: 3 })).toBe(3);
    expect(exampleValue(document, { type: 'string', format: 'date-time' })).toBe(EXAMPLE_DATE);
    expect(exampleValue(document, { type: 'string', format: 'uuid' })).toBe('00000000-0000-0000-0000-000000000000');
    expect(exampleValue(document, { type: 'string', maxLength: 2 }, 'title')).toBe('ti');
    expect(exampleValue(document, { type: 'null' })).toBeNull();
    expect(exampleValue(document, { type: ['string', 'null'] }, 'x')).toBe('x');
    expect(exampleValue(document, { type: 'array', items: { type: 'integer' }, minItems: 2 })).toEqual([0, 0]);
    expect(exampleValue(document, { type: 'array', items: { type: 'integer' }, maxItems: 0 })).toEqual([]);
    expect(exampleValue(document, { type: 'object', additionalProperties: { type: 'string' } })).toEqual({});
  });

  it('allOf merged, oneOf → first variant with discriminator mapping, recursion stops', () => {
    const doc: Json = {
      components: {
        schemas: {
          Cat: { type: 'object', required: ['kind', 'lives'], properties: { kind: { type: 'string' }, lives: { type: 'integer', example: 9 } } },
          Dog: { type: 'object', required: ['kind'], properties: { kind: { type: 'string' } } },
          ...(document.components as Json & { schemas: Json }).schemas,
        },
      },
    };
    expect(exampleValue(doc, { allOf: [{ $ref: '#/components/schemas/Dog' }, { type: 'object', required: ['age'], properties: { age: { type: 'integer' } } }] })).toEqual({ kind: 'kind', age: 0 });
    expect(
      exampleValue(doc, {
        oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
        discriminator: { propertyName: 'kind', mapping: { cat: '#/components/schemas/Cat' } },
      }),
    ).toEqual({ kind: 'cat', lives: 9 });
    expect(exampleValue(doc, { oneOf: [{ $ref: '#/components/schemas/Dog' }], discriminator: { propertyName: 'kind' } })).toEqual({ kind: 'Dog' });
    expect(exampleValue(doc, { anyOf: [{ type: 'integer' }, { type: 'string' }] })).toBe(0);
    expect(JSON.stringify(exampleValue(doc, { $ref: '#/components/schemas/Tree' }))).toBe('{"children":[{"children":[{"children":[{"children":[]}]}]}]}');
  });

  it('refs: only local, must resolve', () => {
    expect(() => exampleValue(document, { $ref: 'other.yaml#/X' })).toThrow('unsupported $ref other.yaml#/X (only local refs)');
    expect(() => exampleValue(document, { $ref: '#/components/schemas/Nope' })).toThrow('unresolved $ref #/components/schemas/Nope');
  });
});

describe('generateExampleHandlers', () => {
  const document: Json = {
    paths: {
      '/pets/{id}': { get: { operationId: 'getPet', ...ok({ type: 'object', required: ['id'], properties: { id: { type: 'integer' } } }) } },
      '/pets': {
        get: ok({ type: 'array', items: { type: 'string' } }, { examples: { first: { $ref: '#/components/examples/Pets' } } }),
        post: { responses: { '201': { description: 'created', content: { 'application/json': { schema: { type: 'string' }, example: 'p-1' } } } } },
        delete: { responses: { '204': { description: 'gone' } } },
      },
      '/ping': { get: { responses: { '200': { description: 'ok', content: { 'text/plain': { schema: { type: 'string', example: 'pong' } } } } } } },
      '/fallback': { get: { responses: { default: { $ref: '#/components/responses/Any' } } } },
      '/xml': { get: { responses: { '200': { description: 'ok', content: { 'application/xml': { schema: { type: 'string' } } } } } } },
      '/nothing': { head: {} },
    },
    components: {
      examples: { Pets: { value: ['rex', 'fido'] } },
      responses: { Any: { description: 'any', content: { 'application/json': { schema: { type: 'boolean' } } } } },
    },
  };

  it('one typed handler per operation on <client>Http, static paths first, bodies inline', () => {
    const { 'handlers.ts': handlers } = generateExampleHandlers({ document, name: 'xClient' });
    expect(handlers.split('\n')).toEqual([
      "import { http, type HttpHandler, HttpResponse } from 'msw';",
      "import { xClientBaseUrl, xClientHttp } from './http';",
      '',
      '/** Default handlers: every operation answers its success status with the spec examples (fixed placeholders for the rest). */',
      'export const xClientHandlers: HttpHandler[] = [',
      '  // GetPets: GET /pets → 200',
      '  xClientHttp.get("/pets", ({ response }) => response(200).json(["rex","fido"])),',
      '  // PostPets: POST /pets → 201',
      '  xClientHttp.post("/pets", ({ response }) => response(201).json("p-1")),',
      '  // DeletePets: DELETE /pets → 204',
      '  xClientHttp.delete("/pets", ({ response }) => response(204).empty()),',
      '  // GetPing: GET /ping → 200',
      '  xClientHttp.get("/ping", ({ response }) => response(200).text("pong")),',
      '  // GetFallback: GET /fallback → 200',
      '  xClientHttp.get("/fallback", ({ response }) => response("default").json(false, { status: 200 })),',
      '  // GetXml: GET /xml → 200',
      '  xClientHttp.get("/xml", ({ response }) => response(200).empty()),',
      '  // HeadNothing: HEAD /nothing → 200, no documented response',
      '  http.head(`${xClientBaseUrl}/nothing`, () => new HttpResponse(null, { status: 200 })),',
      '  // GetPet: GET /pets/{id} → 200',
      '  xClientHttp.get("/pets/{id}", ({ response }) => response(200).json({"id":0})),',
      '];',
      '',
    ]);
  });

  it('index: schema types, http, handlers — no factories, no runtime', () => {
    const files = generateExampleHandlers({ document, name: 'xClient' });
    expect(Object.keys(files)).toEqual(['handlers.ts', 'index.ts']);
    expect(files['index.ts']).toBe(["export type { components, operations, paths } from './schema';", "export * from './http';", "export * from './handlers';", ''].join('\n'));
  });

  it('only typed or no operations: imports what is used; wildcard empty body', () => {
    const typed = generateExampleHandlers({ document: { paths: { '/a': { get: { responses: { '2XX': { description: 'ok' } } } } } }, name: 'a' })['handlers.ts'];
    expect(typed).toContain("import type { HttpHandler } from 'msw';\nimport { aHttp } from './http';");
    expect(typed).toContain('aHttp.get("/a", ({ response }) => response("2XX").empty({ status: 200 })),');
    const empty = generateExampleHandlers({ document: {}, name: 'e' })['handlers.ts'];
    expect(empty).not.toContain("from './http'");
    expect(empty).toContain('export const eHandlers: HttpHandler[] = [\n];');
  });

  it('collectOperations / responseBody: lowest 2xx, media example over schema', () => {
    const operations = collectOperations({ paths: { '/x': { get: { responses: { '202': {}, '201': {}, '400': {} } } } } });
    expect(operations).toMatchObject([{ name: 'GetX', status: 201, code: '201', media: undefined }]);
    const [op] = collectOperations({ paths: { '/y': { get: ok({ type: 'integer' }, { example: 5 }) } } });
    expect(responseBody({}, op)).toBe(5);
  });
});
