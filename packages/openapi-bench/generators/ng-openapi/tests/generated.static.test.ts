/** Dimension "static" (S-*, nicht gemessene) für ng-openapi 0.4.1: liest generierten Code als Text. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../client/${rel}`, import.meta.url)), 'utf8');

/** JSDoc-Block (falls vorhanden) unmittelbar vor der ersten Zeile, die `declaration` matcht. */
function jsDocBefore(source: string, declaration: RegExp): string {
  const lines = source.split('\n');
  const index = lines.findIndex((line) => declaration.test(line));
  expect(index, `Deklaration ${declaration} nicht gefunden`).toBeGreaterThanOrEqual(0);
  const docLines: string[] = [];
  for (let i = index - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('/**') || trimmed.endsWith('*/')) docLines.unshift(trimmed);
    else break;
  }
  return docLines.join('\n');
}

describe('ng-openapi static', () => {
  it('[S-DEPRECATED-OP] deprecatedOperation trägt @deprecated', () => {
    const doc = jsDocBefore(read('services/naming.service.ts'), /^\s*deprecatedOperation\(/);
    expect(doc).toContain('@deprecated');
  });

  it('[S-DEPRECATED-PROP] Pet.legacyCode trägt @deprecated', () => {
    const models = read('models/index.ts');
    const petBlock = models.slice(models.indexOf('export interface Pet {'));
    const doc = jsDocBefore(petBlock, /^\s*legacyCode\??:/);
    expect(doc).toContain('@deprecated');
  });

  it('[S-JSDOC-DESCRIPTION] Schema-Description und Operation-Summary als Kommentar', () => {
    const models = read('models/index.ts');
    const pets = read('services/pets.service.ts');
    expect(jsDocBefore(models, /^export (type|enum|const) PetStatus\b/)).toContain('Status eines Pets');
    expect(jsDocBefore(pets, /^\s*listPets\(/)).toContain('Liste Pets (paginiert)');
  });
});
