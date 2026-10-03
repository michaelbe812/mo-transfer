/**
 * Preset `testing` (target generate-api-testing, pipeline.testing: 'msw'): the client's testing lib
 * <client>/testing/src/generated/** (gitignored), from the spec only — independent of the code generator adapter.
 *
 *   schema.ts     openapi-typescript: `paths`, `components`, `operations`
 *   mocks.ts      orval (msw mocks only, faker): get<Op>MockHandler(), get<Op>ResponseMock() per operation
 *   model/**      orval: the schema types the mocks use
 *   http.ts       openapi-msw: `<client>Http` = createOpenApiHttp<paths>({ baseUrl: servers[0].url })
 *   handlers.ts   `<client>Handlers`: one generated default handler per operation (spec examples + faker)
 *   index.ts      barrel (shipped by this preset, the runner builds none)
 *
 * Same runner as the client: overlays, transforms, format and header apply here, too.
 * Deterministic output; faker values are seeded per test by the `worker` fixture of shared/testing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { camelCase, partRoot, TESTING_PART } from '../settings';
import { readRawFiles } from './client-preset';
import type { PipelinePreset } from './runner';

export interface TestingPreset extends PipelinePreset {
  /** servers[0].url of the spec, known after generate */
  baseUrl?: string;
}

export function testingPreset(): TestingPreset {
  const preset: TestingPreset = {
    id: 'testing',
    source: 'testing',
    parts: [TESTING_PART],
    rawDirName: 'testing-raw',
    barrel: false,
    async generate({ client, workspaceRoot, settings, specFile, rawDir }) {
      const root = partRoot(settings, client.path, TESTING_PART);
      if (!existsSync(join(workspaceRoot, root, 'src/index.ts'))) {
        throw new Error(`${root}/src/index.ts missing (export * from './${settings.outputDir}';)`);
      }
      const document = parseYaml(readFileSync(specFile, 'utf-8')) as { servers?: { url?: string }[] };
      const baseUrl = document.servers?.[0]?.url ?? '';
      preset.baseUrl = baseUrl;
      const name = camelCase(client.name);

      // openapi-typescript: path/operation/schema types for openapi-msw
      const { default: openapiTS, astToString } = await import('openapi-typescript');
      const schema = astToString(await openapiTS(pathToFileURL(specFile)));

      // orval: msw mocks only. It needs a client target; the client file (fetch) is dropped.
      const { generate } = await import('orval');
      await generate(
        {
          input: { target: specFile },
          output: {
            mode: 'split',
            target: join(rawDir, 'client.ts'),
            schemas: join(rawDir, 'model'),
            client: 'fetch',
            mock: { generators: [{ type: 'msw', useExamples: true, delay: false }] },
          },
        },
        workspaceRoot,
      );
      // a spec without operations: orval writes no mock file at all
      const mocksFile = join(rawDir, 'client.msw.ts');
      const mocks = existsSync(mocksFile) ? readFileSync(mocksFile, 'utf-8') : '';
      // orval's "all handlers" function is named after the spec title: get<Title>Mock = () => [...]
      const aggregate = /export const (get\w+Mock) = \(\) => \[/.exec(mocks)?.[1];
      if (!aggregate) throw new Error(`${client.spec.file}: orval produced no msw handlers (no operations?)`);

      const files = new Map<string, string>([
        ['schema.ts', schema],
        ['mocks.ts', mocks],
        [
          'http.ts',
          [
            "import { createOpenApiHttp } from 'openapi-msw';",
            "import type { paths } from './schema';",
            '',
            `/** Base URL of the spec (servers[0].url) — the generated client calls it. */`,
            `export const ${name}BaseUrl = ${JSON.stringify(baseUrl)};`,
            '',
            '/** Typed MSW `http`: only paths/methods/status codes of the spec, typed params, query, bodies. */',
            `export const ${name}Http = createOpenApiHttp<paths>({ baseUrl: ${name}BaseUrl });`,
            '',
          ].join('\n'),
        ],
        [
          'handlers.ts',
          [
            "import type { HttpHandler } from 'msw';",
            `import { ${aggregate} } from './mocks';`,
            '',
            '/** Default handlers: every operation of the spec answers 200 with its examples, faker fills the rest. */',
            `export const ${name}Handlers: HttpHandler[] = ${aggregate}();`,
            '',
          ].join('\n'),
        ],
        [
          'index.ts',
          [
            "export type { components, operations, paths } from './schema';",
            "export * from './model';",
            "export * from './mocks';",
            "export * from './http';",
            "export * from './handlers';",
            '',
          ].join('\n'),
        ],
      ]);
      for (const [file, content] of readRawFiles(join(rawDir, 'model'))) files.set(`model/${file}`, content);
      return files;
    },
    async classify(_context, raw) {
      return { files: [...raw].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, content]) => ({ path, part: TESTING_PART, content })), entries: {} };
    },
  };
  return preset;
}
