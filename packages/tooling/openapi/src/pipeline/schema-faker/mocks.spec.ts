/**
 * schema-faker generator on synthetic documents: operation selection, media/status rules, ref handling,
 * emitted names. End-to-end (tsc + msw) in test/integration/testing.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { collectOperations, generateSchemaFakerMocks } from './mocks';

const ok = (content?: Record<string, unknown>) => ({ responses: { '200': { description: 'ok', content } } });
const json = (schema: unknown, extra: Record<string, unknown> = {}) => ({ 'application/json': { schema, ...extra } });
const generate = (document: Record<string, unknown>) =>
  generateSchemaFakerMocks({ document, name: 'xClient', specPath: 'spec.yaml' });

describe('schema-faker: collectOperations', () => {
  it('static paths before templated ones, names from operationId or method + path', () => {
    const operations = collectOperations({
      paths: {
        '/a/{id}': { get: { operationId: 'get-a', ...ok() }, parameters: [] },
        '/a/b': { post: ok(), get: { operationId: 'listB', ...ok() } },
        '/none': null,
      },
    });
    expect(operations.map((op: { name: string; method: string }) => `${op.method} ${op.name}`)).toEqual([
      'get ListB',
      'post PostAB',
      'get GetA',
    ]);
  });

  it('status: 200, else lowest 2xx, else 2XX/default (as 200), else 200 without code', () => {
    const status = (responses: Record<string, unknown>) =>
      collectOperations({ paths: { '/x': { get: { responses } } } }).map((op: { status: number; code?: string }) => [
        op.status,
        op.code,
      ])[0];
    expect(status({ '201': {}, '200': {}, '404': {} })).toEqual([200, '200']);
    expect(status({ '204': {}, '201': {} })).toEqual([201, '201']);
    expect(status({ '2XX': {}, '400': {} })).toEqual([200, '2XX']);
    expect(status({ default: {} })).toEqual([200, 'default']);
    expect(status({ '404': {} })).toEqual([200, undefined]);
    expect(collectOperations({ paths: { '/x': { get: {} } } })[0].status).toBe(200);
  });

  it('media: json (+json, */*) first, else text/*, else no body; response refs resolved', () => {
    const media = (content: Record<string, unknown>) =>
      collectOperations({ paths: { '/x': { get: ok(content) } } })[0].media;
    expect(media({ 'application/xml': {}, 'application/json; charset=utf-8': {} })).toEqual({
      type: 'application/json; charset=utf-8',
      kind: 'json',
    });
    expect(media({ 'application/problem+json': {} })?.kind).toBe('json');
    expect(media({ '*/*': {} })?.kind).toBe('json');
    expect(media({ 'text/plain': {} })).toEqual({ type: 'text/plain', kind: 'text' });
    expect(media({ 'application/octet-stream': {} })).toBeUndefined();
    const [viaRef] = collectOperations({
      paths: { '/x': { get: { responses: { '200': { $ref: '#/components/responses/Ok' } } } } },
      components: { responses: { Ok: { $ref: '#/components/responses/Real' }, Real: { content: json({}) } } },
    });
    expect(viaRef.media?.kind).toBe('json');
  });

  it('fails on external or unresolved response refs', () => {
    const withRef = ($ref: string) => ({ paths: { '/x': { get: { responses: { '200': { $ref } } } } } });
    expect(() => collectOperations(withRef('other.yaml#/X'))).toThrow('unsupported $ref other.yaml#/X');
    expect(() => collectOperations(withRef('#/components/responses/a~1b~0c'))).toThrow(
      'unresolved $ref #/components/responses/a~1b~0c',
    );
  });
});

describe('schema-faker: generateSchemaFakerMocks', () => {
  const document = {
    paths: {
      '/pets': {
        get: { operationId: 'listPets', ...ok(json({ type: 'array', items: { $ref: '#/components/schemas/Pet' } })) },
        post: {
          operationId: 'addPet',
          responses: { '201': { content: json({ $ref: '#/components/schemas/Pet' }, { example: { id: 1 } }) } },
        },
      },
      '/pets/{id}': {
        delete: { operationId: 'deletePet', responses: { '204': { description: 'gone' } } },
        get: {
          operationId: 'getPet',
          ...ok(json({ $ref: '#/components/schemas/Pet' }, { examples: { a: { $ref: '#/components/examples/A' } } })),
        },
      },
      '/ping': { get: { operationId: 'ping', ...ok({ 'text/plain': { schema: { type: 'string' } } }) } },
      '/union': { get: { operationId: 'union', ...ok(json({ allOf: [{ type: 'string' }, { type: 'object' }] })) } },
      '/empty-examples': { get: { operationId: 'emptyExamples', ...ok(json({ type: 'integer' }, { examples: {} })) } },
    },
    components: {
      examples: { A: { value: { id: 7 } } },
      schemas: {
        Pet: {
          type: 'object',
          description: 'pet-description',
          xml: { name: 'pet' },
          required: ['id'],
          properties: {
            id: { type: 'integer', example: 3 },
            tag: { $ref: '#/components/schemas/Tag' },
            parent: { $ref: '#/components/schemas/Pet' },
          },
        },
        Tag: { type: ['string', 'null'], examples: ['t'] },
        Unused: { type: 'string' },
        'bad-name': { type: 'string' },
      },
    },
  };
  const files = generate(document);

  it('writes runtime, mocks, model, handlers, index', () => {
    expect(Object.keys(files)).toEqual(['mock-runtime.ts', 'mocks.ts', 'model.ts', 'handlers.ts', 'index.ts']);
    expect(files['mock-runtime.ts']).toContain('export function fake(');
    expect(files['index.ts']).toContain("export type * from './model';");
  });

  it('mocks: typed from paths, examples embedded, msw paths with params, object overrides', () => {
    const mocks = files['mocks.ts'];
    expect(mocks).toContain(
      `type ListPetsResponse = paths["/pets"]["get"]['responses']["200"]['content']["application/json"];`,
    );
    expect(mocks).toContain('mockHandler("post", "*/pets", 201, "json", () => getAddPetResponseMock()');
    // the operation name keys the fake data: stable per operation, independent of the others
    expect(mocks).toContain('fake({"$ref":"#/components/schemas/Pet","example":{"id":1}}, schemas, "AddPet")');
    expect(mocks).toContain('fake({"$ref":"#/components/schemas/Pet","example":{"id":7}}, schemas, "GetPet")');
    expect(mocks).toContain('fake({"type":"array","items":{"$ref":"#/components/schemas/Pet"}}, schemas, "ListPets")');
    expect(mocks).toContain('getGetPetResponseMock = (overrideResponse: Partial<GetPetResponse> = {})');
    expect(mocks).toContain('getListPetsResponseMock = (): ListPetsResponse =>');
    expect(mocks).toContain('getUnionResponseMock = (overrideResponse: Partial<UnionResponse>');
    expect(mocks).toContain('getEmptyExamplesResponseMock = (): EmptyExamplesResponse => fake({"type":"integer"}');
    // reference date of the date formats, configurable for all clients at once
    expect(mocks).toContain("export { configureFakeData, MOCK_REF_DATE } from './mock-runtime';");
    expect(mocks).toContain('mockHandler("get", "*/ping", 200, "text"');
    expect(mocks).toContain(
      'getDeletePetMockHandler = (overrideResponse?: MockOverride<void>, options?: RequestHandlerOptions): HttpHandler =>',
    );
    expect(mocks).toContain('mockHandler("delete", "*/pets/:id", 204, \'empty\'');
    // only reachable schemas, doc keys dropped
    expect(mocks).toContain('"Pet": {');
    expect(mocks).toContain('"Tag": {');
    expect(mocks).not.toContain('"Unused"');
    expect(mocks).not.toContain('pet-description');
    expect(mocks).not.toContain('"xml"');
  });

  it('model: component types with valid identifiers; handlers: all operations in order', () => {
    expect(files['model.ts']).toContain(`export type Pet = components['schemas']["Pet"];`);
    expect(files['model.ts']).not.toContain('bad-name');
    expect(files['handlers.ts']).toContain(
      'export const xClientHandlers: HttpHandler[] = [\n  getListPetsMockHandler(),',
    );
    expect(generate({ paths: { '/x': { get: ok() } } })['model.ts']).toContain('export {};');
  });

  it('errors: no operations, foreign schema refs, missing components', () => {
    expect(() => generate({ paths: {} })).toThrow('spec.yaml: no operations, no msw handlers');
    expect(() => generate({})).toThrow('no operations');
    expect(() => generate({ paths: { '/x': { get: ok(json({ $ref: '#/components/responses/X' })) } } })).toThrow(
      'unsupported schema $ref #/components/responses/X',
    );
    expect(() => generate({ paths: { '/x': { get: ok(json({ $ref: '#/components/schemas/Nope' })) } } })).toThrow(
      'unresolved $ref #/components/schemas/Nope',
    );
    expect(() =>
      generate({
        paths: { '/x': { get: ok(json({ $ref: '#/components/schemas/A' })) } },
        components: { schemas: { A: { $ref: '#/components/schemas/B' } } },
      }),
    ).toThrow('unresolved $ref #/components/schemas/B');
  });

  it('a media type without schema fakes {}', () => {
    expect(generate({ paths: { '/x': { get: ok({ 'application/json': {} }) } } })['mocks.ts']).toContain(
      'fake({}, schemas, "GetX")',
    );
  });
});
