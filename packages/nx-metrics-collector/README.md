# @berger-engineering/nx-metrics-collector

Sammelt die Run-Records des Plugins [`@berger-engineering/nx-metrics`](../nx-metrics/README.md) zentral in Postgres und zeigt sie in Grafana, zusammen mit den Prometheus-Metriken des Cache-Servers [`nx-remote-cache-custom`](../nx-remote-cache-custom/README.md). Eigenständig (Node + `pg`), ein Docker-Image, ein Compose-Stack.

```
nx (Plugin) ──POST /v1/runs──► Collector ──► Postgres ◄── Grafana ──► Prometheus ──scrape /metrics──► Cache-Server
CI-Artefakt ──nx-metrics push──┘
```

## Lokal starten

```sh
docker compose -f packages/nx-metrics-collector/docker/compose.yml up -d --build
# Grafana    http://localhost:3300  (admin/admin, anonym lesend) → Dashboard „Nx Metrics“ (Startseite)
# Collector  http://localhost:4000  Token metrics-token
# Prometheus http://localhost:9090  scrapt host.docker.internal:3100 (Cache-Stack: nx run nx-remote-cache-custom:stack)
# Postgres   localhost:5433  nxmetrics/nxmetrics, Grafana liest als Rolle grafana (nur SELECT)

export NX_METRICS_ENDPOINT=http://localhost:4000/v1/runs NX_METRICS_TOKEN=metrics-token
nx affected -t lint test build                 # Plugin schickt jeden Lauf direkt
nx-metrics push --input .nx/metrics/runs.jsonl  # oder nachträglich (CI-Artefakte), idempotent
```

## API

| Methode | Pfad | Antworten |
|---|---|---|
| `POST` | `/v1/runs` | ein Record (JSON), ein Array oder JSON Lines → 200 `{ inserted, duplicates }`, 400 (ungültig, mit Grund), 401, 413 |
| `GET` | `/health` | 200, ohne Auth |

Akzeptiert `RunRecord` Schema 1. Unbekannte Felder werden ignoriert, die `runId` ist Primärschlüssel: doppelt gepushte Läufe zählen einmal.

| Env | Default | |
|---|---|---|
| `DATABASE_URL` | – | `postgres://…`, Pflicht (außer `STORE=memory`) |
| `COLLECTOR_TOKENS` | leer | kommagetrennt, Bearer; leer → offen |
| `COLLECTOR_MAX_BODY_BYTES` | 10 MiB | pro Request (`push` schickt 200 Records je Request) |
| `PORT` / `HOST` | 4000 / 0.0.0.0 | |
| `STORE` | postgres | `memory` für Tests |
| `COLLECTOR_READONLY_ROLE` / `COLLECTOR_READONLY_PASSWORD` | – | legt beim Start eine Login-Rolle nur mit `SELECT` an (Grafana); für managed Postgres ohne Init-Skripte |

Das Schema legt der Collector beim Start idempotent an (`create … if not exists`, Views `create or replace`).

## Datenmodell

- `runs`: ein Eintrag je `nx`-Aufruf (Zeit, Befehl, Label, Tags als `jsonb`, CI/Branch/SHA, Maschine, Nx-Version, Remote-Cache-Modus, Zählung je Cache-Ergebnis, Hit-Rate)
- `tasks`: ein Eintrag je Task (Projekt, Target, Hash, Status, `cache`, Dauer)
- Views `task_miss_baseline` / `target_miss_baseline`: Median der erfolgreichen Misses je Task bzw. Target
- View `task_facts`: Task + Laufkontext + `saved_ms` (Hit: Median-Miss desselben Tasks, sonst des Targets, minus Dauer des Hits)

Eigene Auswertungen einfach per SQL, z. B. Hit-Rate je Woche und Branch:

```sql
select date_trunc('week', started_at) as woche, git_branch,
       sum(local_hit + remote_hit)::float / nullif(sum(local_hit + remote_hit + miss), 0) as hit_rate
from runs where ci group by 1, 2 order by 1;
```

## Dashboard „Nx Metrics“

Variablen: **Wo** (all/ci/local), **Branch**, **€/Dev-Stunde**, **€/CI-Minute**.

- Kennzahlen: Läufe, Hit-Rate, Remote-Anteil, gesparte Zeit, Ersparnis Entwickler (gesparte lokale Stunden × Satz, Obergrenze), Ersparnis CI (gesparte CI-Minuten × Preis)
- Verläufe pro Tag: Hit-Rate lokal/remote, Laufdauer p50/p90, gesparte Zeit (CI/lokal), Tasks nach Cache-Ergebnis
- Tabellen: Targets (Miss p50/p90, Hit-Rate, gespart), langsamste Tasks, letzte Läufe
- Cache-Server (Prometheus): Requests/s nach Ergebnis, Server-Hit-Rate, GET-Latenz p50/p95, Durchsatz, Eintragsgröße p50/p95, Abgelehnt/Fehler

Quelle: `scripts/build-dashboard.mjs` erzeugt `docker/grafana/dashboards/nx-metrics.json`. Änderungen dort machen, dann `node packages/nx-metrics-collector/scripts/build-dashboard.mjs`. Im UI geänderte Dashboards überschreibt das Provisioning beim nächsten Start nicht (`allowUiUpdates`), für Dauerhaftes das Skript anpassen.

## Produktivbetrieb

Azure (Container Apps, Postgres Flexible Server, Grafana-Image): fertig in [`deploy/azure`](../../deploy/azure/README.md). Eigener Server: Compose-Stack oben mit echten Passwörtern. Grafana-Image mit Dashboard: `docker build -t nx-metrics-grafana packages/nx-metrics-collector/docker/grafana` (Datasources per Env `NX_METRICS_PG_*`, `NX_CACHE_PROMETHEUS_URL`).

Von Hand:


1. Postgres (managed, z. B. Azure Database for PostgreSQL), eigener User für den Collector, Rolle `grafana` nur mit `SELECT` (`COLLECTOR_READONLY_ROLE`/`_PASSWORD` oder `docker/postgres/init.sql`).
2. Collector als Container hinter TLS (`https://nx-metrics.<firma>.de`), `COLLECTOR_TOKENS` aus dem Secret-Store. CI bekommt `NX_METRICS_ENDPOINT` + `NX_METRICS_TOKEN` als Variablen.
3. Grafana (vorhandenes nehmen, wenn es eins gibt): Datasources wie in `docker/grafana/provisioning/datasources/datasources.yml`, Dashboard-JSON importieren.
4. Prometheus: Scrape-Job je Cache-Instanz (`docker/prometheus/prometheus.yml`), bei `NX_CACHE_METRICS_TOKEN` mit `authorization.credentials`.
5. Aufbewahrung: Tasks wachsen am schnellsten (≈ Tasks je Lauf × Läufe). Ältere Rohdaten z. B. nach 180 Tagen löschen: `delete from runs where started_at < now() - interval '180 days'` (Tasks per `on delete cascade`).

## Tests

```sh
nx run nx-metrics-collector:test                       # Vertrag, Row-Mapping, HTTP-API (In-Memory-Store)
NX_METRICS_IT_DATABASE_URL=postgres://nxmetrics:nxmetrics@localhost:5433/nxmetrics nx run nx-metrics-collector:test   # + echtes Postgres
```
