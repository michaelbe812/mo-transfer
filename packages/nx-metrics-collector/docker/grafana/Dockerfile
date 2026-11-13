# Grafana with the Nx Metrics datasources + dashboard baked in (Azure Container Apps, k8s: no bind mounts needed).
#   docker build -t nx-metrics-grafana packages/nx-metrics-collector/docker/grafana
# Env: NX_METRICS_PG_HOST (host:port), NX_METRICS_PG_USER, NX_METRICS_PG_PASSWORD, NX_METRICS_PG_DATABASE,
#      NX_METRICS_PG_SSLMODE (disable|require), NX_CACHE_PROMETHEUS_URL; plus the usual GF_* settings.
FROM grafana/grafana:13.3.1
COPY provisioning /etc/grafana/provisioning
COPY dashboards /var/lib/grafana/dashboards
ENV GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH=/var/lib/grafana/dashboards/nx-metrics.json
