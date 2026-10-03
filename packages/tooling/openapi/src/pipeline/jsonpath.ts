/**
 * JSONPath (RFC 9535) subset for OpenAPI Overlay targets — no dependency:
 *
 *   $  .name  ['name']  ["a","b"]  .*  [*]  [0]  [-1]  ..name  ..*  ..['name']
 *   [?(@.prop == 'x')]  [?@.prop != 1]  [?(@.prop)]  [?(@['x-tag'] == true)]
 *
 * Unsupported syntax (slices, functions, &&/||, comparisons < >) is an error, never a silent mismatch.
 */
import { isRecord } from '../settings';

type Literal = string | number | boolean | null;

interface Filter {
  path: string[];
  operator?: '==' | '!=';
  literal?: Literal;
}

type Selector = { kind: 'name'; name: string } | { kind: 'wildcard' } | { kind: 'index'; index: number } | { kind: 'filter'; filter: Filter };

interface Segment {
  descendant: boolean;
  selectors: Selector[];
}

export interface JsonPathNode {
  value: unknown;
  parent?: Record<string, unknown> | unknown[];
  key?: string | number;
}

const NAME = /^[A-Za-z_$][\w$-]*/;

class Parser {
  index = 0;
  constructor(readonly text: string) {}

  fail(reason: string): never {
    throw new Error(`JSONPath ${this.text}: ${reason} at position ${this.index}`);
  }
  peek(length = 1): string {
    return this.text.slice(this.index, this.index + length);
  }
  skipSpaces(): void {
    while (this.peek() === ' ') this.index++;
  }
  expect(token: string): void {
    this.skipSpaces();
    if (this.peek(token.length) !== token) this.fail(`expected "${token}"`);
    this.index += token.length;
  }
  name(): string {
    const match = NAME.exec(this.text.slice(this.index));
    if (!match) this.fail('expected a name');
    this.index += match[0].length;
    return match[0];
  }
  quoted(): string {
    const quote = this.peek();
    let value = '';
    this.index++;
    while (this.index < this.text.length && this.peek() !== quote) {
      if (this.peek() === '\\') this.index++;
      value += this.peek();
      this.index++;
    }
    if (this.peek() !== quote) this.fail('unterminated string');
    this.index++;
    return value;
  }
  literal(): Literal {
    this.skipSpaces();
    const char = this.peek();
    if (char === "'" || char === '"') return this.quoted();
    const match = /^(true|false|null|-?\d+(\.\d+)?)/.exec(this.text.slice(this.index));
    if (!match) this.fail('expected a literal');
    this.index += match[0].length;
    return JSON.parse(match[0]) as Literal;
  }
  relativePath(): string[] {
    const path: string[] = [];
    for (;;) {
      if (this.peek() === '.') {
        this.index++;
        path.push(this.name());
      } else if (this.peek(2) === "['" || this.peek(2) === '["') {
        this.index++;
        path.push(this.quoted());
        this.expect(']');
      } else return path;
    }
  }
  filter(): Filter {
    this.skipSpaces();
    const parenthesized = this.peek() === '(';
    if (parenthesized) this.index++;
    this.expect('@');
    const filter: Filter = { path: this.relativePath() };
    this.skipSpaces();
    const operator = this.peek(2);
    if (operator === '==' || operator === '!=') {
      this.index += 2;
      filter.operator = operator;
      filter.literal = this.literal();
    }
    if (parenthesized) this.expect(')');
    return filter;
  }
  selector(): Selector {
    this.skipSpaces();
    const char = this.peek();
    if (char === "'" || char === '"') return { kind: 'name', name: this.quoted() };
    if (char === '*') {
      this.index++;
      return { kind: 'wildcard' };
    }
    if (char === '?') {
      this.index++;
      return { kind: 'filter', filter: this.filter() };
    }
    const match = /^-?\d+/.exec(this.text.slice(this.index));
    if (!match) this.fail('unsupported selector');
    this.index += match[0].length;
    return { kind: 'index', index: Number(match[0]) };
  }
  bracket(): Selector[] {
    const selectors = [this.selector()];
    this.skipSpaces();
    while (this.peek() === ',') {
      this.index++;
      selectors.push(this.selector());
      this.skipSpaces();
    }
    this.expect(']');
    return selectors;
  }
  parse(): Segment[] {
    if (this.peek() !== '$') this.fail('must start with $');
    this.index++;
    const segments: Segment[] = [];
    while (this.index < this.text.length) {
      const descendant = this.peek(2) === '..';
      if (descendant) this.index += 2;
      else if (this.peek() === '.') this.index++;
      else if (this.peek() !== '[') this.fail('expected . or [');
      if (this.peek() === '[') {
        this.index++;
        segments.push({ descendant, selectors: this.bracket() });
      } else if (this.peek() === '*') {
        this.index++;
        segments.push({ descendant, selectors: [{ kind: 'wildcard' }] });
      } else segments.push({ descendant, selectors: [{ kind: 'name', name: this.name() }] });
    }
    return segments;
  }
}

function children(node: JsonPathNode): JsonPathNode[] {
  const { value } = node;
  if (Array.isArray(value)) return value.map((item, index) => ({ value: item, parent: value, key: index }));
  if (isRecord(value)) return Object.entries(value).map(([key, item]) => ({ value: item, parent: value, key }));
  return [];
}

function descendantsAndSelf(node: JsonPathNode): JsonPathNode[] {
  return [node, ...children(node).flatMap(descendantsAndSelf)];
}

function matchesFilter(value: unknown, filter: Filter): boolean {
  let current: unknown = value;
  for (const key of filter.path) {
    if (!isRecord(current) || !(key in current)) return filter.operator === '!=';
    current = current[key];
  }
  if (!filter.operator) return true;
  const equal = current === filter.literal;
  return filter.operator === '==' ? equal : !equal;
}

function select(node: JsonPathNode, selector: Selector): JsonPathNode[] {
  const { value } = node;
  switch (selector.kind) {
    case 'name':
      return isRecord(value) && Object.hasOwn(value, selector.name)
        ? [{ value: value[selector.name], parent: value, key: selector.name }]
        : [];
    case 'wildcard':
      return children(node);
    case 'index': {
      if (!Array.isArray(value)) return [];
      const index = selector.index < 0 ? value.length + selector.index : selector.index;
      return index >= 0 && index < value.length ? [{ value: value[index], parent: value, key: index }] : [];
    }
    case 'filter':
      return children(node).filter((child) => matchesFilter(child.value, selector.filter));
  }
}

/** Nodes (with parent + key, for remove) the path selects in `document`, in document order. */
export function queryJsonPath(document: unknown, path: string): JsonPathNode[] {
  let nodes: JsonPathNode[] = [{ value: document }];
  for (const segment of new Parser(path).parse()) {
    const bases = segment.descendant ? nodes.flatMap(descendantsAndSelf) : nodes;
    nodes = bases.flatMap((node) => segment.selectors.flatMap((selector) => select(node, selector)));
  }
  return nodes;
}
