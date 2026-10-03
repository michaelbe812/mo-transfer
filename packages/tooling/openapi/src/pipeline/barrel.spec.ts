import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildBarrel } from './barrel';

describe('stage barrel (in-memory files)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'openapi-barrel-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('no entries → empty module', () => {
    expect(buildBarrel(dir, new Map(), [])).toBe('export {};');
  });

  it('first entry wins on duplicate names: later ones re-export the rest explicitly (values / types), default skipped', () => {
    const files = new Map([
      ['client.gen.ts', 'export type Config = { a: 1 };\nexport const createClient = () => 1;\nexport default 1;\n'],
      [
        'client/index.ts',
        "export type { Config } from '../client.gen';\nexport { createClient } from '../client.gen';\nexport const other = 2;\nexport interface Extra {}\n",
      ],
      ['only-types.ts', 'export type Config = 1;\nexport type Own = 2;\n'],
      ['only-values.ts', 'export const other = 3;\nexport const mine = 4;\n'],
      ['script.ts', 'const notAModule = 1;\n'],
    ]);
    expect(buildBarrel(dir, files, ['client.gen.ts', 'client/index.ts', 'only-types.ts', 'only-values.ts', 'script.ts'])).toBe(
      [
        "export * from './client.gen';",
        '// without Config, createClient: already exported by an earlier entry',
        "export { other } from './client/index';",
        "export type { Extra } from './client/index';",
        '// without Config: already exported by an earlier entry',
        "export type { Own } from './only-types';",
        '// without other: already exported by an earlier entry',
        "export { mine } from './only-values';",
      ].join('\n'),
    );
  });

  it('reads the in-memory content, not the disk: a stale raw file below rootDir is invisible', () => {
    mkdirSync(join(dir, 'model'), { recursive: true });
    writeFileSync(join(dir, 'model/stale.ts'), 'export const stale = 1;\n');
    writeFileSync(join(dir, 'model/pet.ts'), 'export const fromDisk = 1;\n');
    const files = new Map([
      ['model/pet.ts', "export interface Pet {}\nexport * from './stale';\n"],
      ['model/models.ts', ''],
    ]);
    // stale.ts exists on disk but not in memory: its export is not resolved; models.ts is no module
    expect(buildBarrel(dir, files, ['model/pet.ts', 'model/models.ts'])).toBe("export * from './model/pet';");
  });

  it('packages outside rootDir still resolve from disk', () => {
    const files = new Map([['a.ts', "export { Observable } from 'rxjs';\nexport const a = 1;\n"]]);
    const root = join(__dirname, '../../tmp-barrel-root');
    expect(buildBarrel(root, files, ['a.ts'])).toBe("export * from './a';");
  });
});
