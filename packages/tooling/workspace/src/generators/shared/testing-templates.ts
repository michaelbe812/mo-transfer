/**
 * Testing lib (libs/<slice>/testing). Default: the scaffold only — typed, empty curated handlers + scenarios on top
 * of the generated baseline of the slice's own clients (`withBaseline` from shared/testing), no fixtures, no data.
 * `--examples`: example fixtures (builders) + MSW handlers (defaults) + scenarios (deviations per test).
 * Imports only msw, the slice's types, its clients' testing libs and shared/testing.
 */
import { aliasFor } from '@mo-transfer/tooling-conventions';
import type { ClientTestingExports } from '@mo-transfer/tooling-openapi/clients';
import type { LibFiles, SliceNames } from './slice-templates';

const SHARED_TESTING = aliasFor('shared/testing');

/**
 * Scaffold: `<slice>Handlers` = curated (empty) + the `<client>Handlers` baseline of every own client with fake data
 * (mocks engine schema-faker/orval); `<slice>Scenarios` empty. The comment points at each client's typed `<client>Http`.
 */
export function testingScaffoldFiles(n: SliceNames, clients: readonly ClientTestingExports[]): LibFiles {
  const baselines = clients.filter((client) => client.handlers);
  const imports = baselines.map((client) => `import { ${client.handlers} } from '${client.alias}';\n`).join('');
  const typedHttp = clients.length
    ? ` * Build them on the typed ${clients.map((client) => `\`${client.http}\` (${client.alias})`).join(', ')}:\n * \`${clients[0].http}.get('/path', ({ response }) => response(200).json(<fixture>))\`.`
    : ` * Build them on the typed \`<client>Http\` of a generated client of the slice\n * (nx g @mo-transfer/tooling-openapi:client <name> --domain=${n.scope}).`;
  return {
    files: {
      [`handlers/${n.scope}.handlers.ts`]: `${imports}import { type Scenarios, withBaseline } from '${SHARED_TESTING}';
import type { HttpHandler } from 'msw';

/**
 * Curated handlers of the ${n.scope} slice: hand-written fixtures in the domain model, they win over the generated
 * baseline.
${typedHttp}
 */
const curated${n.entity}Handlers: HttpHandler[] = [];

/** Slice defaults, set per spec: \`beforeEach(() => worker.use(...${n.property}Handlers))\`. */
export const ${n.property}Handlers: HttpHandler[] = withBaseline(${[`curated${n.entity}Handlers`, ...baselines.map((client) => client.handlers)].join(', ')});

/** Deviations for a single test: \`worker.use(${n.property}Scenarios.<name>())\`. */
export const ${n.property}Scenarios = {} satisfies Scenarios;
`,
    },
    exports: [`handlers/${n.scope}.handlers`],
  };
}

/**
 * `--examples`: example fixtures, handlers and scenarios for the example `<D>Api` (`GET /api/<d>`, `{ id, name }`).
 * They declare their own shape `<D>Example` instead of importing the domain entity: the entity in
 * `libs/<slice>/types` may have any shape (other fields, other id type) or not exist yet — the examples compile
 * regardless. Curated handlers replace them with fixtures in the domain model.
 */
export function testingFiles(n: SliceNames): LibFiles {
  const shape = `${n.entity}Example`;
  return {
    files: {
      [`fixtures/${n.scope}.fixture.ts`]: `/** Shape of the example data (what the example ${n.entity}Api loads) — independent of the domain model. */
export interface ${shape} {
  id: string;
  name: string;
}

let nextId = 1;

/** Test data builder: a valid entry, override what the test cares about. */
export function a${n.entity}(overrides: Partial<${shape}> = {}): ${shape} {
  return {
    id: \`${n.scope}-\${nextId++}\`,
    name: 'Example ${n.scope}',
    ...overrides,
  };
}
`,
      [`handlers/${n.scope}.handlers.ts`]: `import { http, HttpResponse } from 'msw';
import { a${n.entity}, ${shape} } from '../fixtures/${n.scope}.fixture';

/** Backend contract of the ${n.scope} slice (mirrors ${n.entity}Api). */
export const ${n.property}Url = '${n.url}';

export const default${n.entity}Items: ${shape}[] = [
  a${n.entity}({ id: '${n.scope}-100', name: 'First ${n.scope}' }),
  a${n.entity}({ id: '${n.scope}-101', name: 'Second ${n.scope}' }),
];

/** Happy path, set per spec: \`beforeEach(() => worker.use(...${n.property}Handlers))\`. */
export const ${n.property}Handlers = [http.get(${n.property}Url, () => HttpResponse.json(default${n.entity}Items))];

/** Deviations for a single test: \`worker.use(${n.property}Scenarios.serverError())\`. */
export const ${n.property}Scenarios = {
  withItems: (items: ${shape}[]) => http.get(${n.property}Url, () => HttpResponse.json(items)),
  empty: () => http.get(${n.property}Url, () => HttpResponse.json([])),
  serverError: () => http.get(${n.property}Url, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
};
`,
    },
    exports: [`fixtures/${n.scope}.fixture`, `handlers/${n.scope}.handlers`],
  };
}
