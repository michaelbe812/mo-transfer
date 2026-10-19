/**
 * A response value from the JSON Schema of the spec, at generation time, without randomness: the spec's
 * examples first, then `const`/`default`/`enum[0]`, then a fixed placeholder per type/format. Same spec → same
 * value, byte for byte. Refs: only `#/…` inside the document.
 */
export type Json = Record<string, unknown>;

/** Recursive schemas (Tree → children: Tree[]) stop here: optional props dropped, arrays at minItems. */
const MAX_DEPTH = 6;
/** Fixed date of the date formats (UTC): placeholders never depend on today. */
export const EXAMPLE_DATE = '2026-01-01T00:00:00.000Z';

const FORMATS: Record<string, string> = {
  'date-time': EXAMPLE_DATE,
  date: EXAMPLE_DATE.slice(0, 10),
  time: EXAMPLE_DATE.slice(11, 19),
  email: 'user@example.com',
  uuid: '00000000-0000-0000-0000-000000000000',
  uri: 'https://example.com',
  url: 'https://example.com',
  hostname: 'example.com',
  ipv4: '192.0.2.1',
  ipv6: '2001:db8::1',
  byte: 'ZXhhbXBsZQ==',
  password: 'password',
};

export const isRecord = (value: unknown): value is Json => value !== null && typeof value === 'object' && !Array.isArray(value);

/** `#/…` refs inside the document (transitively). */
export function resolveLocal(document: Json, value: unknown): unknown {
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

interface Context {
  document: Json;
  /** property name of the value (placeholder of plain strings) */
  name: string;
  depth: number;
}

const schemaAt = (context: Context, schema: unknown): Json => {
  const resolved = resolveLocal(context.document, schema ?? {});
  return isRecord(resolved) ? flatten(resolved, context) : {};
};

/** allOf → one schema: properties/required merged, the rest last-wins. */
function flatten(schema: Json, context: Context): Json {
  if (!Array.isArray(schema.allOf)) return schema;
  const { allOf, ...rest } = schema;
  return [...allOf.map((part) => schemaAt(context, part)), rest].reduce<Json>(
    (merged, part) => ({
      ...merged,
      ...part,
      properties: { ...(merged.properties as Json), ...(part.properties as Json) },
      required: [...((merged.required as string[]) ?? []), ...((part.required as string[]) ?? [])],
    }),
    {},
  );
}

/** 3.0 `nullable` ignored, 3.1 `type: [x, 'null']` → x: values are never null unless the type is only null. */
function typeOf(schema: Json): string | undefined {
  const types = [schema.type].flat().filter((type) => type !== undefined && type !== 'null') as string[];
  if (types[0]) return types[0];
  if (schema.properties || schema.additionalProperties) return 'object';
  if (schema.items) return 'array';
  return schema.type === 'null' || Array.isArray(schema.type) ? 'null' : undefined;
}

/** The value for `schema` (a schema object or a `$ref`); `name` = property name for string placeholders. */
export function exampleValue(document: Json, schema: unknown, name = 'value'): unknown {
  return valueOf(schemaAt({ document, name, depth: 0 }, schema), { document, name, depth: 0 });
}

function valueOf(schema: Json, context: Context): unknown {
  if (schema.example !== undefined) return structuredClone(schema.example);
  if (Array.isArray(schema.examples) && schema.examples.length) return structuredClone(schema.examples[0]);
  if (schema.const !== undefined) return structuredClone(schema.const);
  if (schema.default !== undefined) return structuredClone(schema.default);
  if (Array.isArray(schema.enum) && schema.enum.length) return structuredClone(schema.enum[0]);
  const variants = (schema.oneOf ?? schema.anyOf) as unknown[] | undefined;
  if (variants?.length) return variantValue(schema, variants, context);
  const type = typeOf(schema);
  if (type === 'object') return objectValue(schema, context);
  if (type === 'array') return arrayValue(schema, context);
  if (type === 'null') return null;
  if (type === 'integer' || type === 'number') return numberValue(schema, type === 'integer' ? 1 : 0.01);
  if (type === 'boolean') return false;
  return stringValue(schema, context.name);
}

/** oneOf/anyOf: the first variant; with a discriminator its property gets the variant's mapping key. */
function variantValue(schema: Json, variants: unknown[], context: Context): unknown {
  const [variant] = variants;
  const { oneOf, anyOf, discriminator, ...siblings } = schema;
  const value = valueOf(flatten({ allOf: [siblings, variant] }, context), context);
  const ref = isRecord(variant) && typeof variant.$ref === 'string' ? variant.$ref : undefined;
  if (!isRecord(discriminator) || !ref || !isRecord(value)) return value;
  const mapping = isRecord(discriminator.mapping) ? discriminator.mapping : {};
  const mapped = Object.entries(mapping).find(([, target]) => target === ref)?.[0];
  return { ...value, [discriminator.propertyName as string]: mapped ?? ref.split('/').at(-1) };
}

/** Required properties, plus optional ones with an example; writeOnly (request-only) never. */
function objectValue(schema: Json, context: Context): Json {
  const required = new Set((schema.required as string[]) ?? []);
  const result: Json = {};
  for (const [key, property] of Object.entries(isRecord(schema.properties) ? schema.properties : {})) {
    const child: Context = { ...context, name: key, depth: context.depth + 1 };
    const resolved = schemaAt(child, property);
    if (resolved.writeOnly) continue;
    const include = required.has(key) || (context.depth < MAX_DEPTH && resolved.example !== undefined);
    if (include) result[key] = valueOf(resolved, child);
  }
  return result;
}

/** max(minItems, 1) items (minItems below the depth limit), never more than maxItems. */
function arrayValue(schema: Json, context: Context): unknown[] {
  const min = typeof schema.minItems === 'number' ? schema.minItems : 0;
  const wanted = context.depth < MAX_DEPTH ? Math.max(min, 1) : min;
  const length = typeof schema.maxItems === 'number' ? Math.min(wanted, schema.maxItems) : wanted;
  const child: Context = { ...context, depth: context.depth + 1 };
  return Array.from({ length }, () => valueOf(schemaAt(child, schema.items), child));
}

/** Lower bound (3.0 boolean and 3.1 numeric exclusive*), else 0; rounded up to multipleOf, capped at the maximum. */
function numberValue(schema: Json, step: number): number {
  const exclusive = schema.exclusiveMinimum;
  const lower = typeof exclusive === 'number' ? exclusive + step : typeof schema.minimum === 'number' ? schema.minimum + (exclusive === true ? step : 0) : 0;
  const multipleOf = typeof schema.multipleOf === 'number' ? schema.multipleOf : undefined;
  const value = multipleOf ? Math.ceil(lower / multipleOf) * multipleOf : lower;
  const upper = typeof schema.maximum === 'number' ? schema.maximum : undefined;
  return upper !== undefined && value > upper ? upper : value;
}

/** Format placeholder, else the property name, padded/cut to minLength/maxLength. */
function stringValue(schema: Json, name: string): string {
  const byFormat = typeof schema.format === 'string' ? FORMATS[schema.format] : undefined;
  if (byFormat) return byFormat;
  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  const max = typeof schema.maxLength === 'number' ? schema.maxLength : Infinity;
  return name.padEnd(min, 'x').slice(0, max);
}
