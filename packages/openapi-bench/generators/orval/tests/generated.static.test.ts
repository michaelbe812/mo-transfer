import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../client/${rel}`, import.meta.url)), 'utf8');

describe('orval static', () => {
  it('[S-DEPRECATED-OP] deprecatedOperation trägt @deprecated', () => {
    expect(read('naming/naming.service.ts')).toMatch(/@deprecated\s*\*\/\s*deprecatedOperation</);
  });
  it('[S-DEPRECATED-PROP] legacyCode trägt @deprecated', () => {
    expect(read('model/pet.ts')).toMatch(/@deprecated\s*\*\/\s*legacyCode\?/);
  });
  it('[S-JSDOC-DESCRIPTION] Schema-Description + Operation-Summary als Kommentar', () => {
    expect(read('model/pet-status.ts')).toMatch(/\/\*\*[\s\S]*Status eines Pets[\s\S]*\*\/\s*export type PetStatus/);
    expect(read('pets/pets.service.ts')).toMatch(/\/\*\*[\s\S]*Liste Pets \(paginiert\)[\s\S]*?\*\/\s*listPets</);
  });
});
