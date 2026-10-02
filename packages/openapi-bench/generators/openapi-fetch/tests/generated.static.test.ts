/** Statische Tests (S-*, nicht gemessen): lesen den generierten Code (client/schema.ts) als Text. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const schema = readFileSync(fileURLToPath(new URL('../client/schema.ts', import.meta.url)), 'utf8');

describe('openapi-fetch static', () => {
  // Audit: expect verlangt @deprecated an generierter Methode/Funktion; openapi-fetch generiert keine (Aufruf
  // client.GET('/naming/deprecated') zeigt die Deprecation nicht an) → unsupported.
  it.skip('[S-DEPRECATED-OP] deprecatedOperation trägt @deprecated — unsupported: keine generierte Methode/Funktion, @deprecated nur am paths-Typ-Member', () => {
    // Einziger operationsbezogener Ort: Methoden-Property im paths-Interface (Aufruf ist client.GET('/naming/deprecated')).
    expect(schema).toMatch(/\/\*\*\s*@deprecated\s*\*\/\s*get: operations\["deprecatedOperation"\];/);
  });

  it('[S-DEPRECATED-PROP] legacyCode trägt @deprecated', () => {
    expect(schema).toMatch(/\/\*\*(?:(?!\*\/)[\s\S])*@deprecated(?:(?!\*\/)[\s\S])*\*\/\s*legacyCode\?: string;/);
  });

  it('[S-JSDOC-DESCRIPTION] Beschreibungen als JSDoc', () => {
    expect(schema).toMatch(/\/\*\*(?:(?!\*\/)[\s\S])*Status eines Pets(?:(?!\*\/)[\s\S])*\*\/\s*PetStatus:/);
    expect(schema).toMatch(/\/\*\*\s*Liste Pets \(paginiert\)\s*\*\/\s*get: operations\["listPets"\];/);
  });
});
