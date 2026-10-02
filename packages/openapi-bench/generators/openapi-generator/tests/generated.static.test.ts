import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../client/${rel}`, import.meta.url)), 'utf8');

/** JSDoc-Block direkt vor der ersten Zeile, die `anchor` matcht. */
function jsDocBefore(source: string, anchor: RegExp): string {
  const index = source.search(anchor);
  if (index === -1) return '';
  const before = source.slice(0, index);
  const start = before.lastIndexOf('/**');
  const end = before.lastIndexOf('*/');
  if (start === -1 || end < start) return '';
  // nur Whitespace zwischen Kommentarende und Anchor
  return before.slice(end + 2).trim() === '' ? before.slice(start, end + 2) : '';
}

describe('openapi-generator static', () => {
  it('[S-DEPRECATED-OP] deprecatedOperation trägt @deprecated', () => {
    const doc = jsDocBefore(read('api/naming.service.ts'), /public deprecatedOperation\(/);
    expect(doc).toMatch(/@deprecated/);
  });

  it('[S-DEPRECATED-PROP] legacyCode trägt @deprecated', () => {
    const doc = jsDocBefore(read('model/pet.ts'), /^\s*legacyCode\?:/m);
    expect(doc).toMatch(/@deprecated/);
  });

  it('[S-JSDOC-DESCRIPTION] Beschreibungen als Kommentare', () => {
    expect(jsDocBefore(read('model/pet-status.ts'), /export const PetStatus/)).toContain('Status eines Pets');
    expect(jsDocBefore(read('api/pets.service.ts'), /public listPets\(/)).toContain('Liste Pets (paginiert)');
  });
});
