import { faker } from '@faker-js/faker';
import { setupServer } from 'msw/node';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fake, mockHandler, type Schema, type Schemas } from './mock-runtime';

const schemas: Schemas = {
  Owner: { type: 'object', required: ['id'], properties: { id: { type: 'string', example: 'o-1' } } },
  Alias: { $ref: '#/components/schemas/Owner' },
  Cat: { type: 'object', required: ['meow'], properties: { meow: { type: 'boolean' } } },
  Dog: { type: 'object', required: ['bark'], properties: { bark: { type: 'boolean' } } },
  Tree: {
    type: 'object',
    required: ['children'],
    properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Tree' } } },
  },
};
const many = <T>(run: () => T, times = 40): T[] => Array.from({ length: times }, run);

describe('schema-faker runtime: fake()', () => {
  beforeEach(() => faker.seed(42));

  it('examples win: example, first of examples, const, enum', () => {
    const example = { a: [1] };
    const value = fake({ type: 'object', example }, schemas);
    expect(value).toEqual(example);
    expect(value).not.toBe(example); // a copy: tests may mutate it
    expect(fake({ type: 'string', examples: ['x', 'y'] }, schemas)).toBe('x');
    expect(fake({ const: 7 }, schemas)).toBe(7);
    expect(['a', 'b']).toContain(fake({ type: 'string', enum: ['a', 'b'] }, schemas));
  });

  it('is deterministic per seed', () => {
    const schema: Schema = { type: 'array', items: { $ref: '#/components/schemas/Tree' } };
    faker.seed(1);
    const first = fake(schema, schemas);
    faker.seed(1);
    expect(fake(schema, schemas)).toEqual(first);
  });

  it('resolves refs (also ref → ref) and fails on unknown ones', () => {
    expect(fake({ $ref: '#/components/schemas/Alias' }, schemas)).toMatchObject({ id: 'o-1' });
    expect(() => fake({ $ref: '#/components/schemas/Nope' }, schemas)).toThrow(
      'unknown $ref #/components/schemas/Nope',
    );
  });

  it('objects: required always, optional with example always, others sometimes, writeOnly never', () => {
    const schema: Schema = {
      type: 'object',
      required: ['id'],
      properties: {
        id: { type: 'integer' },
        named: { type: 'string', example: 'Ada' },
        maybe: { type: 'boolean' },
        secret: { type: 'string', writeOnly: true },
      },
    };
    const values = many(() => fake(schema, schemas) as Record<string, unknown>);
    for (const value of values) {
      expect(typeof value.id).toBe('number');
      expect(value.named).toBe('Ada');
      expect(value).not.toHaveProperty('secret');
    }
    expect(new Set(values.map((value) => 'maybe' in value))).toEqual(new Set([true, false]));
  });

  it('additionalProperties: one random key (schema or true), none next to properties', () => {
    const map = fake({ type: 'object', additionalProperties: { type: 'integer' } }, schemas) as Record<string, number>;
    expect(Object.keys(map)).toHaveLength(1);
    expect(typeof Object.values(map)[0]).toBe('number');
    expect(Object.keys(fake({ additionalProperties: true }, schemas) as object)).toHaveLength(1);
    const withProps = fake(
      { type: 'object', required: ['a'], properties: { a: { const: 1 } }, additionalProperties: true },
      schemas,
    );
    expect(withProps).toEqual({ a: 1 });
  });

  it('allOf merges properties and required', () => {
    const value = fake(
      { allOf: [{ $ref: '#/components/schemas/Owner' }, { required: ['n'], properties: { n: { const: 2 } } }] },
      schemas,
    );
    expect(value).toEqual({ id: 'o-1', n: 2 });
  });

  it('oneOf/anyOf pick a variant; a discriminator gets the mapping key or the schema name', () => {
    const mapped = many(() =>
      fake(
        {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
          discriminator: { propertyName: 'kind', mapping: { cat: '#/components/schemas/Cat' } },
        },
        schemas,
      ),
    ) as Record<string, unknown>[];
    for (const value of mapped) expect(value.kind).toBe('meow' in value ? 'cat' : 'Dog');
    expect(new Set(mapped.map((value) => value.kind))).toEqual(new Set(['cat', 'Dog']));
    const noMapping = fake(
      { oneOf: [{ $ref: '#/components/schemas/Cat' }], discriminator: { propertyName: 'kind' } },
      schemas,
    );
    expect(noMapping).toMatchObject({ kind: 'Cat' });
    expect(['s', 1]).toContain(fake({ anyOf: [{ const: 's' }, { const: 1 }] }, schemas));
    // discriminator without a ref variant / a non-object value: as is
    expect(fake({ oneOf: [{ const: 3 }], discriminator: { propertyName: 'kind' } }, schemas)).toBe(3);
    expect(fake({ oneOf: [{ $ref: '#/components/schemas/Owner' }] }, { ...schemas, Owner: { const: 'x' } })).toBe('x');
    expect(
      fake(
        { oneOf: [{ $ref: '#/components/schemas/Owner' }], discriminator: { propertyName: 'k' } },
        { ...schemas, Owner: { const: null } },
      ),
    ).toBeNull();
  });

  it('types: 3.1 type arrays without null, null only, untyped by shape, default string', () => {
    expect(typeof fake({ type: ['null', 'integer'] }, schemas)).toBe('number');
    expect(fake({ type: ['null'] }, schemas)).toBeNull();
    expect(Array.isArray(fake({ items: { type: 'boolean' } }, schemas))).toBe(true);
    expect(fake({ properties: {} }, schemas)).toEqual({});
    expect(typeof fake({}, schemas)).toBe('string');
    expect(typeof fake({ type: 'boolean' }, schemas)).toBe('boolean');
  });

  it('arrays: 1–10 items by default, minItems/maxItems, items default {}', () => {
    for (const value of many(() => fake({ type: 'array', items: { type: 'integer' } }, schemas) as unknown[])) {
      expect(value.length).toBeGreaterThanOrEqual(1);
      expect(value.length).toBeLessThanOrEqual(10);
    }
    expect(fake({ type: 'array', minItems: 3, maxItems: 3, items: { const: 0 } }, schemas)).toEqual([0, 0, 0]);
    expect((fake({ type: 'array', minItems: 12 }, schemas) as unknown[]).length).toBeGreaterThanOrEqual(12);
  });

  it('recursion stops at the depth limit: arrays at minItems, optional props dropped', () => {
    const deep = (node: { children: unknown[] }, depth = 0): number =>
      node.children.length ? Math.max(...node.children.map((child) => deep(child as never, depth + 1))) : depth;
    expect(deep(fake({ $ref: '#/components/schemas/Tree' }, schemas) as never)).toBeLessThanOrEqual(6);
    expect(
      fake(
        { type: 'object', properties: { o: { type: 'string', example: 'x' } }, additionalProperties: true },
        schemas,
        6,
      ),
    ).toEqual({});
    expect(fake({ type: 'object', additionalProperties: true }, schemas, 6)).toEqual({});
  });

  it('integers and numbers honour (exclusive) bounds and multipleOf', () => {
    for (const value of many(() => fake({ type: 'integer', minimum: 1, maximum: 3 }, schemas) as number)) {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(3);
    }
    // 3.0 boolean exclusive*
    expect(
      fake({ type: 'integer', minimum: 1, maximum: 3, exclusiveMinimum: true, exclusiveMaximum: true }, schemas),
    ).toBe(2);
    // 3.1 numeric exclusive*
    expect(fake({ type: 'integer', exclusiveMinimum: 1, exclusiveMaximum: 3 }, schemas)).toBe(2);
    expect((fake({ type: 'integer', minimum: 0, maximum: 100, multipleOf: 25 }, schemas) as number) % 25).toBe(0);
    const number = fake({ type: 'number', minimum: 1, maximum: 2 }, schemas) as number;
    expect(number).toBeGreaterThanOrEqual(1);
    expect(number).toBeLessThanOrEqual(2);
    expect(typeof fake({ type: 'number' }, schemas)).toBe('number');
    expect(typeof fake({ type: 'integer' }, schemas)).toBe('number');
  });

  it('strings: formats, pattern, length bounds, unknown format → alpha', () => {
    const format = (name: string) => fake({ type: 'string', format: name }, schemas) as string;
    expect(format('date-time')).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(format('date')).toMatch(/^\d{4}-\d\d-\d\d$/);
    expect(format('time')).toMatch(/^\d\d:\d\d:\d\d$/);
    expect(format('email')).toContain('@');
    expect(format('uuid')).toMatch(/^[0-9a-f-]{36}$/);
    expect(format('uri')).toMatch(/^https?:\/\//);
    expect(format('url')).toMatch(/^https?:\/\//);
    expect(format('hostname')).toContain('.');
    expect(format('ipv4')).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
    expect(format('ipv6')).toContain(':');
    expect(atob(format('byte'))).toHaveLength(12);
    expect(format('password').length).toBeGreaterThan(0);
    expect(format('unknown')).toMatch(/^[a-zA-Z]{10,20}$/);
    expect(fake({ type: 'string', pattern: '^ab[0-9]{3}$' }, schemas)).toMatch(/^ab[0-9]{3}$/);
    expect(fake({ type: 'string', minLength: 2, maxLength: 3 }, schemas)).toMatch(/^[a-zA-Z]{2,3}$/);
    expect(fake({ type: 'string', maxLength: 4 }, schemas)).toMatch(/^[a-zA-Z]{4}$/);
    expect(fake({ type: 'string', minLength: 30 }, schemas)).toMatch(/^[a-zA-Z]{30}$/);
  });
});

describe('schema-faker runtime: mockHandler()', () => {
  const server = setupServer();
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => server.close());

  it('json: generated per request, fixed override, resolver override', async () => {
    let calls = 0;
    const generate = () => ({ n: ++calls });
    server.use(mockHandler('get', 'http://api.test/a', 200, 'json', generate));
    expect(await (await fetch('http://api.test/a')).json()).toEqual({ n: 1 });
    expect(await (await fetch('http://api.test/a')).json()).toEqual({ n: 2 });
    server.use(mockHandler('get', 'http://api.test/b', 201, 'json', generate, { n: 0 }));
    const fixed = await fetch('http://api.test/b');
    expect([fixed.status, await fixed.json()]).toEqual([201, { n: 0 }]);
    server.use(
      mockHandler('post', 'http://api.test/c/:id', 200, 'json', generate, async ({ params }) => ({
        n: Number(params.id),
      })),
    );
    expect(await (await fetch('http://api.test/c/9', { method: 'POST' })).json()).toEqual({ n: 9 });
  });

  it('text and empty bodies', async () => {
    server.use(mockHandler('get', 'http://api.test/t', 200, 'text', () => 'hi'));
    expect(await (await fetch('http://api.test/t')).text()).toBe('hi');
    let seen = '';
    server.use(
      mockHandler(
        'delete',
        'http://api.test/e',
        204,
        'empty',
        () => undefined,
        ({ request }) => {
          seen = request.method;
        },
      ),
    );
    const empty = await fetch('http://api.test/e', { method: 'DELETE' });
    expect([empty.status, await empty.text(), seen]).toEqual([204, '', 'DELETE']);
  });
});
