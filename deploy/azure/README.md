# Azure: Remote Cache + Nx Metrics

Bicep für [Azure Container Apps](https://learn.microsoft.com/azure/container-apps/). Beide Teile sind einzeln schaltbar, also auch gemischt mit eigenem Server (z. B. Cache on-prem, Metrics in Azure).

```
                       ┌──────────── Container Apps Environment ────────────┐
CI / Entwickler ─HTTPS─► nx-cache ──Managed Identity──► Blob Storage (Lifecycle) │
                │      │   ▲ /metrics                                        │
                │      │ nx-prometheus (intern)                              │
                └HTTPS─► nx-collector ──┐                                    │
Browser ───────HTTPS──► nx-grafana ─────┴──► Postgres Flexible Server        │
                       └─────────────────────────────────────────────────────┘
```

| Ressource | Was |
|---|---|
| Container Registry (Basic) | Images, gebaut per `az acr build` (kein lokales Docker nötig) |
| Log Analytics | Container-Logs, 30 Tage |
| User-assigned Identity | Image-Pull (AcrPull) für alle Apps, Blob-Zugriff (Storage Blob Data Contributor, nur der Container) für den Cache |
| `nx-cache` | [`nx-remote-cache-custom`](../../packages/nx-remote-cache-custom/README.md), 0,5 vCPU / 1 GiB, 1–3 Replicas |
| Storage Account | Container `nx-cache`, kein Shared Key, kein Public Access; Lifecycle `trusted/` 14 Tage, `dev/` 3 Tage |
| `nx-collector` | [`nx-metrics-collector`](../../packages/nx-metrics-collector/README.md), legt Schema + read-only Rolle `grafana` an |
| Postgres Flexible Server | B1ms Burstable, 32 GB, Datenbanken `nxmetrics` und `grafana` (Grafanas eigener Zustand) |
| `nx-grafana` | eigenes Image mit Datasources + Dashboard „Nx Metrics“ |
| `nx-prometheus` | intern, scrapt `/metrics` des Caches (lokal in Azure oder `CACHE_METRICS_TARGET`) |

Kosten: größte Posten sind Postgres und die dauerhaft laufenden Replicas (je 1 für Cache, Collector, Grafana, Prometheus), dazu Speicher je nach Cache-Größe. Vorab im Azure Pricing Calculator rechnen.

## Deploy

```sh
az login && az account set --subscription <id>
cp deploy/azure/.env.example deploy/azure/.env    # gitignored, Tokens/Passwörter eintragen
set -a; source deploy/azure/.env; set +a
./deploy/azure/deploy.sh
```

Ausgabe: `cacheUrl`, `collectorEndpoint`, `grafanaUrl`. Dann:

| Wo | Variable |
|---|---|
| CI (main) | `NX_SELF_HOSTED_REMOTE_CACHE_SERVER=<cacheUrl>`, `NX_SELF_HOSTED_REMOTE_CACHE_ACCESS_TOKEN=<CI-Token>` |
| CI (PRs) | dasselbe mit Read-only-Token |
| Entwickler | dasselbe mit Dev-Token |
| alle | `NX_METRICS_ENDPOINT=<collectorEndpoint>`, `NX_METRICS_TOKEN=<COLLECTOR_TOKENS-Eintrag>` |

Im Repo: Variablen `NX_CACHE_URL`, `NX_METRICS_ENDPOINT`, Secrets `NX_CACHE_CI_TOKEN`, `NX_CACHE_RO_TOKEN`, `NX_METRICS_TOKEN` (siehe [`ci.yml`](../../.github/workflows/ci.yml)).

**Nur ein Teil:**
- nur Cache: `DEPLOY_METRICS=false`
- nur Metrics, Cache läuft woanders: `DEPLOY_CACHE=false CACHE_METRICS_TARGET=nx-cache.example.com:443` (ohne Target kein Prometheus; Dashboard-Panels „Cache-Server“ bleiben leer)

**Update:** `deploy.sh` erneut ausführen. Image-Tag = Git-SHA (`-dirty` bei uncommitteten Änderungen), Container Apps rollen neu aus.

**Token rotieren:** neuen Token anhängen (`a,b`), deployen, Clients umstellen, alten entfernen, deployen.

## Bekannte Grenzen

- **Nicht in Azure ausprobiert.** Gebaut ohne Subscription und ohne lokalen Bicep-Compiler. Lokal getestet sind nur die Bausteine: Grafana-Image mit Postgres-Backend und Datasources per Env, read-only Rolle des Collectors gegen echtes Postgres, Prometheus-Config (`promtool`). Vor dem ersten Deploy: `az bicep build --file deploy/azure/main.bicep` und `az deployment group what-if …`.
- **Erster Deploy:** Rollenzuweisungen brauchen teils Minuten, bis sie greifen. Schlägt der Image-Pull oder der Blob-Zugriff fehl, `deploy.sh` einfach noch einmal laufen lassen.
- **Ingress-Timeout 240 s** (Container Apps, fest). Uploads sehr großer Einträge über langsame Leitungen können abbrechen, `NX_CACHE_MAX_ENTRY_BYTES` ggf. senken.
- **Prometheus ohne Persistenz:** Server-Metriken (Requests, Latenz) gehen bei Neustart verloren. Die Kennzahlen für Kundenbericht und ROI liegen in Postgres. Für dauerhafte Server-Historie: Azure Monitor managed Prometheus.
- **Postgres öffentlich erreichbar** (TLS, Firewall „Azure-Dienste“). Härtung: Environment mit VNet + Postgres mit privatem Zugriff, Cache-Ingress per IP-Allowlist oder intern + VPN.
- Grafana nutzt den Postgres-Admin für seine eigene Datenbank. Wer das trennen will, legt einen eigenen User an und setzt `GF_DATABASE_USER`.
