# @berger-engineering/nx-remote-cache-custom

Self-hosted Remote Cache für Nx: kleiner HTTP-Server (Node, TypeScript, [Effect 4](https://effect.website)), der die [Nx custom remote cache spec](https://nx.dev/docs/kb/self-hosted-caching) (OpenAPI 1.0.0) umsetzt und die Task-Outputs in **MinIO/S3** oder **Azure Blob Storage** ablegt.

**Warum nicht `@nx/s3-cache` / `@nx/azure-cache`:** seit 21.05.2026 deprecated, betroffen von CVE-2025-36852 (CREEP, Cache Poisoning): ein Credential für Lesen + Schreiben, ein PR kann ein manipuliertes Artefakt hochladen, das `main` später als Cache-Treffer nimmt. Dieser Server setzt die Gegenmaßnahmen um:

| Maßnahme            | Umsetzung                                                                                                                                                                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rollen + Namespaces | siehe [Rollen](#rollen-und-namespaces): nur CI schreibt `trusted/`, Entwickler schreiben `dev/`, CI liest `dev/` nie. `PUT` mit Read-only-Token → 403                                                          |
| write-once          | bestehender Hash → 409, nie überschrieben. Atomar im Backend: S3/MinIO `PutObject` mit `If-None-Match: *`, Azure Commit der Block-Liste mit `ifNoneMatch: *` (auch bei parallelen Writern gewinnt genau einer) |
| Pfad-Sicherheit     | Hash nur `[A-Za-z0-9_-]{1,256}` → 400                                                                                                                                                                          |
| Größenlimit         | `NX_CACHE_MAX_ENTRY_BYTES` (Default 2 GiB) → 413                                                                                                                                                               |

Client-seitig: Nx ≥ 22.7.7 bzw. ≥ 23.0.2 (Fix für CVE-2026-71476, Zip-Slip beim Entpacken; im Repo: 23.1.0).

## API

| Methode | Pfad               | Antworten                                                                          |
| ------- | ------------------ | ---------------------------------------------------------------------------------- |
| `GET`   | `/v1/cache/{hash}` | 200 (`application/octet-stream`), 401, 404                                         |
| `PUT`   | `/v1/cache/{hash}` | 200, 401, 403 (Read-only-Token), 409 (existiert), 411 (ohne `Content-Length`), 413 |
| `GET`   | `/health`          | 200 `ok`, ohne Auth (Probes)                                                       |
| `GET`   | `/metrics`         | 200 Prometheus-Text, 401 (nur wenn `NX_CACHE_METRICS_TOKEN` gesetzt)               |

Auth: `Authorization: Bearer <token>`. Bodies werden gestreamt (kein Puffern im Speicher). Ein Treffer trägt `x-nx-cache-namespace: trusted|dev`.

## Rollen und Namespaces

| Rolle       | Token-Variable              | liest                   | schreibt   | für                   |
| ----------- | --------------------------- | ----------------------- | ---------- | --------------------- |
| `ci`        | `NX_CACHE_CI_TOKENS`        | `trusted/`              | `trusted/` | CI auf `main`/Release |
| `dev`       | `NX_CACHE_DEV_TOKENS`       | `dev/`, dann `trusted/` | `dev/`     | Entwickler-Rechner    |
| `read-only` | `NX_CACHE_READ_ONLY_TOKENS` | `trusted/`              | – (403)    | PR-Pipelines          |

Objekt-Keys: `<STORAGE_KEY_PREFIX><namespace>/<hash>`.

- Entwickler bekommen alle CI-Treffer und teilen ihre eigenen Builds untereinander.
- Was auf einem Laptop gebaut wurde, landet nie in einem CI-Build: gleicher Hash heißt nicht gleiches Artefakt (andere Node-Version, nicht deklarierte Env-Variablen/Dateien), und ein geleakter Dev-Token kann `trusted/` nicht vergiften.
- Ein Dev-Upload eines Hashs, der schon in `trusted/` liegt, wird mit 409 übersprungen. CI baut einen Hash, der nur in `dev/` liegt, selbst und legt ihn in `trusted/` ab.
- PR-Pipelines nutzen `read-only`, nicht `dev`: sonst könnte ein PR über einen Dev-Eintrag gegen fremde Artefakte grün werden.

## Nx anbinden

Nur Umgebungsvariablen, keine Änderung an `nx.json`:

```sh
export NX_SELF_HOSTED_REMOTE_CACHE_SERVER=https://nx-cache.example.com
export NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN=<token>
```

CI (Beispiel GitHub Actions): CI-Token nur auf `main`, PRs (auch aus Forks) nur Read-only:

```yaml
env:
  NX_SELF_HOSTED_REMOTE_CACHE_SERVER: ${{ vars.NX_CACHE_URL }}
  NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN: ${{ github.ref == 'refs/heads/main' && secrets.NX_CACHE_CI_TOKEN || secrets.NX_CACHE_RO_TOKEN }}
```

Azure DevOps analog: CI-Token in einer Variable Group, die nur die `main`-Pipeline (Branch-Control) sieht.

Entwickler: eigener Dev-Token pro Person (einzeln widerrufbar, `NX_CACHE_DEV_TOKENS` ist eine Liste), einmalig in `~/.zshrc` oder per direnv, nie im Repo:

```sh
export NX_SELF_HOSTED_REMOTE_CACHE_SERVER=https://nx-cache.example.com
export NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN=<persönlicher dev-token>
```

Token erzeugen: `openssl rand -base64 32`.

Prüfen: `nx reset && nx run <projekt>:build` zeigt `[remote cache]`. Falscher Token → Nx meldet `Unauthorized`; Read-only + Miss → Task läuft, Upload wird still abgelehnt.

Lokal mit dem Compose-Stack: Tokens `ci-token`, `dev-token`, `ro-token`.

## Metriken

`GET /metrics` (Prometheus-Textformat, ohne Client-Bibliothek, Zähler im Prozess, also pro Instanz und ab Neustart):

| Metrik | Labels | Inhalt |
|---|---|---|
| `nx_cache_requests_total` | `operation` (get/put), `outcome`, `role` (ci/dev/read-only/none), `namespace` | Requests. `outcome`: `hit`, `miss`, `stored`, `exists` (409), `unauthorized`, `forbidden`, `invalid`, `too-large`, `error` |
| `nx_cache_request_duration_seconds` | `operation`, `outcome` | Histogramm, GET bis zum ersten Byte (Stream-Dauer nicht enthalten) |
| `nx_cache_bytes_total` | `operation`, `namespace` | ausgelieferte (get) und gespeicherte (put) Bytes |
| `nx_cache_entry_bytes` | `operation` | Histogramm der Eintragsgrößen, Basis für `NX_CACHE_MAX_ENTRY_BYTES` |
| `process_uptime_seconds`, `process_resident_memory_bytes` | – | Prozess |

Nützliche Abfragen: Server-Hit-Rate `sum(rate(nx_cache_requests_total{operation="get",outcome="hit"}[5m])) / sum(rate(nx_cache_requests_total{operation="get",outcome=~"hit|miss"}[5m]))`, GET-Latenz p95 `histogram_quantile(0.95, sum by (le) (rate(nx_cache_request_duration_seconds_bucket{operation="get"}[5m])))`. Fertiges Dashboard mit Prometheus + Grafana: [`nx-metrics-collector`](../nx-metrics-collector/README.md). Die Sicht von Nx (welche Tasks, gesparte Zeit) liefert das Plugin [`nx-metrics`](../nx-metrics/README.md).

Hinweis: Nx fragt den Server nur bei Misses im lokalen Cache, die Server-Hit-Rate ist also die Rate unter lokalen Misses, nicht die Gesamt-Hit-Rate.

## Server konfigurieren

| Variable                                                                   | Default        | Bedeutung                                                                                  |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `STORAGE_PROVIDER`                                                         | –              | `minio` / `s3`, `azure`, `memory` (nur Test)                                               |
| `NX_CACHE_CI_TOKENS` / `NX_CACHE_DEV_TOKENS` / `NX_CACHE_READ_ONLY_TOKENS` | –              | kommagetrennt (mehrere → Rotation ohne Downtime, Token pro Person); mind. eine Liste nötig |
| `NX_CACHE_MAX_ENTRY_BYTES`                                                 | 2147483648     | Limit pro Task-Output                                                                      |
| `PORT` / `HOST`                                                            | 3000 / 0.0.0.0 |                                                                                            |
| `STORAGE_KEY_PREFIX`                                                       | leer           | Präfix der Objekt-Keys (z. B. ein Bucket für mehrere Repos)                                |
| `STORAGE_CREATE_BUCKET`                                                    | false          | Bucket/Container beim Start anlegen (dev)                                                  |
| `NX_CACHE_METRICS_TOKEN`                                                   | leer           | schützt `GET /metrics` (Bearer); leer → offen, dann per Netz absichern                     |

**MinIO / S3:** `S3_BUCKET`, `S3_ENDPOINT` (z. B. `http://minio:9000`; leer → AWS), `S3_REGION` (Default `us-east-1`), `S3_ACCESS_KEY_ID` + `S3_SECRET_ACCESS_KEY` (leer → AWS Credential Chain, z. B. IRSA), `S3_FORCE_PATH_STYLE` (Default: true, wenn `S3_ENDPOINT` gesetzt).

**Azure Blob:** `AZURE_STORAGE_CONTAINER` plus eine Auth, in dieser Reihenfolge:

1. `AZURE_STORAGE_CONNECTION_STRING`
2. `AZURE_STORAGE_ACCOUNT_NAME` + `AZURE_STORAGE_ACCOUNT_KEY` (optional `AZURE_STORAGE_ACCOUNT_URL`)
3. sonst `DefaultAzureCredential` (Managed Identity / Workload Identity / `az login`) mit `AZURE_STORAGE_ACCOUNT_URL`; Rolle **Storage Blob Data Contributor** auf dem Container

Der Server prüft Bucket/Container beim Start und bricht bei falscher Konfiguration sofort ab.

**Retention:** der Server löscht nichts. Ablauf über das Backend, pro Namespace-Präfix (Vorschlag: `trusted/` 14 Tage, `dev/` 3 Tage):

- MinIO: `mc ilm import <alias>/<bucket>` mit Regeln je Präfix (siehe `docker/compose.yml`, `minio-init`)
- Azure: Lifecycle-Management, Regel „Delete blob, days after creation“ mit Prefix-Filter `nx-cache/trusted/` bzw. `nx-cache/dev/` (Container-Name vorn)
- S3: Lifecycle-Expiration mit Prefix-Filter

Ein Treffer verlängert nichts: ein Eintrag läuft trotz Nutzung ab und wird dann neu gebaut.

## Produktivbetrieb

Azure fertig als Bicep (Container App, Blob mit Managed Identity, Lifecycle, optional mit Metrics-Stack): [`deploy/azure`](../../deploy/azure/README.md).


Checkliste, in dieser Reihenfolge:

1. **Speicher anlegen**, privat (kein öffentlicher Zugriff):
   - MinIO/S3: Bucket, z. B. `nx-cache`. Eigener Benutzer mit Policy nur auf diesen Bucket: `s3:GetObject`, `s3:PutObject`, `s3:ListBucket`. `ListBucket` ist Pflicht: ohne liefert S3 bei einem Miss 403 statt 404 → Server antwortet 500.
   - Azure: Storage Account + Container, z. B. `nx-cache`. Identität des Servers mit Rolle **Storage Blob Data Contributor** auf dem Container (Managed Identity bevorzugt, sonst Connection String/Key als Secret).
2. **Ablauf einrichten** pro Präfix, z. B. `trusted/` 14 Tage, `dev/` 3 Tage (siehe [Retention](#server-konfigurieren)). Ohne Regel wächst der Speicher unbegrenzt.
3. **Tokens erzeugen** (`openssl rand -base64 32`):
   - ein CI-Token (`NX_CACHE_CI_TOKENS`), nur für Pipelines auf `main`/Release
   - ein Read-only-Token (`NX_CACHE_READ_ONLY_TOKENS`) für PR-Pipelines
   - ein Dev-Token pro Entwickler (`NX_CACHE_DEV_TOKENS`, kommagetrennt)
4. **Server deployen**: Image bauen und in die eigene Registry pushen (`docker build -t <registry>/nx-remote-cache-custom:<version> packages/nx-remote-cache-custom`), Env aus Secrets (Beispiele unten). Zustandslos: mehrere Replicas möglich. Richtwert 0,5 vCPU / 512 MiB.
5. **Davor TLS + Proxy**: HTTPS-Endpoint, z. B. `https://nx-cache.<firma>.de`. Body-Limit ≥ `NX_CACHE_MAX_ENTRY_BYTES` (nginx: `client_max_body_size 2g;`), Request-Timeout ≥ 5 min, kein Puffern der Bodies (nginx: `proxy_request_buffering off;`). Erreichbar für CI-Agents und Entwickler (VPN/IP-Allowlist nach Bedarf). Health-Probe: `GET /health`.
6. **CI anbinden**: `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` + `NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN`, CI-Token nur für geschützte Branches, PRs Read-only (siehe [Nx anbinden](#nx-anbinden)). Nx ≥ 22.7.7 / 23.0.2, besser ≥ 23.1.1: ältere Versionen fragen jeden noch wartenden Miss bei jeder Scheduling-Runde erneut ab (kalter Lauf mit 186 Tasks: ~8.000 statt 186 GETs). In `/metrics` sichtbar als GET-Misses ≫ Tasks.
7. **Entwickler anbinden**: persönlichen Dev-Token verteilen (Passwort-Manager), Variablen in `~/.zshrc`/direnv.
8. **Prüfen**: `nx reset && nx run-many -t build` zweimal auf verschiedenen Rechnern → `[remote cache]`. Optional der E2E gegen den echten Server: `NX_CACHE_E2E_URLS=https://… NX_CACHE_E2E_CI_TOKEN=… NX_CACHE_E2E_DEV_TOKEN=… NX_CACHE_E2E_RO_TOKEN=… npx vitest run --config packages/nx-remote-cache-custom/vitest.config.mts src/e2e` (legt ein paar kleine Einträge an).

**Laufend:**

- Token rotieren: neuen Token zur Liste hinzufügen, Clients umstellen, alten entfernen, Server neu starten. Entwickler verlässt das Team → seinen Token aus `NX_CACHE_DEV_TOKENS` streichen.
- Logs: Start-Zeile `storage: …`, Fehler als `storage get/put failed` (500 an den Client). Nx bricht bei Cache-Fehlern nicht ab, baut dann lokal.
- Cache leeren (z. B. nach Verdacht auf ein kaputtes Artefakt): Präfix `trusted/` bzw. `dev/` im Bucket/Container löschen, es wird neu befüllt.
- Updates: Image neu bauen (Node-Basis-Image, Abhängigkeiten), Nx-Version der Clients aktuell halten.

**Beispiel-Env MinIO:**

```sh
STORAGE_PROVIDER=minio
S3_ENDPOINT=https://minio.<firma>.de
S3_BUCKET=nx-cache
S3_ACCESS_KEY_ID=nx-cache
S3_SECRET_ACCESS_KEY=<secret>
NX_CACHE_CI_TOKENS=<ci-token>
NX_CACHE_READ_ONLY_TOKENS=<ro-token>
NX_CACHE_DEV_TOKENS=<token-anna>,<token-ben>
```

**Beispiel-Env Azure (Managed Identity):**

```sh
STORAGE_PROVIDER=azure
AZURE_STORAGE_ACCOUNT_URL=https://<account>.blob.core.windows.net
AZURE_STORAGE_CONTAINER=nx-cache
NX_CACHE_CI_TOKENS=<ci-token>
NX_CACHE_READ_ONLY_TOKENS=<ro-token>
NX_CACHE_DEV_TOKENS=<token-anna>,<token-ben>
```

Lokal starten: `docker run -p 3000:3000 --env-file cache.env nx-remote-cache-custom`. Das Image ist eigenständig (keine Workspace-Abhängigkeiten), läuft als `node`, mit `HEALTHCHECK` auf `/health`.

## Single-Host-Deployment

Ein Rechner im LAN (z. B. Mac mini mit externer SSD) für einen Entwickler oder ein kleines Team: Cache, MinIO und der Metrik-Stack aus [`nx-metrics-collector`](../nx-metrics-collector/README.md) in einem Compose-Projekt ([`docker/single-host/`](docker/single-host/compose.yml)).

```sh
packages/nx-remote-cache-custom/docker/single-host/deploy.sh <ssh-ziel> <remote-dir> [data-dir]
# z. B. deploy.sh macmini@mac-mini.fritz.box /Volumes/DevSSD/nx-cache
```

- Erster Lauf erzeugt `<remote-dir>/.env` mit Zufalls-Secrets (Vorlage: `.env.example`), danach bleibt sie unangetastet → in den Passwort-Manager.
- Jeder Lauf kopiert Compose, Konfiguration und beide Pakete nach `<remote-dir>/src/`, baut die Images auf dem Host und startet geänderte Dienste neu (gleicher Befehl für Updates).
- Erreichbar im LAN: Cache `:3100`, Collector `:4000/v1/runs`, Grafana `:3310`. Nur auf dem Host: MinIO `:9000`/`:9001`, Prometheus `:9090`.
- MinIO-Daten per Bind-Mount in `NX_CACHE_DATA_DIR` mit `create_host_path: false`: ist die externe Platte nicht gemountet, startet MinIO nicht, statt auf die interne Platte zu schreiben.

**Speichergrenzen** (Env in `.env`, Defaults):

| Grenze | Umsetzung |
|---|---|
| Alter `NX_CACHE_RETENTION_DAYS=5` | MinIO-ILM-Regel für `trusted/` und `dev/`; der Scanner löscht mit etwas Verzögerung |
| Größe `NX_CACHE_EVICT_HIGH_GIB=90` → `NX_CACHE_EVICT_LOW_GIB=80` | Container `evictor` ([`evict.sh`](docker/single-host/evict.sh)) prüft alle 10 min, löscht älteste Einträge zuerst |
| hart `NX_CACHE_QUOTA_GIB=100` | Bucket-Quota; voll → PUT schlägt fehl, Nx baut lokal weiter |

Grafana zeigt Belegung, Quota und Anzahl Einträge (Prometheus-Job `minio`, `/minio/v2/metrics/bucket`).

**Clients:** einmal global statt `.env` pro Repo, damit neue Repos und Worktrees automatisch mitmachen. Eigener Dev-Token pro Rechner (`NX_CACHE_DEV_TOKENS` kommagetrennt):

```sh
# ~/.config/nx-cache/env (chmod 600)
NX_SELF_HOSTED_REMOTE_CACHE_SERVER=http://mac-mini.fritz.box:3100
NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN=<dev-token>
NX_METRICS_ENDPOINT=http://mac-mini.fritz.box:4000/v1/runs
NX_METRICS_TOKEN=<collector-token>

# ~/.zshenv
[ -r "$HOME/.config/nx-cache/env" ] && { set -a; . "$HOME/.config/nx-cache/env"; set +a; }
```

Aus dem Dock gestartete IDEs lesen `~/.zshenv` nicht: ein LaunchAgent mit `RunAtLoad`, der jede Zeile per `launchctl setenv` setzt, macht die Werte auch dort sichtbar. Repos mit Nx Cloud (`nxCloudId` in `nx.json`) nutzen weiter Nx Cloud; ältere Nx-Versionen (geprüft: 20.5 nein, 21.5 ja) kennen `NX_SELF_HOSTED_REMOTE_CACHE_SERVER` nicht und ignorieren es.

## Entwicklung

```sh
nx run nx-remote-cache-custom:stack              # MinIO (:9000, Console :9001) + Azurite (:10000) + Server je Backend (:3100 MinIO, :3200 Azurite)
nx run nx-remote-cache-custom:test               # Routen (in-memory) + Storage-Vertrag (memory); Rest übersprungen
nx run nx-remote-cache-custom:test-integration   # Storage-Vertrag gegen MinIO + Azurite (Stack muss laufen)
nx run nx-remote-cache-custom:e2e                # echter Nx-Client gegen beide Server (Stack muss laufen)
```

Gegen echtes Azure: `NX_CACHE_IT_AZURE_CONNECTION_STRING=… NX_CACHE_IT_AZURE_CONTAINER=… npx vitest run --config packages/nx-remote-cache-custom/vitest.config.mts src/storage`. Fremde Server/Tokens für den E2E: `NX_CACHE_E2E_URLS`, `NX_CACHE_E2E_CI_TOKEN`, `NX_CACHE_E2E_DEV_TOKEN`, `NX_CACHE_E2E_RO_TOKEN`.

Der E2E (`src/e2e/nx-client.e2e.spec.ts`) baut einen Wegwerf-Workspace mit dem `nx` dieses Repos und spielt pro Server durch: Dev-Miss → Upload `dev/`, Dev-Hit, CI-Miss (liest `dev/` nicht) → Upload `trusted/`, Read-only-Hit mit wiederhergestellten Outputs, Read-only-Miss ohne Upload, falscher Token → `Unauthorized`.

Der Storage-Vertrag (`src/storage/storage.contract.spec.ts`) läuft für jedes Backend gleich: Miss, Roundtrip, 20 MiB (mehrere Upload-Blöcke), zweiter Write → `EntryAlreadyExists`, parallele Writer → genau einer gewinnt.

MinIO veröffentlicht keine Images mehr; der Compose-Stack nutzt die Community-Builds `pgsty/minio` / `pgsty/mc` (gleicher Upstream-Code, AGPLv3).

| Datei                              | Inhalt                                                              |
| ---------------------------------- | ------------------------------------------------------------------- |
| `src/routes.ts`                    | Routen der Spec (`HttpRouter`), Auth, Validierung                   |
| `src/auth.ts`                      | Token → Rolle (konstante Laufzeit), Rolle → Namespaces (`policyOf`) |
| `src/config.ts`                    | Env → `ServerConfig`, Backend-Auswahl (`Layer.unwrap`)              |
| `src/storage/cache-storage.ts`     | Service `CacheStorage` (get/exists/put, write-once)                 |
| `src/storage/{s3,azure,memory}.ts` | Backends                                                            |
| `src/main.ts`                      | Einstieg (`NodeRuntime.runMain`)                                    |
