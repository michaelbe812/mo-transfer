/** Statische Tests (S-*): lesen den generierten NSwag-Client (eine Datei client/api.ts) als Text. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('../client/api.ts', import.meta.url)), 'utf8');

/** JSDoc-Block direkt vor der ersten Zeile, die `anchor` matcht. */
function jsDocBefore(anchor: RegExp): string {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => anchor.test(line));
  if (index === -1) return '';
  let start = index - 1;
  while (start >= 0 && /^\s*(\/\*\*|\*|\*\/)/.test(lines[start] ?? '')) start--;
  return lines.slice(start + 1, index).join('\n');
}

describe('nswag static', () => {
  it('[S-DEPRECATED-OP] deprecatedOperation trägt @deprecated', () => {
    expect(jsDocBefore(/^\s+deprecatedOperation\(/)).toMatch(/@deprecated/);
  });

  it('[S-DEPRECATED-PROP] Pet.legacyCode trägt @deprecated', () => {
    // NSwag übernimmt nur die description ("Veraltet, wird entfernt"), kein @deprecated.
    expect(jsDocBefore(/^\s+legacyCode\?:/)).toMatch(/@deprecated/);
  });

  it('[S-JSDOC-DESCRIPTION] Beschreibungen als Kommentare', () => {
    expect(jsDocBefore(/^export type PetStatus\b/)).toMatch(/Status eines Pets/);
    expect(jsDocBefore(/^\s+listPets\(/)).toMatch(/Liste Pets \(paginiert\)/);
  });
});
