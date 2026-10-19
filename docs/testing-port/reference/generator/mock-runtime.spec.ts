import { faker } from '@faker-js/faker';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { configureFakeData, fake, MOCK_REF_DATE, mockHandler, type Schema, type Schemas } from './mock-runtime';

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
/** Values are stable per key: variety comes from different keys (like different operations). */
const many = <T>(run: (key: string) => T, times = 40): T[] => Array.from({ length: times }, (_, i) => run(`k${i}`));
/** `schema` as the required property of `levels` nested objects (to reach the depth limit). */
const nest = (schema: Schema, levels: number): Schema =>
  levels ? { type: 'object', required: ['n'], properties: { n: nest(schema, levels - 1) } } : schema;
const dig = (value: unknown, levels: number): unknown =>
  levels ? dig((value as { n: unknown }).n, levels - 1) : value;

describe('schema-faker runtime: fake() data rules', () => {
  it('examples win: example, first of examples, const, enum', () => {
    const example = { a: [1] };
    const value = fake({ type: 'object', example }, schemas);
    expect(value).toEqual(example);
    expect(value).not.toBe(example); // a copy: tests may mutate it
    expect(fake({ type: 'string', examples: ['x', 'y'] }, schemas)).toBe('x');
    expect(fake({ const: 7 }, schemas)).toBe(7);
    expect(new Set(many((key) => fake({ type: 'string', enum: ['a', 'b'] }, schemas, key)))).toEqual(
      new Set(['a', 'b']),
    );
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
    const values = many((key) => fake(schema, schemas, key) as Record<string, unknown>);
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
    const mapped = many((key) =>
      fake(
        {
          oneOf: [{ $ref: '#/components/schemas/Cat' }, { $ref: '#/components/schemas/Dog' }],
          discriminator: { propertyName: 'kind', mapping: { cat: '#/components/schemas/Cat' } },
        },
        schemas,
        key,
      ),
    ) as Record<string, unknown>[];
    for (const value of mapped) expect(value.kind).toBe('meow' in value ? 'cat' : 'Dog');
    expect(new Set(mapped.map((value) => value.kind))).toEqual(new Set(['cat', 'Dog']));
    const noMapping = fake(
      { oneOf: [{ $ref: '#/components/schemas/Cat' }], discriminator: { propertyName: 'kind' } },
      schemas,
    );
    expect(noMapping).toMatchObject({ kind: 'Cat' });
    expect(new Set(many((key) => fake({ anyOf: [{ const: 's' }, { const: 1 }] }, schemas, key)))).toEqual(
      new Set(['s', 1]),
    );
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
    expect(new Set(many((key) => fake({ type: 'boolean' }, schemas, key)))).toEqual(new Set([true, false]));
  });

  it('arrays: 1–10 items by default, minItems/maxItems, items default {}', () => {
    const lengths = many(
      (key) => (fake({ type: 'array', items: { type: 'integer' } }, schemas, key) as unknown[]).length,
    );
    for (const length of lengths) {
      expect(length).toBeGreaterThanOrEqual(1);
      expect(length).toBeLessThanOrEqual(10);
    }
    expect(new Set(lengths).size).toBeGreaterThan(1);
    expect(fake({ type: 'array', minItems: 3, maxItems: 3, items: { const: 0 } }, schemas)).toEqual([0, 0, 0]);
    expect((fake({ type: 'array', minItems: 12 }, schemas) as unknown[]).length).toBeGreaterThanOrEqual(12);
  });

  it('recursion stops at the depth limit: arrays at minItems, optional props dropped', () => {
    const deep = (node: { children: unknown[] }, depth = 0): number =>
      node.children.length ? Math.max(...node.children.map((child) => deep(child as never, depth + 1))) : depth;
    expect(deep(fake({ $ref: '#/components/schemas/Tree' }, schemas) as never)).toBeLessThanOrEqual(6);
    const optional: Schema = {
      type: 'object',
      properties: { o: { type: 'string', example: 'x' } },
      additionalProperties: true,
    };
    expect(dig(fake(nest(optional, 6), schemas), 6)).toEqual({});
    expect(dig(fake(nest({ type: 'object', additionalProperties: true }, 6), schemas), 6)).toEqual({});
  });

  it('integers and numbers honour (exclusive) bounds and multipleOf', () => {
    for (const value of many((key) => fake({ type: 'integer', minimum: 1, maximum: 3 }, schemas, key) as number)) {
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

describe('schema-faker runtime: fake() values change only with the spec', () => {
  const pet: Schema = {
    type: 'object',
    required: ['id', 'name', 'born', 'tags', 'status'],
    properties: {
      id: { type: 'integer', minimum: 1 },
      name: { type: 'string', maxLength: 12 },
      born: { type: 'string', format: 'date-time' },
      tags: { type: 'array', items: { type: 'string', format: 'uuid' } },
      status: { type: 'string', enum: ['available', 'pending', 'sold'] },
      nick: { type: 'string' },
    },
  };
  const props = (changes: Record<string, Schema | undefined>, base: Schema = pet): Schema => ({
    ...base,
    properties: Object.fromEntries(
      Object.entries({ ...base.properties, ...changes }).filter((entry): entry is [string, Schema] => !!entry[1]),
    ),
  });
  type Pet = Record<string, unknown>;
  const fakePet = (schema: Schema = pet, all: Schemas = schemas, key = 'GetPet') => fake(schema, all, key) as Pet;
  const omit = (value: Pet, ...keys: string[]) =>
    Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));

  afterEach(() => {
    vi.useRealTimers();
    configureFakeData();
  });

  it('same value on every call, independent of the global faker state', () => {
    const first = fakePet();
    faker.seed(1);
    faker.number.int();
    expect(fakePet()).toEqual(first);
    faker.seed(999);
    faker.string.alpha(50);
    expect(fakePet()).toEqual(first);
  });

  it('same value on any day: dates relative to the fixed reference date (UTC), not now', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2020-03-01T12:00:00Z'));
    const then = fakePet();
    vi.setSystemTime(new Date('2035-11-30T23:59:59Z'));
    expect(fakePet()).toEqual(then);
    const born = Date.parse(then.born as string);
    expect(MOCK_REF_DATE).toBe('2026-01-01T00:00:00.000Z');
    expect(born).toBeLessThan(Date.parse(MOCK_REF_DATE));
    expect(born).toBeGreaterThanOrEqual(Date.parse('2025-01-01T00:00:00.000Z'));
  });

  it('the reference date is configurable (and resets to MOCK_REF_DATE)', () => {
    const born = fakePet().born as string;
    configureFakeData({ refDate: '2030-06-01T00:00:00.000Z' });
    const later = fakePet();
    expect(Date.parse(later.born as string)).toBeGreaterThanOrEqual(Date.parse('2029-06-01T00:00:00.000Z'));
    expect(omit(later, 'born')).toEqual(omit(fakePet(), 'born'));
    configureFakeData({ refDate: new Date('2030-06-01T00:00:00.000Z') });
    expect(fakePet()).toEqual(later);
    configureFakeData();
    expect(fakePet().born).toBe(born);
  });

  it('call order and other keys (operations) do not matter', () => {
    const owner: Schema = { type: 'object', required: ['n'], properties: { n: { type: 'string' } } };
    const petFirst = [fakePet(), fake(owner, schemas, 'GetOwner')];
    const ownerFirst = [fake(owner, schemas, 'GetOwner'), fakePet()].reverse();
    expect(ownerFirst).toEqual(petFirst);
    expect(fakePet(pet, schemas, 'ListPets')).not.toEqual(petFirst[0]); // another place → other values
  });

  it('adding/removing a property or reordering properties leaves the other values unchanged', () => {
    const before = fakePet();
    const added = fakePet(props({ age: { type: 'integer' }, color: { type: 'string' } }));
    expect(omit(added, 'age', 'color')).toEqual(before);
    expect(fakePet(props({ name: undefined }))).toEqual(omit(before, 'name'));
    const reversed: Schema = { ...pet, properties: Object.fromEntries(Object.entries(pet.properties ?? {}).reverse()) };
    expect(fakePet(reversed)).toEqual(before);
  });

  it('unrelated component schemas and doc keys do not matter', () => {
    const before = fakePet();
    expect(fakePet(pet, { ...schemas, Unrelated: { type: 'string' }, Owner: { type: 'integer' } })).toEqual(before);
    const name = { type: 'string', maxLength: 12, description: 'the name', title: 'Name' } as Schema; // doc keys
    const documented = props({ name });
    expect(fakePet(documented)).toEqual(before);
  });

  it('a field changes when ITS schema changes — and only that field', () => {
    const before = fakePet();
    const changes: Record<string, Schema> = {
      name: { type: 'string', maxLength: 13 },
      born: { type: 'string', format: 'date' },
      id: { type: 'integer', minimum: 2 },
      status: { type: 'string', enum: ['available', 'pending', 'sold', 'lost'] },
    };
    for (const [field, schema] of Object.entries(changes)) {
      const after = fakePet(props({ [field]: schema }));
      expect(after[field], field).not.toEqual(before[field]);
      expect(omit(after, field), field).toEqual(omit(before, field));
    }
  });

  it('enum and oneOf order, 3.1 null types and moving a schema into a component/allOf do not matter', () => {
    const before = fakePet();
    expect(fakePet(props({ status: { type: 'string', enum: ['sold', 'available', 'pending'] } }))).toEqual(before);
    expect(fakePet(props({ name: { type: ['string', 'null'], maxLength: 12 } }))).toEqual(before);
    const viaRef = fakePet(props({ name: { $ref: '#/components/schemas/Name' } }), {
      ...schemas,
      Name: { type: 'string', maxLength: 12 },
    });
    expect(viaRef).toEqual(before);
    const { nick, tags } = pet.properties ?? {};
    expect(fakePet({ allOf: [props({ nick: undefined, tags: undefined }), { properties: { nick, tags } }] })).toEqual(
      before,
    );
    const variants = (oneOf: Schema[]) => many((key) => fake({ oneOf }, schemas, key));
    const cat = { $ref: '#/components/schemas/Cat' };
    const dog = { $ref: '#/components/schemas/Dog' };
    expect(variants([dog, cat])).toEqual(variants([cat, dog]));
  });

  it('arrays: items keyed by index — a new length keeps the existing items, a new item field keeps the length', () => {
    const list: Schema = { type: 'array', minItems: 2, maxItems: 4, items: pet };
    const before = fake(list, schemas, 'ListPets') as Pet[];
    const longer = fake({ ...list, minItems: 6, maxItems: 8 }, schemas, 'ListPets') as Pet[];
    expect(longer.length).toBeGreaterThan(before.length);
    expect(longer.slice(0, before.length)).toEqual(before);
    const richer = fake({ ...list, items: props({ age: { type: 'integer' } }) }, schemas, 'ListPets') as Pet[];
    expect(richer.map((item) => omit(item, 'age'))).toEqual(before);
    expect(new Set(before.map((item) => item.id)).size).toBe(before.length); // items differ from each other
  });

  it('pins the values of one schema (changes only with the spec — or a deliberate faker upgrade)', () => {
    expect(fakePet()).toMatchInlineSnapshot(`
      {
        "born": "2025-12-15T14:09:32.456Z",
        "id": 902189,
        "name": "JHaZgqUHDItI",
        "status": "sold",
        "tags": [
          "59718960-2859-4e3d-859b-2bb3e5baf352",
          "6e8284ed-b31e-4fd7-86d0-4ef2918ce2dd",
          "756a2f55-a982-4953-a673-99ee5dfb9c32",
          "b6a69e4a-0094-418a-9aad-e62defcef2d7",
          "cf6fd3f6-86b6-4a26-9a36-d17b097961a2",
          "53c4d238-d5b7-4373-897f-c3491243467e",
          "e7b50fb6-7439-4433-8a02-a892bd3e826a",
          "411173a1-2096-439a-ab87-9f9178153b2b",
        ],
      }
    `);
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
