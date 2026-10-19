/**
 * Preset `testing` (target generate-api-testing): the client's testing lib <client>/testing/src/generated/**
 * (gitignored), from the spec only — independent of the code generator adapter. Mocks engines:
 *
 *   all           schema.ts (openapi-typescript: paths, components, operations), http.ts (openapi-msw: `<client>Http`,
 *                 `<client>BaseUrl`), index.ts
 *   none          (default) nothing else: scaffold only, no fake data — handlers are written by hand on `<client>Http`
 *   schema-faker  (opt-in) + mocks.ts, model.ts, mock-runtime.ts, handlers.ts (`<client>Handlers`): own spec walk,
 *                 faker at test time (./schema-faker)
 *   orval         (deprecated, removed next iteration) + mocks.ts, model/**, handlers.ts from orval (msw mocks, faker)
 *
 * The faking engines export get<Op>ResponseMock() / get<Op>MockHandler() per operation and the component types.
 * Same runner as the client: overlays, transforms, format and header apply here, too. Deterministic output; faker
 * values are seeded per test by the `worker` fixture of shared/testing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { camelCase, type MockEngine, partRoot, TESTING_PART } from '../settings';
import { readRawFiles } from '../adapters/files';
import type { PipelineContext, PipelinePreset } from './runner';
import { generateSchemaFakerMocks } from './schema-faker/mocks';

export interface TestingPreset extends PipelinePreset {
  /** servers[0].url of the spec, known after generate */
  baseUrl?: string;
}

/** orval: msw mocks only (it needs a client target; the fetch client is dropped) → mocks.ts, handlers.ts, index.ts, model/**. */
async function orvalMocks({ client, workspaceRoot, specFile, rawDir }: PipelineContext, name: string): Promise<Map<string, string>> {
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
    ['mocks.ts', mocks],
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
}

/** Barrel of mocks engine `none`: types + typed http, nothing faked. */
const SCAFFOLD_INDEX = ["export type { components, operations, paths } from './schema';", "export * from './http';", ''].join('\n');

export function testingPreset(mocks: MockEngine = 'none'): TestingPreset {
  const preset: TestingPreset = {
    id: 'testing',
    source: 'testing',
    parts: [TESTING_PART],
    rawDirName: 'testing-raw',
    barrel: false,
    async generate(context) {
      const { client, workspaceRoot, settings, specFile } = context;
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

      const http = [
        "import { createOpenApiHttp } from 'openapi-msw';",
        "import type { paths } from './schema';",
        '',
        `/** Base URL of the spec (servers[0].url) — the generated client calls it. */`,
        `export const ${name}BaseUrl = ${JSON.stringify(baseUrl)};`,
        '',
        '/** Typed MSW `http`: only paths/methods/status codes of the spec, typed params, query, bodies. */',
        `export const ${name}Http = createOpenApiHttp<paths>({ baseUrl: ${name}BaseUrl });`,
        '',
      ].join('\n');
      const files = new Map<string, string>([
        ['schema.ts', schema],
        ['http.ts', http],
      ]);
      if (mocks === 'none') {
        files.set('index.ts', SCAFFOLD_INDEX);
      } else if (mocks === 'orval') {
        console.warn('mocks engine orval is deprecated (removed next iteration): pipeline.testing.mocks / settings.testing.mocks → schema-faker');
        for (const [file, content] of await orvalMocks(context, name)) files.set(file, content);
      } else {
        for (const [file, content] of Object.entries(generateSchemaFakerMocks({ document: document as Record<string, unknown>, name, specPath: client.spec.file }))) {
          files.set(file, content);
        }
      }
      return files;
    },
    async classify(_context, raw) {
      return { files: [...raw].sort(([a], [b]) => (a < b ? -1 : 1)).map(([path, content]) => ({ path, part: TESTING_PART, content })), entries: {} };
    },
  };
  return preset;
}
