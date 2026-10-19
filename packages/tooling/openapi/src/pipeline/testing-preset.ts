/**
 * Preset `testing` (target generate-api-testing): the client's testing lib <client>/testing/src/generated/**
 * (gitignored), from the spec only — independent of the code generator adapter. Mocks engines:
 *
 *   all       schema.ts (openapi-typescript: paths, components, operations), http.ts (openapi-msw: `<client>Http`,
 *             `<client>BaseUrl`), index.ts
 *   none      (default) nothing else: scaffold only — handlers are written by hand on `<client>Http`
 *   examples  (opt-in) + handlers.ts (`<client>Handlers`): one typed handler per operation, bodies from the spec
 *             examples (fixed placeholders for the rest), computed at generation time (./examples)
 *
 * Same runner as the client: overlays, transforms, format and header apply here, too. Deterministic output.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { camelCase, type MockEngine, partRoot, TESTING_PART } from '../settings';
import type { PipelineContext, PipelinePreset } from './runner';
import { generateExampleHandlers } from './examples/example-handlers';

export interface TestingPreset extends PipelinePreset {
  /** servers[0].url of the spec, known after generate */
  baseUrl?: string;
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
      } else {
        for (const [file, content] of Object.entries(generateExampleHandlers({ document: document as Record<string, unknown>, name }))) {
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
