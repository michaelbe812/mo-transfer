/**
 * Runtime of the `schema-faker` mocks engine (copied verbatim into every testing lib as `mock-runtime.ts`,
 * never compiled into the tooling package): fake data from the JSON Schemas of the spec (spec examples first,
 * faker for the rest) and one msw handler factory. Browser-safe: imports only @faker-js/faker and msw, the
 * testing lib's own test dependencies. The generator (../mocks.ts) emits the schemas as data plus thin typed
 * wrappers per operation. Why a copy and not an import: docs/openapi-pipeline-architektur.md → schema-faker.
 *
 * Stable values: every random decision (a leaf value, optional-property presence, array length, oneOf/anyOf
 * variant, additionalProperties key) reseeds a private faker instance (locale en, Mersenne 53 randomizer) with a
 * 64-bit hash of its identity: key (the operation) + instance path (`/[2]/tags/[0]`) + purpose + fingerprint of
 * the node's own value-relevant keywords (sorted; no doc keys, no children). A value changes only when its own
 * place or schema changes — never with the date, call order, other operations, other properties or the global
 * `faker` state. Dates are relative to a fixed reference date (MOCK_REF_DATE, UTC).
 */
import { base, en, Faker, generateMersenne53Randomizer } from '@faker-js/faker';
import { http, type HttpHandler, HttpResponse, type HttpResponseResolver, type RequestHandlerOptions } from 'msw';

/** JSON Schema subset of OpenAPI 3.0/3.1 the generator understands (refs only to `#/components/schemas/*`). */
export interface Schema {
  $ref?: string;
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  example?: unknown;
  examples?: unknown[];
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  discriminator?: { propertyName: string; mapping?: Record<string, string> };
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean | Schema;
  items?: Schema;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean | number;
  exclusiveMaximum?: boolean | number;
  multipleOf?: number;
  writeOnly?: boolean;
}

/** `components.schemas` of the spec (only the ones reachable from responses). */
export type Schemas = Record<string, Schema>;

const REF_PREFIX = '#/components/schemas/';
/** Recursive schemas (Tree → children: Tree[]) stop here: optional props dropped, arrays at minItems. */
const MAX_DEPTH = 6;
/** orval's defaults: arrays 1–10 items, strings 10–20 chars. */
const DEFAULT_MAX_ITEMS = 10;
const DEFAULT_LENGTH = { min: 10, max: 20 };

/** Default reference date of the date formats (`date.past` = the year before it). */
export const MOCK_REF_DATE = '2026-01-01T00:00:00.000Z';

/** Shared by the runtime copies of all testing libs (one call configures every client). */
const CONFIG = Symbol.for('@mo-transfer/tooling-openapi/fake-data');
const store = globalThis as typeof globalThis & { [CONFIG]?: { refDate: Date } };
const config = (store[CONFIG] ??= { refDate: new Date(MOCK_REF_DATE) });

/** Another reference date for the date formats (e.g. in a `beforeEach`); no argument → MOCK_REF_DATE again. */
export function configureFakeData({ refDate = MOCK_REF_DATE }: { refDate?: string | Date } = {}): void {
  config.refDate = new Date(refDate);
}

/** Private instance: the global `faker` (and its seed) never influences mocks. Locale pinned to en. */
const mockFaker = new Faker({ locale: [en, base], randomizer: generateMersenne53Randomizer() });

/** cyrb53: 64-bit string hash as two 32-bit words (faker.seed takes number[]). */
function hash64(text: string): number[] {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

/** JSON with object keys sorted: the key order of the spec never matters. */
const stableJson = (value: unknown): string =>
  JSON.stringify(value, (_, node: unknown) =>
    node && typeof node === 'object' && !Array.isArray(node)
      ? Object.fromEntries(Object.entries(node).sort(([a], [b]) => (a < b ? -1 : 1)))
      : node,
  );

/** enum values / variants in a canonical order: reordering them in the spec never matters. */
const sortedByJson = <T>(values: T[]): T[] =>
  values
    .map((value) => [stableJson(value), value] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([, value]) => value);

/** Where a value sits: operation key + instance path; depth for the recursion limit. */
interface Context {
  schemas: Schemas;
  key: string;
  path: string;
  depth: number;
}

/** Child place: property names JSON-pointer escaped, array indices `[i]`, additionalProperties `*`. */
const child = (context: Context, segment: string): Context => ({
  ...context,
  path: `${context.path}/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`,
  depth: context.depth + 1,
});

/** The private faker, seeded for one decision (`purpose`) at this place. */
function seeded(context: Context, purpose: string, fingerprint: unknown = null): Faker {
  mockFaker.seed(hash64(`${context.key}\n${context.path}\n${purpose}\n${stableJson(fingerprint)}`));
  return mockFaker;
}

const resolve = (schema: Schema, schemas: Schemas): Schema => {
  if (!schema.$ref) return schema;
  const target = schemas[schema.$ref.slice(REF_PREFIX.length)];
  if (!target) throw new Error(`mock-runtime: unknown $ref ${schema.$ref}`);
  return resolve(target, schemas);
};

/** allOf → one schema: properties/required merged, the rest last-wins. */
const mergeAllOf = (schema: Schema, schemas: Schemas): Schema => {
  const { allOf = [], ...rest } = schema;
  return [...allOf.map((part) => flatten(resolve(part, schemas), schemas)), rest].reduce<Schema>(
    (merged, part) => ({
      ...merged,
      ...part,
      properties: { ...merged.properties, ...part.properties },
      required: [...(merged.required ?? []), ...(part.required ?? [])],
    }),
    {},
  );
};

const flatten = (schema: Schema, schemas: Schemas): Schema => (schema.allOf ? mergeAllOf(schema, schemas) : schema);

/** 3.0 `nullable` is ignored, 3.1 `type: [x, 'null']` → x: mocks are never null (like orval's defaults). */
const typeOf = (schema: Schema): string | undefined => {
  const types = Array.isArray(schema.type) ? schema.type.filter((type) => type !== 'null') : [schema.type];
  if (types[0]) return types[0];
  if (schema.properties || schema.additionalProperties) return 'object';
  if (schema.items) return 'array';
  return Array.isArray(schema.type) ? 'null' : undefined;
};

/** The leaf's own keywords that shape its value (normalized type, enum sorted) — no doc keys. */
const fingerprint = (schema: Schema): unknown => ({
  type: typeOf(schema),
  format: schema.format,
  enum: schema.enum && sortedByJson(schema.enum),
  minimum: schema.minimum,
  maximum: schema.maximum,
  exclusiveMinimum: schema.exclusiveMinimum,
  exclusiveMaximum: schema.exclusiveMaximum,
  multipleOf: schema.multipleOf,
  minLength: schema.minLength,
  maxLength: schema.maxLength,
  pattern: schema.pattern,
});

/**
 * A value for `schema`: `example` (or first of `examples`) as is, else `const`/`enum`, else faker by
 * type/format/bounds. Required properties always, optional ones with an example always, others 50 %.
 * `key` names the place (the generated mocks pass the operation name): same schema + key → same value.
 */
export function fake(schema: Schema, schemas: Schemas, key = ''): unknown {
  return generate(schema, { schemas, key, path: '', depth: 0 });
}

function generate(schema: Schema, context: Context): unknown {
  const resolved = flatten(resolve(schema, context.schemas), context.schemas);
  if (resolved.example !== undefined) return structuredClone(resolved.example);
  if (resolved.examples?.length) return structuredClone(resolved.examples[0]);
  if (resolved.const !== undefined) return structuredClone(resolved.const);
  if (resolved.enum?.length) {
    return seeded(context, 'value', fingerprint(resolved)).helpers.arrayElement(sortedByJson(resolved.enum));
  }
  const variants = resolved.oneOf ?? resolved.anyOf;
  if (variants?.length) return fakeVariant(resolved, variants, context);
  const type = typeOf(resolved);
  if (type === 'object') return fakeObject(resolved, context);
  if (type === 'array') return fakeArray(resolved, context);
  if (type === 'null') return null;
  const faker = seeded(context, 'value', fingerprint(resolved));
  if (type === 'integer') return fakeInteger(resolved, faker);
  if (type === 'number') return fakeNumber(resolved, faker);
  if (type === 'boolean') return faker.datatype.boolean();
  return fakeString(resolved, faker);
}

/** oneOf/anyOf: one variant (order-independent); with a discriminator its property gets the variant's mapping key. */
function fakeVariant(schema: Schema, variants: Schema[], context: Context): unknown {
  const variant = seeded(context, 'variant', variants.length).helpers.arrayElement(sortedByJson(variants));
  const { discriminator } = schema;
  const siblings: Schema = { ...schema, oneOf: undefined, anyOf: undefined, discriminator: undefined };
  const value = generate({ allOf: [siblings, variant] }, context);
  if (!discriminator || !variant.$ref || typeof value !== 'object' || value === null) return value;
  const mapped = Object.entries(discriminator.mapping ?? {}).find(([, ref]) => ref === variant.$ref)?.[0];
  return { ...value, [discriminator.propertyName]: mapped ?? variant.$ref.slice(REF_PREFIX.length) };
}

function fakeObject(schema: Schema, context: Context): Record<string, unknown> {
  const required = new Set(schema.required);
  const result: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const resolved = resolve(property, context.schemas);
    if (resolved.writeOnly) continue; // request-only, never in a response
    const place = child(context, key);
    const include =
      required.has(key) ||
      (context.depth < MAX_DEPTH && (resolved.example !== undefined || seeded(place, 'present').datatype.boolean()));
    if (include) result[key] = generate(property, place);
  }
  const extra = schema.additionalProperties;
  if (extra && !schema.properties && context.depth < MAX_DEPTH) {
    const name = seeded(context, 'key').string.alphanumeric(5);
    result[name] = generate(extra === true ? {} : extra, child(context, '*'));
  }
  return result;
}

/** Length from its own seed, items keyed by index: another length keeps the existing items. */
function fakeArray(schema: Schema, context: Context): unknown[] {
  const min = schema.minItems ?? (context.depth < MAX_DEPTH ? 1 : 0);
  const max = context.depth < MAX_DEPTH ? (schema.maxItems ?? Math.max(min, DEFAULT_MAX_ITEMS)) : min;
  const length = seeded(context, 'length', [min, max]).number.int({ min, max });
  return Array.from({ length }, (_, index) => generate(schema.items ?? {}, child(context, `[${index}]`)));
}

/** 3.0 boolean exclusive* and 3.1 numeric exclusive* → inclusive bounds (step = 1 for integers, tiny for numbers). */
function bounds(schema: Schema, step: number): { min?: number; max?: number } {
  const lower = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : schema.minimum;
  const upper = typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum : schema.maximum;
  const min = lower !== undefined && schema.exclusiveMinimum !== undefined ? lower + step : lower;
  const max = upper !== undefined && schema.exclusiveMaximum !== undefined ? upper - step : upper;
  return { min, max };
}

function fakeInteger(schema: Schema, faker: Faker): number {
  const { min = 0, max = min + 1_000_000 } = bounds(schema, 1);
  return faker.number.int({ min, max, multipleOf: schema.multipleOf ?? 1 });
}

function fakeNumber(schema: Schema, faker: Faker): number {
  const { min = 0, max = min + 1_000_000 } = bounds(schema, 0.01);
  return faker.number.float({ min, max, fractionDigits: 2 });
}

/** Dates: the year before the reference date, as UTC ISO strings (independent of now and of the time zone). */
const FORMATS: Record<string, (faker: Faker) => string> = {
  'date-time': (faker) => faker.date.past({ refDate: config.refDate }).toISOString(),
  date: (faker) => faker.date.past({ refDate: config.refDate }).toISOString().slice(0, 10),
  time: (faker) => faker.date.past({ refDate: config.refDate }).toISOString().slice(11, 19),
  email: (faker) => faker.internet.email(),
  uuid: (faker) => faker.string.uuid(),
  uri: (faker) => faker.internet.url(),
  url: (faker) => faker.internet.url(),
  hostname: (faker) => faker.internet.domainName(),
  ipv4: (faker) => faker.internet.ipv4(),
  ipv6: (faker) => faker.internet.ipv6(),
  byte: (faker) => btoa(faker.string.alpha(12)),
  password: (faker) => faker.internet.password(),
};

function fakeString(schema: Schema, faker: Faker): string {
  const byFormat = schema.format ? FORMATS[schema.format] : undefined;
  if (byFormat) return byFormat(faker);
  // fromRegExp would emit the anchors literally
  if (schema.pattern) return faker.helpers.fromRegExp(schema.pattern.replace(/^\^/, '').replace(/\$$/, ''));
  const min = schema.minLength ?? Math.min(DEFAULT_LENGTH.min, schema.maxLength ?? DEFAULT_LENGTH.min);
  const max = schema.maxLength ?? Math.max(min, DEFAULT_LENGTH.max);
  return faker.string.alpha({ length: { min, max } });
}

type ResolverInfo = Parameters<HttpResponseResolver>[0];
/** Fixed body, or a resolver per request (like orval's `get<Op>MockHandler(override)`). */
export type MockOverride<T> = T | ((info: ResolverInfo) => T | Promise<T>);
/** How the success response is sent: JSON, text, or no body (204, no content). */
export type BodyKind = 'json' | 'text' | 'empty';
type Method = 'get' | 'put' | 'post' | 'delete' | 'patch' | 'head' | 'options';

/** msw handler for one operation: the override, else a fresh `generate()` per request (same data each time). */
export function mockHandler<T>(
  method: Method,
  path: string,
  status: number,
  kind: BodyKind,
  generate: () => T,
  override?: MockOverride<T>,
  options?: RequestHandlerOptions,
): HttpHandler {
  return http[method](
    path,
    async (info) => {
      const body =
        typeof override === 'function'
          ? await (override as (info: ResolverInfo) => T | Promise<T>)(info)
          : (override ?? generate());
      if (kind === 'empty') return new HttpResponse(null, { status });
      if (kind === 'text') return HttpResponse.text(String(body), { status });
      return HttpResponse.json(body as never, { status });
    },
    options,
  );
}
