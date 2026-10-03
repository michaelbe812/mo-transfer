/**
 * Fixture workspaces for the integration tests: a folder below <repo>/tmp/openapi-it (gitignored) with
 * `node_modules` linked to the repo's (the adapters start node_modules/.bin/openapi-generator-cli relative
 * to the workspace root, the jar lies in node_modules/.cache), a copy of openapitools.json, libs/ and
 * openapi-clients.json. Generated code resolves @angular/*, msw … through the link.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, relative, resolve } from 'node:path';
import ts from 'typescript';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const repoRoot = resolve(__dirname, '../../../..');
export const fixture = (name: string): string => readFileSync(join(__dirname, 'fixtures', name), 'utf-8');
export const THINGS_SPEC = fixture('things.yaml');

let counter = 0;

/** The repo's lib scaffold (openapi-clients.json → settings.scaffold), so fixture clients get the blueprint config. */
export const SCAFFOLD = join(repoRoot, 'packages/tooling/conventions/src/openapi-scaffold.ts');

/**
 * `ownNodeModules`: a real node_modules folder (entries linked to the repo's) the test can add fake packages to;
 * otherwise node_modules is one link to the repo's.
 */
export function createWorkspace(name: string, options: { ownNodeModules?: boolean } = {}): string {
  const root = join(repoRoot, 'tmp/openapi-it', `${name}-${process.pid}-${counter++}`);
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  if (options.ownNodeModules) {
    mkdirSync(join(root, 'node_modules'));
    for (const entry of readdirSync(join(repoRoot, 'node_modules'))) {
      symlinkSync(realpathSync(join(repoRoot, 'node_modules', entry)), join(root, 'node_modules', entry));
    }
  } else {
    symlinkSync(join(repoRoot, 'node_modules'), join(root, 'node_modules'), 'dir');
  }
  copyFileSync(join(repoRoot, 'openapitools.json'), join(root, 'openapitools.json'));
  return root;
}

export const removeWorkspace = (root: string): void => rmSync(root, { recursive: true, force: true });

export function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

export const read = (root: string, path: string): string => readFileSync(join(root, path), 'utf-8');

interface ClientFixture {
  spec?: string;
  specFile?: 'openapi.yaml' | 'openapi.json';
  entry?: Record<string, unknown>;
  parts?: string[];
  defaultAdapter?: string;
}

/** A client like `nx g @mo-transfer/tooling-openapi:client` lays it out: spec, libs with only index.ts, entry. */
export function addClient(root: string, clientPath: string, fixtureOptions: ClientFixture = {}): void {
  const {
    spec = THINGS_SPEC,
    specFile = 'openapi.yaml',
    entry = {},
    parts = ['types', 'api', 'core', 'testing'],
  } = fixtureOptions;
  write(root, `libs/${clientPath}/${specFile}`, spec);
  for (const part of parts) write(root, `libs/${clientPath}/${part}/src/index.ts`, "export * from './generated';\n");
  const configFile = join(root, 'openapi-clients.json');
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf-8')) : { clients: {} };
  if (fixtureOptions.defaultAdapter) config.defaultAdapter = fixtureOptions.defaultAdapter;
  config.clients[clientPath] = entry;
  writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`);
}

/** Every file below dir (relative path → sha256), for byte-identity checks. */
export function hashTree(dir: string): Record<string, string> {
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir, { recursive: true })
      .map(String)
      .filter((file) => statSync(join(dir, file)).isFile())
      .sort()
      .map((file) => [
        file,
        createHash('sha256')
          .update(readFileSync(join(dir, file)))
          .digest('hex'),
      ]),
  );
}

/** Relative paths of the files below dir, sorted. */
export const filesBelow = (dir: string): string[] => Object.keys(hashTree(dir));

/**
 * Typechecks the given files against the lib aliases of the fixture workspace (`@mo-transfer/*` →
 * libs/*\/src/index.ts, as tsconfig.base.json does) with the compiler options of a lib tsconfig.json.
 * Returns the formatted diagnostics (empty = compiles).
 */
export function typecheck(root: string, files: string[]): string[] {
  const program = ts.createProgram({
    rootNames: files.map((file) => join(root, file)),
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
      // absolute: TS 6 deprecates baseUrl, paths resolve without it
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

/** Local HTTP server as spec source (update-spec, client generator with URL). */
export async function startSpecServer(
  respond: (path: string) => { status: number; body: string },
): Promise<{ url: (path: string) => string; close: () => Promise<void>; server: Server }> {
  const server = createServer((request, response) => {
    const { status, body } = respond(request.url ?? '/');
    response.writeHead(status, { 'content-type': 'text/plain' });
    response.end(body);
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const { port } = server.address() as AddressInfo;
  return {
    server,
    url: (path) => `http://127.0.0.1:${port}${path}`,
    close: () => new Promise((done) => server.close(() => done())),
  };
}

/** Minimal ExecutorContext as Nx passes it (root, project, target). */
export function executorContext(root: string, projectName: string, targetName: string) {
  return {
    root,
    cwd: root,
    isVerbose: false,
    projectName,
    targetName,
    projectsConfigurations: { version: 2, projects: {} },
    nxJsonConfiguration: {},
    projectGraph: { nodes: {}, dependencies: {} },
  };
}

/** Exact paths of the repo's tooling exports (Nx loads generators with swc + these paths), absolute. */
export const toolingPaths = (): Record<string, string[]> =>
  Object.fromEntries(
    Object.entries(
      JSON.parse(readFileSync(join(repoRoot, 'tsconfig.base.json'), 'utf-8')).compilerOptions.paths as Record<string, string[]>,
    )
      .filter(([alias]) => alias.startsWith('@mo-transfer/tooling-'))
      .map(([alias, [target]]) => [alias, [join(repoRoot, target)]]),
  );

export interface NxFixture {
  root: string;
  env: () => NodeJS.ProcessEnv;
  /** nx with an own cache/db, no daemon, plain output; throws with stdout+stderr on failure */
  nx: (...args: string[]) => string;
  /** like nx, never throws: { ok, output } */
  tryNx: (...args: string[]) => { ok: boolean; output: string };
  project: (name: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
  clients: (config: Record<string, unknown>) => void;
}

/**
 * A fixture workspace configured like the repo (manifest, lockfile, nx.json, tooling paths), ready for `nx`.
 * `node`: another Node binary (e.g. ≥ 22.18 with native type stripping) for the nx process.
 */
export function createNxFixture(name: string, options: { ownNodeModules?: boolean; node?: string } = {}): NxFixture {
  const root = createWorkspace(name, options);
  write(root, 'package.json', readFileSync(join(repoRoot, 'package.json'), 'utf-8'));
  write(root, 'pnpm-lock.yaml', readFileSync(join(repoRoot, 'pnpm-lock.yaml'), 'utf-8'));
  write(root, 'nx.json', readFileSync(join(repoRoot, 'nx.json'), 'utf-8'));
  write(root, 'lib-scopes.json', JSON.stringify({ scopes: ['shared'] }));
  write(root, 'tsconfig.base.json', JSON.stringify({ compilerOptions: { paths: toolingPaths() } }));
  const env = (): NodeJS.ProcessEnv => ({
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('NX_'))),
    NX_DAEMON: 'false',
    NX_NO_CLOUD: 'true',
    NX_CACHE_DIRECTORY: join(root, '.nx/cache'),
    NX_WORKSPACE_DATA_DIRECTORY: join(root, '.nx/workspace-data'),
    FORCE_COLOR: '0',
    NO_COLOR: '1',
  });
  const nx = (...args: string[]): string =>
    execFileSync(options.node ?? process.execPath, [join(repoRoot, 'node_modules/nx/dist/bin/nx.js'), ...args], {
      cwd: root,
      encoding: 'utf-8',
      env: env(),
      stdio: 'pipe',
    });
  /** stdout + stderr (plugin warnings) */
  const tryNx = (...args: string[]) => {
    const result = spawnSync(options.node ?? process.execPath, [join(repoRoot, 'node_modules/nx/dist/bin/nx.js'), ...args], {
      cwd: root,
      encoding: 'utf-8',
      env: env(),
    });
    return { ok: result.status === 0, output: `${result.stdout}${result.stderr}` };
  };
  return {
    root,
    env,
    nx,
    tryNx,
    project: (projectName) => JSON.parse(nx('show', 'project', projectName, '--json')),
    clients: (config) => write(root, 'openapi-clients.json', `${JSON.stringify({ settings: { scaffold: SCAFFOLD }, ...config }, null, 2)}\n`),
  };
}

/**
 * A fake npm package in a fixture with own node_modules: files below node_modules/<name>, a devDependency in the
 * fixture package.json and a lockfile entry, so Nx creates `npm:<name>` (externalDependencies, createDependencies).
 */
export function addFakePackage(root: string, name: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) write(root, `node_modules/${name}/${file}`, content);
  const manifest = JSON.parse(read(root, 'package.json'));
  manifest.devDependencies[name] = '1.0.0';
  write(root, 'package.json', JSON.stringify(manifest, null, 2));
  const lock = parseYaml(read(root, 'pnpm-lock.yaml'));
  lock.importers['.'].devDependencies[name] = { specifier: '1.0.0', version: '1.0.0' };
  lock.packages[`${name}@1.0.0`] = { resolution: { integrity: 'sha512-ZmFrZQ==' } };
  lock.snapshots[`${name}@1.0.0`] = {};
  write(root, 'pnpm-lock.yaml', stringifyYaml(lock));
}
