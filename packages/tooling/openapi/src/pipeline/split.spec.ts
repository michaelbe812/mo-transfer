import { describe, expect, it } from 'vitest';
import type { PipelineFile } from '../adapter';
import { splitIntoParts } from './split';

const ALIASES = {
  types: '@mo-transfer/generated/x/types',
  api: '@mo-transfer/generated/x/api',
  core: '@mo-transfer/generated/x/core',
};
const file = (path: string, part: PipelineFile['part'], content: string): PipelineFile => ({ path, part, content });

describe('stage split', () => {
  it('rewrites every kind of relative specifier into another part, keeps the quote, sorts by path', () => {
    const files = [
      file(
        'api/pets.ts',
        'api',
        [
          'import { Pet } from "../model/pet";',
          "import type { Pet as P } from '../model';",
          "export { BASE } from '../base.js';",
          "export { Pet as Animal } from '../model/pet.ts';",
          "type T = import('../model/pet').Pet;",
          "const lazy = () => import('../base');",
          "import { helper } from './helper';",
          "import { dynamic } from 'rxjs';",
          'const notStatic = (name: string) => import(name);',
          'export { helper };',
          '',
        ].join('\n'),
      ),
      file('model/pet.ts', 'types', 'export interface Pet { id: string }\n'),
      file('model/index.ts', 'types', "export * from './pet';\n"),
      file('base.ts', 'core', 'export const BASE = "/";\n'),
      file('api/helper.ts', 'api', 'export const helper = 1;\n'),
    ];
    const split = splitIntoParts({ files, knownFiles: files.map((f) => f.path), aliases: ALIASES });
    expect(split.map((f) => f.path)).toEqual(['api/helper.ts', 'api/pets.ts', 'base.ts', 'model/index.ts', 'model/pet.ts']);
    expect(split[1].content).toBe(
      [
        'import { Pet } from "@mo-transfer/generated/x/types";',
        "import type { Pet as P } from '@mo-transfer/generated/x/types';",
        "export { BASE } from '@mo-transfer/generated/x/core';",
        "export { Pet as Animal } from '@mo-transfer/generated/x/types';",
        "type T = import('@mo-transfer/generated/x/types').Pet;",
        "const lazy = () => import('@mo-transfer/generated/x/core');",
        "import { helper } from './helper';",
        "import { dynamic } from 'rxjs';",
        'const notStatic = (name: string) => import(name);',
        'export { helper };',
        '',
      ].join('\n'),
    );
    expect(split[2]).toEqual(files[3]);
  });

  it('merged-core: core files in the api part import each other relatively; .d.ts targets resolve', () => {
    const files = [
      file('api/x.ts', 'api', "import { C } from '../configuration';\nexport type { D } from '../d';\n"),
      file('configuration.ts', 'api', 'export class C {}\n'),
      file('d.d.ts', 'types', 'export interface D {}\n'),
    ];
    const split = splitIntoParts({ files, knownFiles: [], aliases: { types: 'T', api: 'A' } });
    expect(split[0].content).toBe("import { C } from '../configuration';\nexport type { D } from 'T';\n");
  });

  it('rejects dropped and unknown targets and a part without alias', () => {
    const split = (files: PipelineFile[], knownFiles: string[] = [], aliases: object = ALIASES) => () =>
      splitIntoParts({ files, knownFiles, aliases });
    expect(split([file('a.ts', 'api', "import { b } from './b';\n")], ['a.ts', 'b.ts'])).toThrow(
      "a.ts: Import './b' points to a dropped or unknown file (b.ts)",
    );
    expect(split([file('c.ts', 'api', "import { z } from './zzz';\n")])).toThrow(
      "c.ts: Import './zzz' points to a dropped or unknown file (not found)",
    );
    expect(split([file('a.ts', 'api', "import { b } from './b';\n"), file('b.ts', 'core', '')], [], { api: 'A' })).toThrow(
      "a.ts: Import './b' points to part core, which has no lib",
    );
  });
});
