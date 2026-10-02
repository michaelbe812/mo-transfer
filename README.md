# MoTransfer

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

✨ Your new, shiny [Nx workspace](https://nx.dev) is ready ✨.

[Learn more about this workspace setup and its capabilities](https://nx.dev/getting-started/tutorials/angular-monorepo-tutorial?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects) or run `npx nx graph` to visually explore what was created. Now, let's get you up to speed!

## Blueprint

Architektur: reduzierter Nx-Blueprint (übernommen aus sheriff-blue-print, Branch `feat/nx-reduced-blueprint`). Eine Nx-Lib pro Slice × Layer (`types`, `utils`, `data-access`, `state`, `ui`, `feature`/`shell`, `testing`), keine Ports, Slices und Feats geschlossen. Grenzen: Tags + `@nx/enforce-module-boundaries` in `eslint.config.mjs`. Import-Präfix `@mo-transfer/`.

- Regelwerk: [`docs/nx-reduziert.md`](docs/nx-reduziert.md)
- Umsetzung (Build, Testing/MSW, OpenAPI-Clients, Namensschema, Tooling): [`docs/nx-umsetzung.md`](docs/nx-umsetzung.md)
- Vergleich vollständig vs. reduziert: [`docs/blueprint-vergleich.html`](docs/blueprint-vergleich.html), Präsentation: [`docs/architektur.pptx`](docs/architektur.pptx)
- Tooling (Generatoren, Executoren, Verify): [`packages/tooling/README.md`](packages/tooling/README.md)

Voraussetzungen: Node 22, pnpm 10, Java 11+ (OpenAPI-Adapter `openapi-tools`).

```sh
pnpm install
pnpm exec playwright install chromium               # Browser für Vitest Browser Mode
pnpm exec nx run-many -t build lint test typecheck  # generiert OpenAPI-Clients per ^generate
pnpm verify                                         # Boundary-Fälle, Config, Tags, Clients
pnpm exec nx sync:check                             # app.routes.ts ↔ Slice-Shells, Lib-Tags
pnpm exec nx serve client
pnpm test:ui booking-state                          # Vitest UI

# neue Domain / Feat / OpenAPI-Client
pnpm exec nx g @mo-transfer/tooling-workspace:domain payment
pnpm exec nx g @mo-transfer/tooling-workspace:feat payment checkout --state --ui
pnpm exec nx g @mo-transfer/tooling-openapi:client things-client --domain=payment --spec=./things.yaml
pnpm exec nx g @mo-transfer/tooling-workspace:remove payment --force
```

Libs nicht mit `@nx/angular:library` anlegen, sondern mit den Generatoren aus `@mo-transfer/tooling-workspace` (Tags, Config, `paths`, Scope-Liste).

## Nx

To see all available targets to run for a project, run:

```sh
npx nx show project client
```

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/getting-started/tutorials/angular-monorepo-tutorial?utm_source=nx_project&amp;utm_medium=readme&amp;utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:
- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
