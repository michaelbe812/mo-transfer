/**
 * Stage `split`: rewrites imports between the part libs of the classified (and transformed) files, in memory.
 *
 * - The folder structure of the raw output is kept inside a part
 *   (raw/model/pet.ts → types/src/generated/model/pet.ts), relative imports within a part stay valid.
 * - Relative imports into ANOTHER part → the part's alias (`@mo-transfer/<path>/types`).
 * - Relative imports of dropped/unknown files → error (otherwise only the typecheck would break).
 *
 * Works on the TypeScript AST (import/export declarations, import() calls, import types) and replaces only
 * the module specifier literals. Deterministic: files sorted, no timestamps.
 */
import { posix } from 'node:path';
// namespace import: Nx transpiles with tsconfig.base.json (no esModuleInterop), a default import is undefined there
import * as ts from 'typescript';
import type { ClientPart, PipelineFile } from '../adapter';

interface Specifier {
  start: number;
  end: number;
  text: string;
}

/** Module specifier literals of a file (statically resolvable ones only). */
function moduleSpecifiers(fileName: string, text: string): Specifier[] {
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: ts.StringLiteral[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      found.push(node.moduleSpecifier);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      found.push(node.argument.literal);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      found.push(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found.map((literal) => ({ start: literal.getStart(source), end: literal.getEnd(), text: literal.text }));
}

/** Resolves a relative specifier against the known files of the raw output. */
function resolveRelative(fromFile: string, specifier: string, knownFiles: Set<string>): string | undefined {
  const base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  const withoutJs = base.replace(/\.(m?js)$/, '');
  const candidates = [base, `${withoutJs}.ts`, `${withoutJs}.d.ts`, `${withoutJs}/index.ts`];
  return candidates.find((candidate) => knownFiles.has(candidate));
}

export interface SplitInput {
  files: readonly PipelineFile[];
  /** every .ts file of the raw output (distinguishes "dropped" from "not found" in errors) */
  knownFiles: readonly string[];
  aliases: Partial<Record<ClientPart, string>>;
}

/** The files with cross-part imports rewritten to aliases, sorted by path. */
export function splitIntoParts({ files, knownFiles, aliases }: SplitInput): PipelineFile[] {
  const partOf = new Map(files.map((file) => [file.path, file.part]));
  const known = new Set([...knownFiles, ...partOf.keys()]);
  return [...files]
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
    .map(({ path, part, content: text }) => {
      const replacements: (Specifier & { alias: string })[] = [];
      for (const specifier of moduleSpecifiers(path, text)) {
        if (!specifier.text.startsWith('.')) continue;
        const target = resolveRelative(path, specifier.text, known);
        const targetPart = target && partOf.get(target);
        if (!targetPart) {
          throw new Error(`${path}: Import '${specifier.text}' points to a dropped or unknown file (${target ?? 'not found'})`);
        }
        if (targetPart !== part) {
          const alias = aliases[targetPart];
          if (!alias) throw new Error(`${path}: Import '${specifier.text}' points to part ${targetPart}, which has no lib`);
          replacements.push({ ...specifier, alias });
        }
      }
      // replace from the back so the offsets stay valid; the quote character is kept
      let content = text;
      for (const { start, end, alias } of replacements.sort((a, b) => b.start - a.start)) {
        const quote = content[start];
        content = `${content.slice(0, start)}${quote}${alias}${quote}${content.slice(end)}`;
      }
      return { path, part, content };
    });
}
