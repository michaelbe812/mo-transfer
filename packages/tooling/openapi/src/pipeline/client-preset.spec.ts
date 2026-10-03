import { describe, expect, it } from 'vitest';
import type { Classification } from '../adapter';
import { classifyFiles } from './client-preset';

const raw = new Map([
  ['model/pet.ts', 'm'],
  ['model/index.ts', 'mi'],
  ['api/pets.ts', 'a'],
  ['api/api.ts', 'aa'],
  ['base.ts', 'c'],
  ['configuration.ts', 'cc'],
  ['index.ts', 'barrel of the generator'],
]);

describe('stage classify (client preset)', () => {
  const classification: Classification = {
    models: ['model/pet.ts', 'model/index.ts'],
    apis: ['api/pets.ts', 'api/api.ts'],
    core: ['configuration.ts', 'base.ts'],
  };

  it('default layout: part per category, files sorted, no declared entries', () => {
    const { files, entries } = classifyFiles(raw, classification, 'default');
    expect(files.map((file) => [file.path, file.part, file.content])).toEqual([
      ['api/api.ts', 'api', 'aa'],
      ['api/pets.ts', 'api', 'a'],
      ['base.ts', 'core', 'c'],
      ['configuration.ts', 'core', 'cc'],
      ['model/index.ts', 'types', 'mi'],
      ['model/pet.ts', 'types', 'm'],
    ]);
    expect(entries).toEqual({});
    // declared entries keep their order
    expect(classifyFiles(raw, { ...classification, entries: { types: ['model/pet.ts'], core: ['base.ts'] } }, 'default').entries).toEqual({
      types: ['model/pet.ts'],
      core: ['base.ts'],
    });
  });

  it('merged-core: core files go to api; entries of api + core concatenated, a category without entries adds all its files', () => {
    const merged = classifyFiles(raw, { ...classification, entries: { api: ['api/api.ts'] } }, 'merged-core');
    expect(merged.files.filter((file) => file.part === 'api').map((file) => file.path)).toEqual([
      'api/api.ts',
      'api/pets.ts',
      'base.ts',
      'configuration.ts',
    ]);
    expect(merged.files.some((file) => file.part === 'core')).toBe(false);
    expect(merged.entries).toEqual({ api: ['api/api.ts', 'base.ts', 'configuration.ts'] });
    expect(classifyFiles(raw, { ...classification, entries: { core: ['base.ts'] } }, 'merged-core').entries).toEqual({
      api: ['api/api.ts', 'api/pets.ts', 'base.ts'],
    });
    expect(classifyFiles(raw, classification, 'merged-core').entries).toEqual({});
  });

  it('a classification may leave out categories; rejects double classification, a root index.ts, unknown files', () => {
    expect(classifyFiles(raw, { models: ['model/pet.ts'] } as Classification, 'default').files).toHaveLength(1);
    expect(() => classifyFiles(raw, { models: ['base.ts'], apis: [], core: ['base.ts'] }, 'default')).toThrow(
      'base.ts: classified in several categories',
    );
    expect(() => classifyFiles(raw, { models: [], apis: [], core: ['index.ts'] }, 'default')).toThrow(
      'index.ts: root index.ts is reserved (the facade writes the barrel)',
    );
    expect(() => classifyFiles(raw, { models: ['README.md'], apis: [], core: [] }, 'default')).toThrow(
      'README.md: classified, but no .ts file of the raw output',
    );
  });
});
