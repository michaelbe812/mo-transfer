# Nx-Optimierung beim Kunden messen (Playbook)

Ziel: belastbar zeigen, was feineres Slicing und der Remote Cache für Build, Test und Lint bringen, als Vorher/Nachher-Vergleich mit Zahlen, die der Kunde nachrechnen kann. Werkzeuge: [`nx-metrics`](../packages/nx-metrics/README.md) (Plugin, Bench, Report, Graph), [`nx-metrics-collector`](../packages/nx-metrics-collector/README.md) (Postgres + Grafana), [`nx-remote-cache-custom`](../packages/nx-remote-cache-custom/README.md) (`/metrics`).

## Prinzipien

- **Erst messen, dann umbauen.** Ohne Baseline gibt es kein Vorher.
- **Ein Effekt pro Schritt.** Slicing und Remote Cache nacheinander einführen (oder den Remote Cache per `NX_SKIP_REMOTE_CACHE` schalten), sonst sind die Effekte nicht trennbar.
- **p50 und p90, nie den Durchschnitt.** Ausreißer (kalte Agents, Netz) verzerren Mittelwerte.
- **Zwei Quellen:** Live-Daten aus CI (Realität, verrauscht) und Bench (reproduzierbar, künstlich). Beide müssen in dieselbe Richtung zeigen.
- **Störfaktoren festhalten:** Nx-/Node-Upgrades, Runner-Wechsel, Codewachstum. Im Zweifel normalisieren (pro Projekt, pro Task).

## Ablauf

| Phase | Dauer | Was |
|---|---|---|
| 0. Setup | 1 Tag | Plugin in `nx.json`, Collector + Grafana, CI sammelt Records, Bench-Config |
| 1. Baseline | 2–4 Wochen | CI-Daten laufen ein, Baseline-Bench, Graph- und Affected-Replay-Snapshot |
| 2. Umbau Slicing | – | Bench nach jedem größeren Schritt, `graph` pro Stand |
| 3. Remote Cache | – | erst Read-only für PRs, dann CI-Writer; `fresh-agent` vs. `no-remote` benchen |
| 4. Nachher | 2–4 Wochen | gleicher Zeitraum wie Baseline, Report + Vergleich |
| 5. Bericht | 1 Tag | Zahlen, ROI, Empfehlungen (Vorlage unten) |

## Phase 0: Setup

1. **Plugin** (eine Zeile in `nx.json`, braucht Nx ≥ 20.5):
   ```jsonc
   "plugins": [{ "plugin": "@berger-engineering/nx-metrics/plugin" }]
   ```
   Schreibt `.nx/metrics/runs.jsonl`, `.nx/metrics` in `.gitignore`. Prüfen: `NX_DAEMON=false NX_METRICS_CONSOLE=summary nx lint <projekt>` zeigt eine `[nx-metrics]`-Zeile.
2. **Collector + Grafana**: [Compose-Stack](../packages/nx-metrics-collector/README.md) bzw. beim Kunden vorhandenes Grafana/Postgres. Prometheus scrapt den Cache-Server, sobald er läuft.
3. **CI**: jede Pipeline schickt ihre Läufe, entweder direkt oder per Artefakt + `push`:
   ```yaml
   env:
     NX_METRICS_ENDPOINT: ${{ vars.NX_METRICS_ENDPOINT }}   # https://…/v1/runs
     NX_METRICS_TOKEN: ${{ secrets.NX_METRICS_TOKEN }}
     NX_METRICS_LABEL: ci:${{ github.event_name }}          # ci:pull_request / ci:push
   ```
   Kein Netz zum Collector? `.nx/metrics/runs.jsonl` als Artefakt hochladen und nightly `nx-metrics push --input …` laufen lassen (idempotent).
4. **Bench-Config** `nx-metrics.bench.json` im Kunden-Repo: die echten CI-Targets, eine Leaf-Lib und eine Shared-Lib als `touch` (siehe [Beispiel](../nx-metrics.bench.json)). Dedizierter Runner oder immer dieselbe Maschine.

## Phase 1: Baseline

```sh
nx-metrics bench --name baseline --iterations 10                  # auf dem festen Runner
nx-metrics graph --out reports/baseline                           # Blast Radius, Fan-in/out, Kette
nx-metrics affected --commits 200 --with-target test --out reports/baseline
```

Baseline-Commit notieren (`git rev-parse HEAD`). Später kann man ihn jederzeit erneut benchen: `nx-metrics bench --ref <sha> --name baseline`, gleiche Config, gleiche Maschine wie der Nachher-Lauf. Das ist fairer als alte Zahlen von einem anderen Tag.

## Phase 2/3: Umbau

- Nach jedem Schritt: `nx-metrics bench --name <schritt>` + `nx-metrics compare` gegen die Baseline. `noise` heißt: Unterschied kleiner als die Streuung, mehr Iterationen.
- Slicing lohnt sich, wenn **Blast Radius (in % des Workspaces)** und **Affected-Ratio** sinken. Mehr Projekte allein sind kein Gewinn. Dazu im Bench das Szenario `graph` beobachten: viele kleine Projekte verteuern die Graph-Berechnung.
- Remote Cache: `fresh-agent` (Treffer nur remote) gegen `no-remote` zeigt die Obergrenze. Im Live-Betrieb zählt der Remote-Anteil an den Treffern im Dashboard. Server-Seite: Hit-Rate unter lokalen Misses, Latenz, Fehler (401/403/413).

## Phase 4: Nachher

Gleiche Dauer wie die Baseline, gleiche Pipelines.

```sh
nx-metrics bench --ref <baseline-sha> --name vorher
nx-metrics bench --ref HEAD --name nachher
nx-metrics compare tmp/nx-metrics/vorher-*/bench.json tmp/nx-metrics/nachher-*/bench.json --out reports/bench-vergleich.md
nx-metrics report --input ci-vorher/*.jsonl --group-by week --ci-only --rate 90 --ci-price 0.008 --out reports/vorher
nx-metrics report --input ci-nachher/*.jsonl --group-by week --ci-only --rate 90 --ci-price 0.008 --out reports/nachher
```

Oder direkt aus Grafana: Zeitraum auf Baseline bzw. Nachher stellen, Wo = `ci`.

## KPIs

| KPI | Quelle | Zeigt |
|---|---|---|
| CI-Laufdauer p50/p90 je PR | Dashboard „Laufdauer“, `report --ci-only` | Gesamtwirkung |
| Tasks je PR, davon Misses | Dashboard „Tasks pro Tag“ | Slicing (weniger affected) |
| Affected-Ratio je Commit | `nx-metrics affected` | Slicing |
| Blast Radius (Ø, p90, Top 10) | `nx-metrics graph` | Slicing (Struktur) |
| Hit-Rate gesamt / remote | Dashboard, `report` | Remote Cache |
| Gesparte Zeit, € | Dashboard „Ersparnis“, `report --rate --ci-price` | ROI |
| Miss-Dauer je Target p50/p90 | Dashboard „Targets“ | wo optimieren |
| Server: Hit-Rate, Latenz p95, Fehler | Dashboard „Cache-Server“ | Betrieb Remote Cache |
| Bench: cold / warm / fresh-agent / pr-leaf / pr-shared | `bench` + `compare` | reproduzierbarer Beleg |

## Fallstricke

- **Daemon:** lokal läuft der Hook im Daemon, dessen Env (Label, Tags) kann veraltet sein (`envReliable: false`). Lokale Läufe nach Woche/Branch auswerten, nicht nach Label. Auf CI ist der Daemon aus.
- **Dirty Tree im Bench:** `affected --base=HEAD` zählt uncommittete Änderungen mit (`nx.json` → alles affected). `bench --ref` vermeidet das.
- **Geteilte Runner:** Bench nur auf dedizierten oder gleich großen Agents. Netzteil statt Akku.
- **Falsche Cache-Treffer:** eine hohe Hit-Rate ist nur gut, wenn die Inputs stimmen (`namedInputs`). Stichprobe: `--skip-nx-cache`-Lauf und Artefakte vergleichen.
- **Gesparte Zeit ist eine Schätzung:** Median-Miss desselben Tasks minus Hit-Dauer. Lokal eine Obergrenze (nicht jede Minute war Wartezeit). Im Bericht so benennen.
- **Nx < 23.1.1 und Remote Cache:** jeder wartende Miss wird pro Scheduling-Runde erneut abgefragt (GET-Misses ≫ Tasks, Server-Last, verfälscht die Server-Hit-Rate). Vor der Messung Nx auf ≥ 23.1.1 heben.
- **Codewachstum:** wächst das Repo während der Messung stark, Werte pro Projekt bzw. pro Task vergleichen.

## Vorlage Kundenbericht

1. **Ausgangslage** (Baseline-Zeitraum, Repo-Größe: Projekte, Kanten, Blast Radius)
2. **Maßnahmen** (Slicing-Schritte, Remote Cache, Zeitpunkte)
3. **Ergebnis CI**: Laufdauer p50/p90 vorher → nachher, Tasks/Misses je PR, Hit-Rate gesamt/remote
4. **Ergebnis Bench**: Tabelle aus `compare` (nur Zeilen ohne `noise` als Beleg)
5. **Struktur**: Blast Radius und Affected-Ratio vorher → nachher, größte verbleibende Hotspots (Top-Blast-Radius-Liste)
6. **ROI**: gesparte CI-Minuten × Preis, gesparte Entwicklerzeit × Satz (als Obergrenze), Betriebskosten Remote Cache dagegen
7. **Nächste Schritte**: langsamste Targets, Hotspots im Graph, Cache-Inputs
