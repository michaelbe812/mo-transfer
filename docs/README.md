# Dokumentation

Ein Dokument pro Thema. Einstieg: [Architektur](architektur.md), dann je nach Aufgabe.

| Thema | Dokument | Inhalt |
|---|---|---|
| Architektur | [architektur.md](architektur.md) | Motivation, Grundprinzipien (Vertical Slices, keine Ports, generierte DTOs als Modell), Lib-Struktur Slice × Layer, Layer, Entscheidungen, Trade-offs |
| Modulgrenzen | [modulgrenzen.md](modulgrenzen.md) | Tag-Schema, `depConstraints`, `sameTag`-Ersatz, Mapping Sheriff → Nx, Limitierungen |
| Lib-Konfiguration | [lib-konfiguration.md](lib-konfiguration.md) | Dateien pro Lib, buildable Libs, `targetDefaults`, Targets, Vitest UI, Cache-Inputs |
| Namensschema | [namensschema.md](namensschema.md) | Namensregeln für Lib-Ordner, Dateien, Symbole; ESLint-Regeln `blueprint/*`; Bewertung der Mechanismen |
| Testing | [testing.md](testing.md) | Vitest Browser Mode, MSW, Handler-Schichten (Szenario → kuratiert → generierte Baseline), Testing-Lib pro Client, Schutz vor Production-Leaks |
| OpenAPI-Clients | [openapi-clients.md](openapi-clients.md) | Generierte Clients, Aufteilung in Libs (types/api/core/testing), `openapi-clients.json`, Targets, Generator `client`, Adapter |
| OpenAPI-Pipeline | [openapi-pipeline-architektur.md](openapi-pipeline-architektur.md) | Interna von `tooling-openapi`: Pipeline-Stages, Registry, Loader, Entscheidungen, Mocks-Engine orval → schema-faker → examples |
| OpenAPI-Spec aus .NET | [openapi-spec-aus-dotnet.md](openapi-spec-aus-dotnet.md) | Spec aus ASP.NET-Core-BE (Swashbuckle, .NET 8+): Swashbuckle-CLI vs. Laufzeit-Script, Fehler im stb-digital-Original, Nx-Target `openapi-spec`, CI mit/ohne .NET SDK |
| Tooling | [tooling.md](tooling.md) | Tooling-Libs, Generator-Aufrufe, Wächter |
| Verifikation | [verifikation.md](verifikation.md) | `pnpm verify`, Boundary-Fälle, Negativproben, `verify:nx-internals` nach `nx migrate`, CI |
| Selbst ausprobieren | [ausprobieren.md](ausprobieren.md) | Tour: Checkout, Generieren, Testen, Client anlegen, Adapter tauschen, Negativproben |
| Git-Worktrees | [git-worktrees.md](git-worktrees.md) | Nx-Cache und DB in Worktrees, Fehlerbild „flaky build“, Regel |
| Historie | [historie.md](historie.md) | Herkunft aus sheriff-blue-print, Zero-Config vs. explizite Config, Reduktion des Regelwerks, Umbau der Demo |

Weitere Quellen:

- Paket-Referenz: [`packages/tooling/README.md`](../packages/tooling/README.md) und die README jeder Tooling-Lib (z. B. [`openapi`](../packages/tooling/openapi/README.md) mit „Testing-Lib: Mocks-Engines“), [`packages/coupling-analysis`](../packages/coupling-analysis/README.md)
- Vergleich vollständig vs. reduziert: [`blueprint-vergleich.html`](blueprint-vergleich.html)
- Präsentationen: [`architektur.pptx`](architektur.pptx), [`Frontend-Testing-Strategie für Angular.pptx`](<Frontend-Testing-Strategie für Angular.pptx>)
- Agent-Skill Testing: [`skills/frontend-testing`](../skills/frontend-testing/SKILL.md)
