/**
 * dimension: static (S-*, ohne measured) — liest den generierten Code als Text.
 * ng-openapi-gen schreibt Operations-JSDoc (summary/description/@deprecated) nur an die Service-Methoden
 * (services: true), nicht an die fn/*-Funktionen — beides ist generierte, öffentliche API.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../client/${rel}`, import.meta.url)), 'utf8');

/** JSDoc-Block (/** … *\/) direkt vor der Zeile, die `signature` enthält. */
function jsDocBefore(source: string, signature: RegExp): string | null {
  const match = signature.exec(source);
  if (!match) return null;
  const before = source.slice(0, match.index).trimEnd();
  if (!before.endsWith('*/')) return null;
  return before.slice(before.lastIndexOf('/**'));
}

describe('ng-openapi-gen static', () => {
  it('[S-DEPRECATED-OP] @deprecated an Operation', () => {
    const fnDoc = jsDocBefore(read('fn/naming/deprecated-operation.ts'), /export function deprecatedOperation\(/);
    const serviceDoc = jsDocBefore(read('services/naming.service.ts'), /^\s*deprecatedOperation\(/m);
    // Mindestens die idiomatische Body-Methode muss @deprecated tragen (Service-Methode oder Funktion).
    expect([fnDoc, serviceDoc].some((doc) => doc !== null && /@deprecated/.test(doc))).toBe(true);
  });

  it('[S-DEPRECATED-PROP] @deprecated an Property', () => {
    const doc = jsDocBefore(read('models/pet.ts'), /^\s*legacyCode\??:/m);
    expect(doc).toMatch(/@deprecated/);
  });

  it('[S-JSDOC-DESCRIPTION] Beschreibungen als JSDoc', () => {
    const statusDoc = jsDocBefore(read('models/pet-status.ts'), /export type PetStatus/);
    expect(statusDoc).toContain('Status eines Pets');
    const listPetsSources = [read('fn/pets/list-pets.ts'), read('services/pets.service.ts')];
    expect(listPetsSources.some((src) => /\/\*\*[\s\S]*?Liste Pets \(paginiert\)[\s\S]*?\*\//.test(src))).toBe(true);
  });
});
