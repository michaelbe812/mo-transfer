/**
 * Simulates a code change: appends a unique comment so the file's hash (and every dependent task's hash) changes,
 * without changing behavior. Originals are kept in memory and restored after the bench (also on Ctrl+C).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';

const COMMENT_STYLES: Record<string, (text: string) => string> = {
  line: (text) => `// ${text}`,
  hash: (text) => `# ${text}`,
  block: (text) => `/* ${text} */`,
  html: (text) => `<!-- ${text} -->`,
};

const STYLE_BY_EXTENSION: Record<string, keyof typeof COMMENT_STYLES> = {
  '.ts': 'line',
  '.tsx': 'line',
  '.mts': 'line',
  '.cts': 'line',
  '.js': 'line',
  '.jsx': 'line',
  '.mjs': 'line',
  '.cjs': 'line',
  '.scss': 'line',
  '.less': 'line',
  '.cs': 'line',
  '.java': 'line',
  '.kt': 'line',
  '.go': 'line',
  '.css': 'block',
  '.html': 'html',
  '.vue': 'html',
  '.svelte': 'html',
  '.md': 'html',
  '.py': 'hash',
  '.yml': 'hash',
  '.yaml': 'hash',
  '.sh': 'hash',
};

export function commentFor(file: string, text: string): string {
  const style = STYLE_BY_EXTENSION[extname(file).toLowerCase()];
  if (!style) throw new Error(`cannot touch ${file}: no comment syntax known for "${extname(file)}" (JSON has none)`);
  return COMMENT_STYLES[style](text);
}

export class FileToucher {
  private readonly originals = new Map<string, string>();

  touch(file: string, marker: string): void {
    if (!this.originals.has(file)) this.originals.set(file, readFileSync(file, 'utf-8'));
    const original = this.originals.get(file) as string;
    const separator = original.endsWith('\n') ? '' : '\n';
    writeFileSync(file, `${original}${separator}${commentFor(file, `nx-metrics bench ${marker}`)}\n`);
  }

  restore(): void {
    for (const [file, content] of this.originals) writeFileSync(file, content);
    this.originals.clear();
  }
}
