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

## Server konfigurieren

| Variable                                                                   | Default        | Bedeutung                                                                                  |
| -------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `STORAGE_PROVIDER`                                                         | –              | `minio` / `s3`, `azure`, `memory` (nur Test)                                               |
| `NX_CACHE_CI_TOKENS` / `NX_CACHE_DEV_TOKENS` / `NX_CACHE_READ_ONLY_TOKENS` | –              | kommagetrennt (mehrere → Rotation ohne Downtime, Token pro Person); mind. eine Liste nötig |
| `NX_CACHE_MAX_ENTRY_BYTES`                                                 | 2147483648     | Limit pro Task-Output                                                                      |
| `PORT` / `HOST`                                                            | 3000 / 0.0.0.0 |                                                                                            |
| `STORAGE_KEY_PREFIX`                                                       | leer           | Präfix der Objekt-Keys (z. B. ein Bucket für mehrere Repos)                                |
| `STORAGE_CREATE_BUCKET`                                                    | false          | Bucket/Container beim Start anlegen (dev)                                                  |

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

## Betrieb

```sh
docker build -t nx-remote-cache-custom packages/nx-remote-cache-custom    # oder: nx run nx-remote-cache-custom:docker-build
docker run -p 3000:3000 --env-file cache.env nx-remote-cache-custom
```

Das Image ist eigenständig (keine Workspace-Abhängigkeiten), läuft als `node`, mit `HEALTHCHECK` auf `/health`. TLS terminiert davor (Ingress, Container Apps, Reverse Proxy). Ziele z. B. Azure Container Apps / AKS (Managed Identity → Variante 3) oder neben MinIO im selben Docker-Stack.

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
