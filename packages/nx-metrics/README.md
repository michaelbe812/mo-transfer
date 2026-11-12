# @berger-engineering/nx-metrics

Misst die Wirkung von Nx-Architekturarbeit (feinere Slices, Remote Cache) auf Build, Test und Lint, systematisch und vergleichbar vorher/nachher. Eigenständig, keine Annahmen über Workspace-Konventionen, Nx ≥ 20.5.

| Baustein | Frage | Befehl |
|---|---|---|
| **Plugin** (`postTasksExecution`) | Was passiert real in CI und lokal? Dauer, Hit-Rate lokal/remote, gesparte Zeit | läuft bei jedem `nx run/run-many/affected` |
| **Bench** | Reproduzierbar: cold, warm, frischer Agent, PR-Szenarien | `nx-metrics bench` / `compare` |
| **Report** | Aggregat über gesammelte Läufe (Woche, Branch, CI vs. lokal) | `nx-metrics report` |
| **Cache-Größe** | Wie groß sind die Cache-Einträge je Projekt/Target? | `nx-metrics cache-size` |
| **Live** | Was hat der letzte Lauf gemacht? | `nx-metrics watch` / `last`, `NX_METRICS_CONSOLE=summary` |
| **Collector** | Läufe zentral sammeln, Grafana-Dashboard, ROI | `nx-metrics push`, [`nx-metrics-collector`](../nx-metrics-collector/README.md) |
| **Graph** | Wie weit strahlt eine Änderung (Blast Radius, Fan-in/out, Kettenlänge)? | `nx-metrics graph` |
| **Affected-Replay** | Wie viele Projekte trifft ein typischer Commit, alte vs. neue Struktur? | `nx-metrics affected` |

## Plugin

```jsonc
// nx.json
"plugins": [
  { "plugin": "@berger-engineering/nx-metrics/plugin", "options": { "outputFile": ".nx/metrics/runs.jsonl" } }
]
```

Im Quell-Repo: `"./packages/nx-metrics/src/plugin.ts"` (Nx transpiliert selbst). `.nx/metrics` in `.gitignore`.

Pro `nx`-Aufruf eine Zeile JSON (`RunRecord`, `schema: 1`): Befehl, Start/Ende, Git-SHA/Branch, CI-Provider/Pipeline/Job (GitHub, GitLab, Azure DevOps, Jenkins, Bitbucket), Maschine, Nx-Version, Remote-Cache-Modus (`enabled`/`disabled`/`skipped`) und je Task: Projekt, Target, Hash, Nx-Status, `cache` (`local-hit`/`remote-hit`/`miss`/`not-cacheable`/`not-run`), Dauer.

| Option / Env | Wirkung |
|---|---|
| `outputFile` / `NX_METRICS_FILE` | JSONL-Datei (relativ zum Root), `false`/`off` = keine Datei |
| `endpoint` / `NX_METRICS_ENDPOINT` | zusätzlich POST je Lauf an einen Collector (JSON), `timeoutMs` default 3000 |
| `NX_METRICS_TOKEN` | Bearer-Token für den Collector, nur per Env, nie in `nx.json` |
| `console` / `NX_METRICS_CONSOLE` | `summary`: eine Zeile pro Lauf auf stderr, `json`: der ganze Record, `off` (Default) |
| `NX_METRICS_LABEL` | freier Name des Laufs (z. B. `ci:pr`, `nightly`) |
| `tags` / `NX_METRICS_TAGS="team=checkout,runner=large"` | Zusatz-Dimensionen für Auswertungen |
| `disabled` / `NX_METRICS_DISABLED=true` | aus |

Fehler beim Messen brechen nie den Build ab, sie erscheinen nur als Warnung `[nx-metrics]`.

**Wo landet der Record?** Default `<workspace>/.nx/metrics/runs.jsonl` (append, eine Zeile pro `nx`-Aufruf), umstellbar mit `outputFile` / `NX_METRICS_FILE`. Zusätzlich an den Collector, wenn `endpoint` / `NX_METRICS_ENDPOINT` gesetzt ist.

**Im Terminal sehen:**

```sh
NX_METRICS_CONSOLE=summary nx affected -t test
# [nx-metrics] affected -t test · 12 tasks: 3 miss, 8 local, 1 remote (75.0 % hit) · 4.21 s → .nx/metrics/runs.jsonl
nx-metrics watch        # zweites Terminal: eine Zeile je Lauf, live (funktioniert auch mit Daemon)
nx-metrics last --count 5
```

`NX_METRICS_CONSOLE` wirkt nur ohne Daemon (CI, `NX_DAEMON=false`): mit Daemon landet die Ausgabe in `.nx/workspace-data/d/daemon.log`, und das Env des Daemons gilt. `watch` liest die Datei und ist deshalb die daemon-feste Variante.

**Daemon-Falle:** Mit Nx-Daemon läuft der Hook im Daemon-Prozess. Dann sind `process.env` des Daemons und damit Label, Tags und CI-Variablen eventuell veraltet. Das Feld `envReliable` sagt, ob den Env-Werten zu trauen ist. Auf CI schaltet Nx den Daemon per Default ab, die Bench setzt `NX_DAEMON=false`. Task-Daten (Dauer, Cache) sind immer korrekt.

**Dauer:** `durationMs` des Laufs ist die Task-Phase laut Nx (ohne Node-Start und Graph-Berechnung). Die Wanduhr misst die Bench.

### In CI einsammeln

In diesem Repo fertig: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) (affected + Records als Artefakt, Job-Summary, optional Collector und Remote Cache über Repo-Variablen) und [`.github/workflows/nx-bench.yml`](../../.github/workflows/nx-bench.yml) (nightly Bench per `--ref HEAD`, optional Baseline-Vergleich, Graph-/Affected-Snapshot).

```yaml
# GitHub Actions
- run: npx nx affected -t lint test build
  env:
    NX_METRICS_LABEL: ci:${{ github.event_name }}
- uses: actions/upload-artifact@v4
  if: always()
  with: { name: nx-metrics-${{ github.run_id }}-${{ github.job }}, path: .nx/metrics/runs.jsonl }
```

```yaml
# Azure DevOps
- script: npx nx affected -t lint test build
  env: { NX_METRICS_LABEL: ci:$(Build.Reason) }
- publish: .nx/metrics/runs.jsonl
  artifact: nx-metrics-$(System.JobAttempt)-$(System.JobName)
  condition: always()
```

Artefakte einsammeln und in den Collector schieben (idempotent pro Lauf, doppeltes Pushen zählt nicht doppelt):

```sh
NX_METRICS_TOKEN=<token> nx-metrics push --input runs.jsonl --endpoint https://nx-metrics.example.com/v1/runs
```

Oder ohne Collector: Artefakte regelmäßig einsammeln (z. B. Nightly-Job über die CI-API) und `nx-metrics report --input a.jsonl --input b.jsonl …` laufen lassen, oder mit `NX_METRICS_ENDPOINT` direkt in einen Collector (Postgres, Loki, Influx, Grafana) schreiben. Der `RunRecord` ist flach genug für eine Tabelle `runs` + `tasks`.

## Bench

```sh
nx-metrics bench --name baseline                 # vor dem Umbau, Config: <repo>/nx-metrics.bench.json
# … Umbau (Slices, Remote Cache) …
nx-metrics bench --name after-slicing
nx-metrics compare tmp/nx-metrics/baseline-*/bench.json tmp/nx-metrics/after-slicing-*/bench.json --out vergleich.md
nx-metrics bench --scenario pr-leaf,pr-shared --iterations 10   # Auswahl

# vorher/nachher ohne Umschalten: beide Stände als saubere Worktrees, Config jeweils aus dem aktuellen Checkout
nx-metrics bench --ref <baseline-commit> --name vorher
nx-metrics bench --ref HEAD --name nachher
nx-metrics compare tmp/nx-metrics/vorher-*/bench.json tmp/nx-metrics/nachher-*/bench.json
```

**`--ref <rev>`**: detached Worktree unter `<out>/worktree`, Install aus dem Lockfile (`pnpm install --frozen-lockfile`, `npm ci`, yarn, bun; `--install "<cmd>"` oder `none`), Plugin per absolutem Pfad in dessen `nx.json` eingetragen und **dort committet** (sonst wäre `nx.json` geändert und `affected` träfe alles), danach wird der Worktree entfernt (`--keep-worktree` behält ihn). Der alte Stand braucht Nx ≥ 20.5 für Cache-Zahlen, sonst gibt es nur die Wanduhr. Liegen Touch-Dateien nach dem Umbau woanders, braucht es je Stand eine eigene Config (`--config`).

```jsonc
{
  "iterations": 5,          // gemessene Iterationen je Szenario
  "warmup": 1,              // ungemessene Vorläufe (füllen Cache/Graph)
  "env": { "NX_DAEMON": "false", "NX_TUI": "false" },   // Default
  "scenarios": [
    { "name": "cold",        "command": "nx run-many -t lint test build", "cache": "none" },
    { "name": "warm-local",  "command": "nx run-many -t lint test build", "cache": "keep" },
    { "name": "fresh-agent", "command": "nx run-many -t lint test build", "cache": "fresh-agent" },
    { "name": "no-remote",   "command": "nx run-many -t lint test build", "cache": "fresh-agent", "remoteCache": false },
    { "name": "pr-leaf",     "command": "nx affected -t lint test build --base=HEAD", "touch": ["libs/booking/ui/src/booking-card.ts"] },
    { "name": "pr-shared",   "command": "nx affected -t lint test build --base=HEAD", "touch": ["libs/shared/utils/src/format-date.ts"] },
    { "name": "graph",       "command": "nx show projects --json", "cache": "fresh-agent" }
  ]
}
```

| Feld | Bedeutung |
|---|---|
| `cache: "keep"` (Default) | Nx-State bleibt zwischen Iterationen, nach dem Warmup also warmer lokaler Cache |
| `cache: "none"` | `NX_SKIP_NX_CACHE=true`, reine Ausführungszeit |
| `cache: "fresh-agent"` | vor jeder Iteration lokaler Cache **und** Workspace-Daten gelöscht, wie ein frischer CI-Agent: Treffer nur aus dem Remote Cache, Graph wird neu berechnet |
| `remoteCache: false` | `NX_SKIP_REMOTE_CACHE=true`, isoliert den Effekt des Remote Cache |
| `touch: [dateien]` | vor jeder Iteration ein eindeutiger Kommentar angehängt, damit sich die Hashes wie in einem echten PR ändern. Danach (auch bei Ctrl+C) wiederhergestellt. JSON geht nicht (keine Kommentare). |
| `env`, `iterations`, `warmup`, `description` | pro Szenario |

Ergebnis in `<out>` (default `tmp/nx-metrics/<name>-<zeit>`): `bench.md`, `bench.json`, `runs.jsonl` (Plugin-Records), `logs/`. Pro Szenario: median/p90/min/max/stddev der Wanduhr, Tasks/Misses je Iteration, Hit-Rate lokal/remote und die langsamsten Misses. Ohne registriertes Plugin wird nur die Wanduhr gemessen. `compare` markiert Deltas kleiner als die Summe der Standardabweichungen als `noise` und warnt bei anderer Maschine, Nx- oder Node-Version oder einem dirty Tree.

**Isolation:** Jedes Szenario bekommt einen eigenen Nx-State unter `<out>/nx-state/<szenario>` (`NX_CACHE_DIRECTORY` **und** `NX_WORKSPACE_DATA_DIRECTORY`, nur eins von beiden erzeugt Phantom-Hits). Der Cache der Entwickler bleibt unberührt. `--workspace-state` nutzt den echten State, dann ist `fresh-agent` verboten.

**Fair messen:** derselbe Runner-Typ bzw. dieselbe Maschine, Netzteil statt Akku, keine anderen Builds parallel, sauberer Working Tree (`affected --base=HEAD` zählt uncommittete Änderungen mit, ein geändertes `nx.json` macht alles affected). Für Kunden mindestens 5, besser 10 Iterationen und p90 berichten. Für „vorher“ den Baseline-Commit in einem eigenen Worktree auschecken und dieselbe Config verwenden. Liegen die Touch-Dateien nach dem Umbau woanders, braucht es je Stand eine Config mit äquivalenten Dateien.

## Report

```sh
nx-metrics report                                  # .nx/metrics/runs.jsonl, nach ISO-Woche
nx-metrics report --input ci/*.jsonl --group-by ci --since 2026-10-01 --out reports/okt
nx-metrics report --group-by remote-cache --command affected
```

Pro Gruppe (`week`, `branch`, `ci`, `label`, `remote-cache`, `none`): Läufe, fehlgeschlagene Läufe, Laufdauer p50/p90, Tasks, Misses, Hit-Rate lokal/remote und **gesparte Zeit (geschätzt)**. Die Schätzung: pro Hit der Median der Miss-Dauer desselben Tasks in den Eingabedaten (ersatzweise des Targets) minus der Dauer des Hits. Dazu je Target die Miss-Dauer p50/p90. ROI mit `--rate <€/Dev-Stunde>` und `--ci-price <€/CI-Minute>`: gesparte Zeit lokaler Läufe × Stundensatz (Obergrenze, nicht jede Minute ist Wartezeit) plus gesparte CI-Minuten × Preis (Maschinenzeit). Dasselbe rechnet das Grafana-Dashboard des Collectors live.

```sh
nx-metrics report --input ci/*.jsonl --rate 90 --ci-price 0.008
```

## Graph und Affected-Replay

```sh
nx-metrics graph --out reports/graph               # Projekte, Kanten, Dichte, Fan-in/out, Blast Radius, längste Kette
nx-metrics affected --commits 100 --with-target test
```

- **Blast Radius** = alle Projekte, die transitiv von einem Projekt abhängen, also was `affected` bei einer Änderung baut. Feineres Slicing lohnt sich, wenn der mittlere Blast Radius (in % des Workspaces) sinkt. Eine steigende Projektzahl allein ist kein Gewinn.
- **Affected-Replay** spielt die letzten N Commits (first parent) gegen den **aktuellen** Graphen ab: `nx show projects --affected --base=<sha>~1 --head=<sha>`. Auf altem und neuem Stand mit demselben Commit-Bereich ausführen, dann ergibt sich die Affected-Ratio vorher/nachher. Grenze: Dateien, die es nach einem Umzug nicht mehr gibt, fallen heraus. Für den alten Stand deshalb im Worktree des alten Commits laufen lassen.

## Cache-Größe

```sh
nx-metrics cache-size                  # alle Targets
nx-metrics cache-size --target build --out reports/cache
```

Liest Nx' Workspace-DB (`.nx/workspace-data/*.db`, respektiert `NX_WORKSPACE_DATA_DIRECTORY`): je Projekt/Target Anzahl Einträge, Größe des neuesten Eintrags (`latest`, aktueller Code-Stand), größter Eintrag (`max`, relevant für `NX_CACHE_MAX_ENTRY_BYTES` des Cache-Servers) und Summe. Größe = Outputs + Terminal-Ausgabe. Nur lokaler Cache, also vorher bauen. Ein Remote-Eintrag ist das Archiv derselben Dateien. Braucht `node:sqlite` (Node ≥ 22.5).

## Aus den Quellen

```sh
pnpm nx-metrics <command>        # im Quell-Repo (node --experimental-strip-types, Node ≥ 22.6)
nx run nx-metrics:build          # dist/ für npm pack
```

## Grenzen

- Remote-Cache-Latenz und Datenmengen sieht der Hook nicht direkt (nur `remote-hit` vs. `miss` und die Task-Dauer). Latenz, Bytes und Fehlerquote liefert der Cache-Server: [`nx-remote-cache-custom`](../nx-remote-cache-custom/README.md) unter `GET /metrics` (Prometheus), im Grafana-Dashboard des Collectors.
- Falsche Treffer (Cache-Hit trotz falscher Inputs) erkennt das Tool nicht. Dafür gelegentlich `--skip-nx-cache`-Läufe gegen gecachte Artefakte vergleichen.
- `nx show projects` und `nx graph` führen keine Tasks aus, erzeugen also keinen Record. Das Szenario `graph` misst deshalb nur die Wanduhr.
