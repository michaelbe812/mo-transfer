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
    ? ` on the typed\n * ${clients.map((client) => `\`${client.http}\` (${client.alias})`).join(', ')}:\n * \`${clients[0].http}.get('/path', ({ response }) => response(200).json(<fixture>))\``
    : `; once the slice has a generated\n * client (nx g @mo-transfer/tooling-openapi:client <name> --domain=${n.scope}), build them on its typed \`<client>Http\``;
  return {
    files: {
      [`handlers/${n.scope}.handlers.ts`]: `${imports}import { type Scenarios, withBaseline } from '${SHARED_TESTING}';
import type { HttpHandler } from 'msw';

/**
 * Curated handlers of the ${n.scope} slice: hand-written fixtures in the domain model, they win over the generated
 * baseline${typedHttp}.
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
 * \`--examples\`: example fixtures, handlers and scenarios.
 * @param entityInTypes true if `libs/<slice>/types` exports the entity interface; otherwise the
 *   fixture declares the backend shape itself (a testing lib may only import types).
 */
export function testingFiles(n: SliceNames, entityInTypes: boolean): LibFiles {
  const entityImport = entityInTypes
    ? `import { ${n.entity} } from '${aliasFor(`${n.scope}/types`)}';\n`
    : `/** Backend shape served by the handlers (no ${n.entity} in ${aliasFor(`${n.scope}/types`)} yet — move it there). */
export interface ${n.entity} {
  id: string;
  name: string;
}
`;
  const handlerImport = entityInTypes ? `import { ${n.entity} } from '${aliasFor(`${n.scope}/types`)}';\n` : '';
  const fixtureImport = entityInTypes ? `a${n.entity}` : `a${n.entity}, ${n.entity}`;
  return {
    files: {
      [`fixtures/${n.scope}.fixture.ts`]: `${entityImport}
let nextId = 1;

/** Test data builder: a valid entry, override what the test cares about. */
export function a${n.entity}(overrides: Partial<${n.entity}> = {}): ${n.entity} {
  return {
    id: \`${n.scope}-\${nextId++}\`,
    name: 'Example ${n.scope}',
    ...overrides,
  };
}
`,
      [`handlers/${n.scope}.handlers.ts`]: `${handlerImport}import { http, HttpResponse } from 'msw';
import { ${fixtureImport} } from '../fixtures/${n.scope}.fixture';

/** Backend contract of the ${n.scope} slice (mirrors ${n.entity}Api). */
export const ${n.property}Url = '${n.url}';

export const default${n.entity}Items: ${n.entity}[] = [
  a${n.entity}({ id: '${n.scope}-100', name: 'First ${n.scope}' }),
  a${n.entity}({ id: '${n.scope}-101', name: 'Second ${n.scope}' }),
];

/** Happy path, set per spec: \`beforeEach(() => worker.use(...${n.property}Handlers))\`. */
export const ${n.property}Handlers = [http.get(${n.property}Url, () => HttpResponse.json(default${n.entity}Items))];

/** Deviations for a single test: \`worker.use(${n.property}Scenarios.serverError())\`. */
export const ${n.property}Scenarios = {
  withItems: (items: ${n.entity}[]) => http.get(${n.property}Url, () => HttpResponse.json(items)),
  empty: () => http.get(${n.property}Url, () => HttpResponse.json([])),
  serverError: () => http.get(${n.property}Url, () => HttpResponse.json({ message: 'boom' }, { status: 500 })),
};
`,
    },
    exports: [`fixtures/${n.scope}.fixture`, `handlers/${n.scope}.handlers`],
  };
}
