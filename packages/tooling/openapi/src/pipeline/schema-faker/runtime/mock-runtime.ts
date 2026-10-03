/**
 * Runtime of the `schema-faker` mocks engine (copied verbatim into every testing lib as `mock-runtime.ts`,
 * never compiled into the tooling package): fake data from the JSON Schemas of the spec (spec examples first,
 * faker for the rest) and one msw handler factory. Browser-safe: imports only @faker-js/faker and msw, the
 * testing lib's own test dependencies. The generator (../mocks.ts) emits the schemas as data plus thin typed
 * wrappers per operation. Why a copy and not an import: docs/openapi-pipeline-architektur.md → schema-faker.
 *
 * Determinism: only the shared `faker` instance draws (seeded per test by the `worker` fixture of shared/testing).
 */
import { faker } from '@faker-js/faker';
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

/**
 * A value for `schema`: `example` (or first of `examples`) as is, else `const`/`enum`, else faker by
 * type/format/bounds. Required properties always, optional ones with an example always, others 50 %.
 */
export function fake(schema: Schema, schemas: Schemas, depth = 0): unknown {
  const resolved = flatten(resolve(schema, schemas), schemas);
  if (resolved.example !== undefined) return structuredClone(resolved.example);
  if (resolved.examples?.length) return structuredClone(resolved.examples[0]);
  if (resolved.const !== undefined) return structuredClone(resolved.const);
  if (resolved.enum?.length) return faker.helpers.arrayElement(resolved.enum);
  const variants = resolved.oneOf ?? resolved.anyOf;
  if (variants?.length) return fakeVariant(resolved, variants, schemas, depth);
  switch (typeOf(resolved)) {
    case 'object':
      return fakeObject(resolved, schemas, depth);
    case 'array':
      return fakeArray(resolved, schemas, depth);
    case 'integer':
      return fakeInteger(resolved);
    case 'number':
      return fakeNumber(resolved);
    case 'boolean':
      return faker.datatype.boolean();
    case 'null':
      return null;
    default:
      return fakeString(resolved);
  }
}

/** oneOf/anyOf: one variant; with a discriminator its property gets the mapping key of that variant. */
function fakeVariant(schema: Schema, variants: Schema[], schemas: Schemas, depth: number): unknown {
  const variant = faker.helpers.arrayElement(variants);
  const { discriminator } = schema;
  const siblings: Schema = { ...schema, oneOf: undefined, anyOf: undefined, discriminator: undefined };
  const value = fake({ allOf: [siblings, variant] }, schemas, depth);
  if (!discriminator || !variant.$ref || typeof value !== 'object' || value === null) return value;
  const mapped = Object.entries(discriminator.mapping ?? {}).find(([, ref]) => ref === variant.$ref)?.[0];
  return { ...value, [discriminator.propertyName]: mapped ?? variant.$ref.slice(REF_PREFIX.length) };
}

function fakeObject(schema: Schema, schemas: Schemas, depth: number): Record<string, unknown> {
  const required = new Set(schema.required);
  const result: Record<string, unknown> = {};
  for (const [key, property] of Object.entries(schema.properties ?? {})) {
    const resolved = resolve(property, schemas);
    if (resolved.writeOnly) continue; // request-only, never in a response
    const include =
      required.has(key) || (depth < MAX_DEPTH && (resolved.example !== undefined || faker.datatype.boolean()));
    if (include) result[key] = fake(property, schemas, depth + 1);
  }
  const extra = schema.additionalProperties;
  if (extra && !schema.properties && depth < MAX_DEPTH) {
    result[faker.string.alphanumeric(5)] = fake(extra === true ? {} : extra, schemas, depth + 1);
  }
  return result;
}

function fakeArray(schema: Schema, schemas: Schemas, depth: number): unknown[] {
  const min = schema.minItems ?? (depth < MAX_DEPTH ? 1 : 0);
  const max = depth < MAX_DEPTH ? (schema.maxItems ?? Math.max(min, DEFAULT_MAX_ITEMS)) : min;
  return Array.from({ length: faker.number.int({ min, max }) }, () => fake(schema.items ?? {}, schemas, depth + 1));
}

/** 3.0 boolean exclusive* and 3.1 numeric exclusive* → inclusive bounds (step = 1 for integers, tiny for numbers). */
function bounds(schema: Schema, step: number): { min?: number; max?: number } {
  const lower = typeof schema.exclusiveMinimum === 'number' ? schema.exclusiveMinimum : schema.minimum;
  const upper = typeof schema.exclusiveMaximum === 'number' ? schema.exclusiveMaximum : schema.maximum;
  const min = lower !== undefined && schema.exclusiveMinimum !== undefined ? lower + step : lower;
  const max = upper !== undefined && schema.exclusiveMaximum !== undefined ? upper - step : upper;
  return { min, max };
}

function fakeInteger(schema: Schema): number {
  const { min = 0, max = min + 1_000_000 } = bounds(schema, 1);
  return faker.number.int({ min, max, multipleOf: schema.multipleOf ?? 1 });
}

function fakeNumber(schema: Schema): number {
  const { min = 0, max = min + 1_000_000 } = bounds(schema, 0.01);
  return faker.number.float({ min, max, fractionDigits: 2 });
}

const FORMATS: Record<string, () => string> = {
  'date-time': () => faker.date.past().toISOString(),
  date: () => faker.date.past().toISOString().slice(0, 10),
  time: () => faker.date.past().toISOString().slice(11, 19),
  email: () => faker.internet.email(),
  uuid: () => faker.string.uuid(),
  uri: () => faker.internet.url(),
  url: () => faker.internet.url(),
  hostname: () => faker.internet.domainName(),
  ipv4: () => faker.internet.ipv4(),
  ipv6: () => faker.internet.ipv6(),
  byte: () => btoa(faker.string.alpha(12)),
  password: () => faker.internet.password(),
};

function fakeString(schema: Schema): string {
  const byFormat = schema.format ? FORMATS[schema.format] : undefined;
  if (byFormat) return byFormat();
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

/** msw handler for one operation: the override, else a fresh `generate()` per request. */
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
