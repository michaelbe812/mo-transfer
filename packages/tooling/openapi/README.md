# @mo-transfer/tooling-openapi

Generierte OpenAPI-Clients für Nx 23: Pipeline, Adapter-SPI v1, Crystal-Plugin, Executoren, Generator `client`. Projekt `tooling-openapi` (`type:tooling`, `tooling:openapi`), **publishable** (keine Abhängigkeit auf andere Tooling-Libs). Architektur und Entscheidungen: [`docs/openapi-pipeline-architektur.md`](../../../docs/openapi-pipeline-architektur.md), Einbettung im Blueprint: [`docs/nx-umsetzung.md` → OpenAPI-Clients](../../../docs/nx-umsetzung.md#openapi-clients), Übersicht: [`packages/tooling`](../README.md).

```
spec[] (Overlays, experimentell) → generate → classify → transform[] → split → barrel → finalize[] (prettier, Header) → write
```

| Teil | Datei(en) / Export | Aufgabe |
|---|---|---|
| Öffentliche API | `src/index.ts` (`.`) | Config, Settings, Fehler, Facade (`resolveClient`, `generateClient`, `generateTesting`, `updateSpec`), Projekt-Config, Registry |
| SPI v1 | `src/adapter.ts` (`./adapter`) | `defineAdapter`, `defineTransform`, `defineScaffold`, Typen, `listTsFiles` |
| Contract-Test | `src/adapter-testing.ts` (`./adapter-testing`) | `runAdapterContract(adapter, { specFile })` |
| Plugin | `src/plugin/openapi-clients.ts` (`./plugin`, `nx.json` → `plugins`) | `createNodes`: `generate-api-client` + `update-spec` am Client, `generate-api-testing` an der Testing-Lib, `metadata.openapi`; `createDependencies`: Client → `npm:<pkg>` eigener Adapter/Transforms |
| Tree-Helfer | `src/clients.ts` (`./clients`) | `openapi-clients.json` im Tree, move/remove/rename-Hilfen (genutzt von `@mo-transfer/tooling-workspace`) |
| Settings / Config | `src/settings.ts`, `src/config.ts` | Workspace-Annahmen mit Defaults, Einträge, Layout, Feature-Flags |
| Registry + Loader | `src/registry/*` | eine Registry (Built-ins + `adapters`), Modul-Referenzen + Cache-Inputs, Loader `.ts`/ESM/CJS/npm |
| Pipeline | `src/pipeline/*` | Runner, Stages, Presets `client` / `testing`, Overlay + JSONPath, Glob, Prozesse |
| Adapter | `src/adapters/*` | `openapi-tools` (Default), `hey-api`, `nx-plugin-openapi`, `command` |
| Executoren | `src/executors/*`, `executors.json` | `:generate` (`generate-api-client`), `:generate-testing` (`generate-api-testing`), `:update-spec`. Optionen `client` (+ `verbose`) |
| Generator | `src/generators/client` | `nx g @mo-transfer/tooling-openapi:client <name> [--domain] --spec=<datei\|url> [--url] [--adapter] [--layout=merged-core] [--no-testing]` |
| Schema | `openapi-clients.schema.json` | `$schema` von `openapi-clients.json` |

## `openapi-clients.json`

```jsonc
{
  "$schema": "./packages/tooling/openapi/openapi-clients.schema.json",
  "defaultAdapter": "openapi-tools",
  "settings": { "scaffold": "@mo-transfer/tooling-conventions/openapi-scaffold" },
  "adapters": { "orval": { "module": "./tools/openapi-adapters/orval/orval.ts", "packages": ["orval"] } },
  "clients": {
    "generated/pet-client": { "url": "https://…/openapi.json", "adapter": "hey-api" },
    "booking/generated/booking-client": {
      "layout": "merged-core",
      "pipeline": { "transforms": ["./tools/openapi-transforms/strip-x.ts"], "format": true, "testing": false }
    }
  }
}
```

| Feld | Bedeutung |
|---|---|
| `clients.<pfad>` | Pfad unter `settings.libsDir`; `url` (nur `update-spec`), `adapter`, `options` (über Adapter-Defaults), `layout`, `pipeline` |
| `layout` | `merged-core`: Runtime (core) in der api-Lib, keine core-Lib. Default: types/api/core |
| `pipeline.overlays` | **experimentell**, nur mit `settings.features.overlays: true`: OpenAPI-Overlay-1.0-Dateien relativ zum Client-Ordner, in Reihenfolge. Ohne Flag: Generate scheitert mit Hinweis, verify meldet |
| `pipeline.transforms` | Code-Hooks nach `classify` (beide Presets): Workspace-Modul oder Paket, `{ module, options }` möglich. Müssen deterministisch sein (Trade-off in der Architektur-Doku) |
| `pipeline.format` | prettier (Workspace-Config) auf jede Datei; dann `.prettierrc*`, `.editorconfig`, `prettier` Inputs |
| `pipeline.testing` | `msw` / `{ "mocks": "schema-faker" \| "orval" }` (Mocks-Engine, Default `settings.testing.mocks` = `schema-faker`; `orval` **deprecated**, nächste Iteration entfernt) oder `false` (keine Testing-Lib, kein `generate-api-testing`). `orval` ist nur in seinem Modus Cache-Input |
| `adapters.<id>` | `module` (Workspace-Pfad, Paket, `builtin:<id>`), `packages`, `inputs`, `runtime`, `options` — deklarativ, das Plugin lädt keinen Adapter-Code |
| `settings` | `libsDir` (`libs`), `clientFolder` (`generated`), `outputDir` (`generated`), `aliasPrefix` (`@mo-transfer/`), `sharedScope` (`shared`), `specFiles`, `clientTags`, `partTags`, `header.lint`/`header.banner` (`{source}`, `{spec}`), `scaffold`, `toolingInputs` (`auto`/`source`/`package`/`none`), `features.overlays` (`false`), `testing.mocks` (`schema-faker`) |

Jeder Eintrag ist `json`-Input (Felder `defaultAdapter`, `settings`, ggf. `adapters.<id>`, `clients.<pfad>`) seines Targets, nie Target-Option: eine Änderung invalidiert nur diesen Client. Plugin-Optionen in `nx.json` nur für Target-Namen: `{ "plugin": "@mo-transfer/tooling-openapi/plugin", "options": { "clientTargetName": "…", "testingTargetName": "…", "updateSpecTargetName": "…" } }` — der Generator `client` schreibt sie in `targetDefaults.dependsOn` (`^<name>`) und in die Testing-Lib; verify prüft mit denselben Namen. Settings werden validiert (Pfade bleiben im Workspace); eine kaputte Datei bricht den Graphen nie (Warnung, Problem in `metadata.openapi`).

## Testing-Lib: Mocks-Engines

| | `schema-faker` (Default) | `orval` (deprecated) |
|---|---|---|
| Dateien | `schema.ts`, `http.ts`, `mocks.ts`, `model.ts`, `mock-runtime.ts`, `handlers.ts`, `index.ts` (7) | `schema.ts`, `http.ts`, `mocks.ts`, `model/**`, `handlers.ts`, `index.ts` |
| Exporte | `get<Op>ResponseMock(override?)`, `get<Op>MockHandler(override?, options?)`, `<Schema>`-Typen, `<client>Handlers/Http/BaseUrl` | dieselben (+ orvals Inline-Typen wie `GetInventory200`) |
| Daten | Media-`example(s)` → Schema-/Property-`example` → `const`/`enum` → faker nach Typ/Format/Grenzen | orval `useExamples` + faker |
| Abhängigkeiten | keine neuen (msw + faker im Test) | orval + `@orval/*` |
| Grenzen | nur lokale `$ref`s (extern → Fehler, Spec vorher bündeln), nie `null`, kein `not`/`if`/`patternProperties`/`prefixItems` | – |

`mock-runtime.ts` (~10 KiB, gitignored) wird pro Testing-Lib kopiert, statt importiert: ein Import aus dem Tooling-Paket verletzte die Boundaries (Libs importieren kein Tooling) und zöge den Paket-Einstieg in Browser-Bundles; eine gemeinsame Lib wäre workspace-spezifisch. Die Kopie importiert nur msw + faker.

## Eigener Adapter

1. Schreiben (TypeScript oder JS; eigener Ordner, der ganze Ordner wird Cache-Input):

```ts
// tools/openapi-adapters/orval/orval.ts
import { defineAdapter, listTsFiles } from '@mo-transfer/tooling-openapi/adapter';

interface OrvalOptions { client: 'angular' | 'fetch' }

export default defineAdapter<OrvalOptions>({
  apiVersion: 1,
  id: 'orval', // = Schlüssel in openapi-clients.json → adapters
  defaults: { client: 'angular' },
  optionsSchema: { type: 'object', properties: { client: { enum: ['angular', 'fetch'] } }, additionalProperties: false },
  requires: { packages: ['orval'], node: '>=22.12' },
  async generate({ specFile, outDir, options, workspaceRoot }) {
    const { generate } = await import('orval');
    await generate({ input: specFile, output: { mode: 'tags-split', target: `${outDir}/api`, schemas: `${outDir}/model`, client: options.client } }, workspaceRoot);
  },
  classify({ outDir }) {
    const files = listTsFiles(outDir);
    return {
      models: files.filter((f) => f.startsWith('model/')),
      apis: files.filter((f) => f.startsWith('api/')),
      core: [],
      entries: { types: ['model/index.ts'] },
    };
  },
});
```

2. Registrieren: `"adapters": { "orval": { "module": "./tools/openapi-adapters/orval/orval.ts", "packages": ["orval"] } }`, Client: `"adapter": "orval"` (oder `nx g …:client x --adapter=orval`).
3. Testen: `await runAdapterContract(adapter, { specFile: 'specs/x.yaml' })` (`@mo-transfer/tooling-openapi/adapter-testing`) prüft apiVersion/id, Optionen, Requirements, Klassifizierung, verwaiste Imports, Entries, Barrels.

Vertrag: `generate` schreibt **getrennte `.ts`-Dateien** nach `ctx.outDir` (eine Sammeldatei wird nicht aufgeteilt); `classify` ordnet relative Pfade `models`/`apis`/`core` zu, nicht gelistete fallen weg, Root-`index.ts` ist reserviert. Der Kontext bietet `options` (Defaults < Registrierung < Eintrag, schema-geprüft), `client`, `verbose`, `log`, `run(command, args)` (Workspace-Root, `node_modules/.bin` im PATH, Output mit `--verbose` gestreamt).

- **npm-Paket**: `"module": "@acme/openapi-orval"` — CommonJS oder ESM-only (`exports` mit `import`), Cache-Input `externalDependencies` + Graph-Kante `client → npm:@acme/openapi-orval`.
- **Ohne JS**: `"nswag": { "module": "builtin:command", "runtime": ["nswag version"], "options": { "command": "nswag", "args": ["openapi2tsclient", "/input:{specFile}", "/output:{outDir}/client.ts"], "classify": { "apis": ["**/*.ts"] } } }` (Platzhalter `{specFile}`, `{outDir}`, `{workspaceRoot}`, `{clientName}`, `{clientPath}`).
- **Laden**: `.ts` über einen eigenen Require-Hook nur für den Modulordner, nur während des Ladens (TypeScript `transpileModule`, kein Typcheck, keine `paths`; `.ts`-Helfer statisch importieren), `.mjs`/ESM über echtes `import()`, `.js`/`.cjs` über `require`. Kein `.mts`. Module müssen im Workspace liegen (Cache-Input).
- **Pakete**: `packages`/Paket-Module zählen nur als Cache-Input, wenn sie in der Root-`package.json` stehen und installiert sind; sonst `metadata.openapi.missingPackages` + Warnung (verify meldet).
- Gleiche ID wie ein Built-in ersetzt ihn.

Transform-Hook analog: `export default defineTransform({ apiVersion: 1, id, optionsSchema?, transform(files, ctx) { return files.map(…) } })` — `files` = `{ path, part, content }[]`, `ctx.preset` = `client` | `testing`.

## Publizieren

```sh
pnpm exec nx run tooling-openapi:build      # tsc → dist/packages/tooling/openapi (CJS + .d.ts) + package.json/Assets
cd dist/packages/tooling/openapi && npm pack --dry-run
```

Die dist hat keine Source Maps; ein Integrationstest (`test/integration/dist-smoke.spec.ts`) baut sie, lädt jeden Export und betreibt Plugin + Executor aus dem gebauten Paket in einem Fixture. Die Quell-`package.json` bleibt `private` und zeigt auf `.ts` (Nx lädt die Quellen im Workspace ohne Build); `scripts/prepare-dist.mts` schreibt die dist-`package.json` ohne `private`/devDependencies, Exporte auf `.js` + `types`. `executors.json` nennt Implementierungen ohne Endung (Nx löst `.ts` bzw. `.js` auf). Für einen echten Release fehlen bewusst: Ziel-Registry/`publishConfig`, `nx release`-Konfiguration (Version, Changelog), ggf. neutraler Paketname. Im Consumer: Paket + Peers (`nx`, `@nx/devkit`, `typescript`) + Generator-Pakete der genutzten Adapter installieren, Plugin in `nx.json`, `openapi-clients.json` anlegen, optional `settings.scaffold`.

## Tests

| Target | Inhalt | Dauer |
|---|---|---|
| `nx test tooling-openapi` → `unit` (`src/**/*.spec.ts`) | Stages (split, barrel in-memory, classify inkl. merged-core), Overlay + JSONPath + Flag, Glob, Registry (Built-ins, Workspace, Paket, Alias, Probleme), Loader (`.ts` mit Helfer, CJS, `.mjs`, `type: module`, TLA, ESM-only npm, Patterns, vorheriger Hook), Validierung, Runner end-to-end mit TS-Workspace-Adapter (Overlay, Transforms, Format, Fehler je Phase), Contract-Helper mit `command`, Plugin (`createNodes`, Optionen, `createDependencies`), Generator (Blueprint- und eingebauter Scaffold, merged-core, `--no-testing`, Target-Namen) | ~5 s |
| (dito) `integration` (`test/integration/**`) | echte Adapter (Jar, hey-api, nx-plugin-openapi), Testing-Preset + msw, Executoren, `update-spec`, `nx` im Fixture-Workspace; neu `pipeline-workspace.spec.ts`: TS-Workspace-Adapter mit SPI-Import, ESM-only Fake-npm-Adapter (Lockfile-Eintrag → `npm:`-Knoten + Kante), `command`, Overlay (Flag an/aus), Transform, merged-core, `testing: false`, Cache-Invalidierung je Client/Adapter/Overlay/Transform, `nx affected` | ~50 s (Java 11+) |

Coverage (V8, Summe beider Projekte) ≥ **95 %** für alle vier Metriken, sonst rot. Stand: **99,5 % Statements, 96,8 % Branches, 99,7 % Functions, 99,9 % Lines** (186 Tests, beide Mocks-Engines end-to-end inkl. msw).

```sh
pnpm exec nx test tooling-openapi
pnpm exec vitest run --config packages/tooling/openapi/vitest.config.mts --project unit
```
