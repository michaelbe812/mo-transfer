// Dimension static (S-*, nicht gemessene) – liest generierten Code als Text.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../client/${rel}`, import.meta.url)), 'utf8');
const sdk = read('sdk.gen.ts');
const types = read('types.gen.ts');

describe('hey-api static', () => {
  it('[S-DEPRECATED-OP] deprecatedOperation trägt @deprecated', () => {
    expect(sdk).toMatch(/\/\*\*[^/]*@deprecated[^/]*\*\/\s*export const deprecatedOperation\b/);
  });

  it('[S-DEPRECATED-PROP] legacyCode trägt @deprecated', () => {
    // Pet (Response) und PetWritable (Request) – beide müssen markiert sein.
    const matches = types.match(/@deprecated\s*\*\/\s*legacyCode\?:/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it('[S-JSDOC-DESCRIPTION] Beschreibungen als JSDoc', () => {
    expect(types).toMatch(/\/\*\*\s*\*\s*Status eines Pets\s*\*\/\s*export (const|type) PetStatus\b/);
    expect(sdk).toMatch(/\/\*\*\s*\*\s*Liste Pets \(paginiert\)\s*\*\/\s*export const listPets\b/);
  });
});
