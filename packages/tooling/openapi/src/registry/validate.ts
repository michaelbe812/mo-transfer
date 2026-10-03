/**
 * Checks before an extension runs: SPI version + id, options against the declared schema (JSON Schema subset),
 * requirements (packages, Node version). Messages name the path of the offending value.
 */
import type { AdapterRequirements, OptionsSchema, OptionsSchemaType } from '../adapter';
import { ADAPTER_API_VERSION } from '../adapter';
import { findPackageDir } from './module-ref';

const typeOf = (value: unknown): OptionsSchemaType => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number') return Number.isInteger(value) ? 'integer' : 'number';
  return typeof value as OptionsSchemaType;
};

const matchesType = (value: unknown, type: OptionsSchemaType): boolean => {
  const actual = typeOf(value);
  return actual === type || (type === 'number' && actual === 'integer');
};

/** Violations of `value` against `schema` (empty = valid). */
export function validateOptions(schema: OptionsSchema, value: unknown, path = 'options'): string[] {
  const errors: string[] = [];
  if (schema.anyOf && !schema.anyOf.some((candidate) => validateOptions(candidate, value, path).length === 0)) {
    errors.push(`${path}: matches none of the allowed shapes`);
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      return [...errors, `${path}: expected ${types.join(' | ')}, got ${typeOf(value)}`];
    }
  }
  if (schema.enum && !schema.enum.some((allowed) => JSON.stringify(allowed) === JSON.stringify(value))) {
    errors.push(`${path}: must be one of ${schema.enum.map((allowed) => JSON.stringify(allowed)).join(', ')}`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, index) => errors.push(...validateOptions(schema.items as OptionsSchema, item, `${path}[${index}]`)));
  }
  if (typeOf(value) === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!(key in record)) errors.push(`${path}.${key}: required`);
    for (const [key, item] of Object.entries(record)) {
      const property = schema.properties?.[key];
      if (property) errors.push(...validateOptions(property, item, `${path}.${key}`));
      else if (schema.additionalProperties === false) errors.push(`${path}.${key}: unknown option`);
      else if (typeof schema.additionalProperties === 'object') {
        errors.push(...validateOptions(schema.additionalProperties, item, `${path}.${key}`));
      }
    }
  }
  return errors;
}

const versionParts = (version: string): number[] => version.replace(/^[^\d]*/, '').split('.').map((part) => Number.parseInt(part, 10) || 0);

/** `>=22.10` against a Node version (only `>=` is supported, the common case for engines). */
export function satisfiesMinimum(version: string, range: string): boolean {
  const minimum = versionParts(range);
  const actual = versionParts(version);
  for (let index = 0; index < Math.max(minimum.length, 3); index++) {
    const [a, m] = [actual[index] ?? 0, minimum[index] ?? 0];
    if (a !== m) return a > m;
  }
  return true;
}

/** Unmet requirements (empty = fine). */
export function unmetRequirements(requires: AdapterRequirements | undefined, workspaceRoot: string, nodeVersion = process.version): string[] {
  const unmet: string[] = [];
  for (const name of requires?.packages ?? []) {
    if (!findPackageDir(workspaceRoot, name)) unmet.push(`package ${name} not installed (pnpm add -D ${name})`);
  }
  if (requires?.node && !satisfiesMinimum(nodeVersion, requires.node)) unmet.push(`Node ${requires.node} required, running ${nodeVersion}`);
  return unmet;
}

/** SPI shape of a loaded extension: apiVersion, id, the functions it must have. Returns the problem or undefined. */
export function definitionProblem(
  definition: unknown,
  what: string,
  expectedId: string | undefined,
  functions: string[],
): string | undefined {
  if (!definition || typeof definition !== 'object') return `${what}: exports no definition (export default defineX({ … }))`;
  const record = definition as Record<string, unknown>;
  if (record.apiVersion !== ADAPTER_API_VERSION) {
    return `${what}: apiVersion ${JSON.stringify(record.apiVersion)} not supported (this package implements ${ADAPTER_API_VERSION})`;
  }
  if (typeof record.id !== 'string' || !record.id) return `${what}: id missing`;
  if (expectedId !== undefined && record.id !== expectedId) {
    return `${what}: declares id "${record.id}", registered as "${expectedId}" (they must match)`;
  }
  const missing = functions.filter((name) => typeof record[name] !== 'function');
  return missing.length ? `${what}: ${missing.join(', ')} missing (not a function)` : undefined;
}
