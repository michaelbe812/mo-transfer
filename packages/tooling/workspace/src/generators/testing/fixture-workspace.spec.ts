/**
 * The testing libs the generators write really compile: a fixture workspace on disk (below <repo>/tmp/workspace-it,
 * gitignored; node_modules resolve to the repo's) with the REAL shared/testing and ApiHttp, generated client testing
 * libs from the real testing preset, then `tsc` (strict, as a lib tsconfig) over every generated testing lib + spec:
 *
 *   payment   domain, default: scaffold-only testing lib (no client)
 *   orders    domain --examples: example fixtures/handlers/scenarios + example store spec
 *   booking   testing generator on a slice with two own clients: schema-faker (→ <client>Handlers baseline) and
 *             mocks none (no generated handlers — the scaffold must not import any)
 */
import type { Tree } from '@nx/devkit';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import ts from 'typescript';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBlueprintTree } from '@mo-transfer/tooling-conventions/testing';
import { generateTesting, resolveClient } from '@mo-transfer/tooling-openapi';
import { writeClientsJson } from '@mo-transfer/tooling-openapi/clients';
import { domainGenerator } from '../domain/generator';
import { testingGenerator } from './generator';

const REPO_ROOT = join(__dirname, '../../../../../..');
const CLIENT_SPEC = `openapi: 3.0.3
info: { title: Demo, version: 1.0.0 }
servers: [{ url: /api }]
paths:
  /things:
    get:
      operationId: listThings
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema: { type: array, items: { $ref: '#/components/schemas/Thing' } }
components:
  schemas:
    Thing:
      type: object
      required: [id]
      properties:
        id: { type: string, example: t-1 }
`;
const BOOKING_CLIENTS = ['booking/generated/booking-client', 'booking/generated/lean-client'];

/** The repo's own sources of a lib folder, copied into the fixture (the generated code imports them). */
function copyRepoSources(tree: Tree, dir: string): void {
  for (const file of readdirSync(join(REPO_ROOT, dir))) {
    if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) tree.write(`${dir}/${file}`, readFileSync(join(REPO_ROOT, dir, file), 'utf-8'));
  }
}

function flush(tree: Tree, root: string): void {
  for (const change of tree.listChanges()) {
    if (change.type === 'DELETE' || !change.content) continue;
    mkdirSync(dirname(join(root, change.path)), { recursive: true });
    writeFileSync(join(root, change.path), change.content);
  }
}

const tsFilesBelow = (root: string, dir: string): string[] =>
  (readdirSync(join(root, dir), { recursive: true }) as string[]).filter((file) => file.endsWith('.ts')).map((file) => join(root, dir, file));

/** Diagnostics of the given files with the compiler options of a lib tsconfig.json (strict, bundler, decorators). */
function typecheck(root: string, files: string[]): string[] {
  const program = ts.createProgram({
    rootNames: files,
    options: {
      strict: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.Preserve,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      skipLibCheck: true,
      noEmit: true,
      types: [],
      paths: { '@mo-transfer/*': [join(root, 'libs/*/src/index.ts')] },
    },
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      diagnostic.file
        ? `${relative(root, diagnostic.file.fileName)}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
        : ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    );
}

describe('generated testing libs compile in a fixture workspace (real shared/testing, real client testing libs)', () => {
  const root = join(REPO_ROOT, 'tmp/workspace-it', `testing-${process.pid}`);

  beforeAll(async () => {
    const tree = createBlueprintTree();
    copyRepoSources(tree, 'libs/shared/testing/src');
    tree.write('libs/shared/data-access/src/index.ts', readFileSync(join(REPO_ROOT, 'libs/shared/data-access/src/http-client.ts'), 'utf-8'));
    writeClientsJson(tree, {
      settings: { testing: { mocks: 'schema-faker' } },
      clients: { [BOOKING_CLIENTS[0]]: {}, [BOOKING_CLIENTS[1]]: { pipeline: { testing: { mocks: 'none' } } } },
    });
    for (const clientPath of BOOKING_CLIENTS) {
      tree.write(`libs/${clientPath}/openapi.yaml`, CLIENT_SPEC);
      tree.write(`libs/${clientPath}/testing/src/index.ts`, "export * from './generated';\n");
    }

    await domainGenerator(tree, { name: 'payment', skipFormat: true });
    await domainGenerator(tree, { name: 'orders', examples: true, skipFormat: true });
    await testingGenerator(tree, { domain: 'booking', skipFormat: true });

    rmSync(root, { recursive: true, force: true });
    flush(tree, root);
    for (const clientPath of BOOKING_CLIENTS) await generateTesting(resolveClient(root, clientPath), root);
  }, 60_000);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('the baseline of the schema-faker client is layered, the none client contributes no handlers', () => {
    const handlers = readFileSync(join(root, 'libs/booking/testing/src/handlers/booking.handlers.ts'), 'utf-8');
    expect(handlers).toContain('withBaseline(curatedBookingHandlers, bookingClientHandlers)');
    expect(handlers).not.toContain('leanClientHandlers');
  });

  it('scaffold, examples (+ example spec) and the client-wired scaffold compile without a diagnostic', () => {
    const files = [
      ...['payment', 'orders', 'booking'].flatMap((scope) => tsFilesBelow(root, `libs/${scope}/testing/src`)),
      join(root, 'libs/orders/state/src/orders.store.spec.ts'),
    ];
    expect(files.length).toBeGreaterThanOrEqual(6);
    expect(typecheck(root, files)).toEqual([]);
  });
});

/**
 * `--examples` for any entity shape: the domain entity WITHOUT `{ id, name }` (booking: `Booking { id }` in the
 * blueprint fixture, here widened to a required non-name field), WITH them (orders, domain --examples incl. spec)
 * and a types lib without an entity export (layout).
 */
describe('--examples compile for every entity shape (fixture workspace, real shared/testing)', () => {
  const root = join(REPO_ROOT, 'tmp/workspace-it', `examples-${process.pid}`);

  beforeAll(async () => {
    const tree = createBlueprintTree();
    copyRepoSources(tree, 'libs/shared/testing/src');
    tree.write('libs/shared/data-access/src/index.ts', readFileSync(join(REPO_ROOT, 'libs/shared/data-access/src/http-client.ts'), 'utf-8'));
    tree.write('libs/booking/types/src/booking.model.ts', 'export interface Booking {\n  id: number;\n  guestName: string;\n}\n');
    tree.write('libs/layout/types/src/index.ts', 'export {};\n');

    await testingGenerator(tree, { domain: 'booking', examples: true, skipFormat: true });
    await testingGenerator(tree, { domain: 'layout', examples: true, skipFormat: true });
    await domainGenerator(tree, { name: 'orders', examples: true, skipFormat: true });

    rmSync(root, { recursive: true, force: true });
    flush(tree, root);
  }, 60_000);
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it.each([
    ['entity without { id, name }', ['libs/booking/testing/src']],
    ['types lib without entity export', ['libs/layout/testing/src']],
    ['entity with { id, name } (+ example store spec)', ['libs/orders/testing/src', 'libs/orders/state/src']],
  ])('%s: no diagnostic', (_, dirs) => {
    const files = dirs.flatMap((dir) => tsFilesBelow(root, dir));
    expect(files.length).toBeGreaterThan(0);
    expect(typecheck(root, files)).toEqual([]);
  });
});
