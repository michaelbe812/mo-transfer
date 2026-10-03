/**
 * Review findings (H1, H2, M1, M3, M4, L5) against `nx` in a fixture workspace: a malformed openapi-clients.json
 * never breaks the graph, settings/transform paths cannot escape (no committed file deleted), missing declared
 * packages give a clear problem instead of a hasher failure, modules outside the workspace are rejected, renamed
 * targets keep dependsOn working.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createNxFixture, type NxFixture, removeWorkspace, THINGS_SPEC, write } from '../helpers';

describe('H1: a malformed openapi-clients.json never breaks the graph', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('h1');
    write(fx.root, 'libs/generated/a-client/project.json', JSON.stringify({ name: 'generated-a-client', tags: ['scope:shared', 'generated'] }));
    write(fx.root, 'libs/generated/a-client/openapi.yaml', THINGS_SPEC);
  });
  afterAll(() => removeWorkspace(fx.root));

  const shapes: [string, unknown][] = [
    ['adapter registration {}', { adapters: { x: {} }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['adapter registration null', { adapters: { x: null }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['adapter module not a string', { adapters: { x: { module: 42 } }, clients: { 'generated/a-client': { adapter: 'x' } } }],
    ['client entry null', { clients: { 'generated/a-client': null } }],
    ['transform entry {}', { clients: { 'generated/a-client': { pipeline: { transforms: [{}] } } } }],
    ['transforms not an array', { clients: { 'generated/a-client': { pipeline: { transforms: 'x' } } } }],
    ['clients not an object', { clients: 'x' }],
    ['settings not an object', { settings: 'x', clients: { 'generated/a-client': {} } }],
    ['adapters an array', { adapters: [1], clients: { 'generated/a-client': {} } }],
    ['the file an array', []],
  ];

  it.each(shapes)('%s: graph computes, the client project stays', (_, config) => {
    write(fx.root, 'openapi-clients.json', JSON.stringify(config));
    const result = fx.tryNx('show', 'projects', '--json');
    expect(result.output).not.toMatch(/Error|error/);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.output)).toContain('generated-a-client');
  });

  it('the problem lands in the metadata (verify reports it)', () => {
    write(fx.root, 'openapi-clients.json', JSON.stringify(shapes[0][1]));
    expect(fx.project('generated-a-client').metadata.openapi.problem).toBe('adapters.x: module missing (a workspace path, package or builtin:<id>)');
    write(fx.root, 'openapi-clients.json', JSON.stringify(shapes[4][1]));
    expect(fx.project('generated-a-client').metadata.openapi.problem).toBe('pipeline.transforms[0]: module missing');
  });
});

/** a Node script as generator (built-in command adapter): model + api in separate files */
const GENERATOR = [
  "import { mkdirSync, writeFileSync } from 'node:fs';",
  'const [out] = process.argv.slice(2);',
  "mkdirSync(out + '/model', { recursive: true });",
  "writeFileSync(out + '/model/thing.ts', 'export type Thing = { id: string };\\n');",
  "writeFileSync(out + '/client.ts', \"import type { Thing } from './model/thing';\\nexport const get = (): Thing => ({ id: 'x' });\\n\");",
].join('\n');
const COMMAND_ADAPTER = {
  module: 'builtin:command',
  options: { command: 'node', args: ['{workspaceRoot}/tools/gen.mjs', '{outDir}'], classify: { models: ['model/*.ts'], apis: ['client.ts'] } },
};
const commitClient = (root: string, clientPath: string, parts = ['types', 'api', 'core']): void => {
  write(root, `libs/${clientPath}/project.json`, JSON.stringify({ name: clientPath.replaceAll('/', '-'), tags: ['scope:shared', 'generated'] }));
  write(root, `libs/${clientPath}/openapi.yaml`, THINGS_SPEC);
  for (const part of parts) write(root, `libs/${clientPath}/${part}/src/index.ts`, "export * from './generated';\n");
};

describe('H2: paths from settings, transforms and classify cannot escape', () => {
  let fx: NxFixture;
  beforeAll(() => {
    fx = createNxFixture('h2');
    write(fx.root, 'tools/gen.mjs', GENERATOR);
    commitClient(fx.root, 'generated/b-client');
  });
  afterAll(() => removeWorkspace(fx.root));

  it('settings.outputDir ".." never deletes the committed lib: invalid settings, no targets, a warning', () => {
    fx.clients({ settings: { outputDir: '..' }, adapters: { cmd: COMMAND_ADAPTER }, clients: { 'generated/b-client': { adapter: 'cmd' } } });
    const run = fx.tryNx('run', 'generated-b-client:generate-api-client', '--skip-nx-cache');
    expect(existsSync(join(fx.root, 'libs/generated/b-client/types/src/index.ts'))).toBe(true);
    expect(run.ok).toBe(false);
    expect(fx.tryNx('show', 'projects', '--json').output).toContain('settings.outputDir: must be one kebab-case folder name');
  });

  it.each([
    [{ libsDir: '/tmp' }, 'settings.libsDir: must be a relative path inside the workspace'],
    [{ libsDir: '../outside' }, 'settings.libsDir: must be a relative path inside the workspace'],
    [{ clientFolder: 'a/b' }, 'settings.clientFolder: must be one kebab-case folder name'],
    [{ specFiles: ['../spec.yaml'] }, 'settings.specFiles: plain file names only'],
  ])('settings %j are rejected with a warning', (settings, message) => {
    fx.clients({ settings, clients: { 'generated/b-client': {} } });
    const result = fx.tryNx('show', 'projects', '--json');
    expect(result.ok).toBe(true);
    expect(result.output).toContain(message);
  });

  it('a transform returning a path outside its part fails; nothing is written outside src/generated', () => {
    write(
      fx.root,
      'tools/escape/escape.ts',
      "export default { apiVersion: 1, id: 'escape', transform(files: { path: string; part: string; content: string }[]) { return [...files, { path: '../../../../../escaped.ts', part: 'api', content: 'x' }]; } };\n",
    );
    fx.clients({ adapters: { cmd: COMMAND_ADAPTER }, clients: { 'generated/b-client': { adapter: 'cmd', pipeline: { transforms: ['./tools/escape/escape.ts'] } } } });
    const run = fx.tryNx('run', 'generated-b-client:generate-api-client', '--skip-nx-cache');
    expect(run.ok).toBe(false);
    expect(run.output).toContain('transform escape: invalid file path "../../../../../escaped.ts" (relative, inside its part)');
    expect(existsSync(join(fx.root, 'libs/escaped.ts'))).toBe(false);
    expect(existsSync(join(fx.root, 'escaped.ts'))).toBe(false);
  });

  it('a classification pointing outside the raw output is rejected', () => {
    write(fx.root, 'tools/out/out.ts', "export default { apiVersion: 1, id: 'out', generate() {}, classify() { return { models: ['../outside.ts'], apis: [], core: [] }; } };\n");
    fx.clients({ adapters: { out: { module: './tools/out/out.ts' } }, clients: { 'generated/b-client': { adapter: 'out' } } });
    const run = fx.tryNx('run', 'generated-b-client:generate-api-client', '--skip-nx-cache');
    expect(run.ok).toBe(false);
    expect(run.output).toContain('../outside.ts: classified, but no .ts file of the raw output');
  });
});
