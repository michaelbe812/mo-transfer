// nx-metrics: Postgres Flexible Server + collector + Grafana (own image with dashboard) + optional Prometheus.
param prefix string
param suffix string
param shared object
@secure()
param collectorTokens string
@secure()
param postgresAdminPassword string
@secure()
param grafanaReaderPassword string
@secure()
param grafanaAdminPassword string
param grafanaAnonymousViewer bool
param postgresVersion string
param deployPrometheus bool
param cacheMetricsTarget string
param cacheMetricsScheme string
@secure()
param cacheMetricsToken string

var adminUser = 'nxadmin'
var readerRole = 'grafana'
var identity = {
  type: 'UserAssigned'
  userAssignedIdentities: { '${shared.identityId}': {} }
}
var registries = [{ server: shared.registryServer, identity: shared.identityId }]

resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01' = {
  name: '${prefix}-pg-${suffix}'
  location: shared.location
  sku: { name: 'Standard_B1ms', tier: 'Burstable' }
  properties: {
    version: postgresVersion
    administratorLogin: adminUser
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32, autoGrow: 'Enabled' }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
    network: { publicNetworkAccess: 'Enabled' }
    authConfig: { passwordAuth: 'Enabled', activeDirectoryAuth: 'Disabled' }
  }
}

// Container Apps reach the server over its public endpoint (TLS); 0.0.0.0 = "allow Azure services".
// Hardening: VNet-integrated environment + private access instead (see README).
resource allowAzure 'Microsoft.DBforPostgreSQL/flexibleServers/firewallRules@2024-08-01' = {
  parent: postgres
  name: 'AllowAzureServices'
  properties: { startIpAddress: '0.0.0.0', endIpAddress: '0.0.0.0' }
}

resource metricsDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'nxmetrics'
}

resource grafanaDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2024-08-01' = {
  parent: postgres
  name: 'grafana'
}

var pgHost = postgres.properties.fullyQualifiedDomainName

resource collector 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-collector'
  location: shared.location
  dependsOn: [metricsDb, allowAzure]
  identity: identity
  properties: {
    environmentId: shared.environmentId
    configuration: {
      ingress: { external: true, targetPort: 4000, transport: 'auto', allowInsecure: false }
      registries: registries
      secrets: [
        {
          name: 'database-url'
          value: 'postgres://${adminUser}:${uriComponent(postgresAdminPassword)}@${pgHost}:5432/nxmetrics?sslmode=verify-full'
        }
        { name: 'collector-tokens', value: collectorTokens }
        { name: 'reader-password', value: grafanaReaderPassword }
      ]
    }
    template: {
      containers: [
        {
          name: 'collector'
          image: '${shared.registryServer}/nx-metrics-collector:${shared.imageTag}'
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          env: [
            { name: 'DATABASE_URL', secretRef: 'database-url' }
            { name: 'COLLECTOR_TOKENS', secretRef: 'collector-tokens' }
            { name: 'COLLECTOR_READONLY_ROLE', value: readerRole }
            { name: 'COLLECTOR_READONLY_PASSWORD', secretRef: 'reader-password' }
          ]
          probes: [
            { type: 'Liveness', httpGet: { path: '/health', port: 4000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health', port: 4000 }, periodSeconds: 10 }
          ]
        }
      ]
      // records are posted best-effort at the end of each nx run: keep one replica warm
      scale: { minReplicas: 1, maxReplicas: 2 }
    }
  }
}

var withPrometheus = deployPrometheus && !empty(cacheMetricsTarget)
// multi-line strings do not interpolate → format()
var scrapeAuth = empty(cacheMetricsToken) ? '' : '''

    authorization:
      credentials_file: /etc/prometheus/cache-token'''
var prometheusYml = format(
  '''global:
  scrape_interval: 30s
scrape_configs:
  - job_name: nx-cache
    metrics_path: /metrics
    scheme: {0}{1}
    static_configs:
      - targets: ['{2}']
''',
  cacheMetricsScheme,
  scrapeAuth,
  cacheMetricsTarget
)
var prometheusSecrets = concat(
  [{ name: 'prometheus-yml', value: prometheusYml }],
  empty(cacheMetricsToken) ? [] : [{ name: 'cache-token', value: cacheMetricsToken }]
)

// Ops metrics only (requests, latency, bytes): no persistent disk, history is lost on restart.
// Long-term KPIs live in Postgres. For durable server history use Azure Monitor managed Prometheus.
resource prometheus 'Microsoft.App/containerApps@2024-03-01' = if (withPrometheus) {
  name: '${prefix}-prometheus'
  location: shared.location
  properties: {
    environmentId: shared.environmentId
    configuration: {
      ingress: { external: false, targetPort: 9090, transport: 'http', allowInsecure: true }
      secrets: prometheusSecrets
    }
    template: {
      containers: [
        {
          name: 'prometheus'
          image: 'docker.io/prom/prometheus:v3.16.0'
          args: [
            '--config.file=/etc/prometheus/prometheus.yml'
            '--storage.tsdb.path=/prometheus'
            '--storage.tsdb.retention.time=15d'
          ]
          resources: { cpu: json('0.25'), memory: '0.5Gi' }
          volumeMounts: [{ volumeName: 'config', mountPath: '/etc/prometheus' }]
        }
      ]
      volumes: [
        {
          name: 'config'
          storageType: 'Secret'
          secrets: map(prometheusSecrets, s => { secretRef: s.name, path: s.name == 'prometheus-yml' ? 'prometheus.yml' : s.name })
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

resource grafana 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-grafana'
  location: shared.location
  dependsOn: [grafanaDb, allowAzure]
  identity: identity
  properties: {
    environmentId: shared.environmentId
    configuration: {
      ingress: { external: true, targetPort: 3000, transport: 'auto', allowInsecure: false }
      registries: registries
      secrets: [
        { name: 'admin-password', value: grafanaAdminPassword }
        { name: 'pg-admin-password', value: postgresAdminPassword }
        { name: 'reader-password', value: grafanaReaderPassword }
      ]
    }
    template: {
      containers: [
        {
          name: 'grafana'
          image: '${shared.registryServer}/nx-metrics-grafana:${shared.imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'GF_SECURITY_ADMIN_PASSWORD', secretRef: 'admin-password' }
            { name: 'GF_AUTH_ANONYMOUS_ENABLED', value: string(grafanaAnonymousViewer) }
            { name: 'GF_AUTH_ANONYMOUS_ORG_ROLE', value: 'Viewer' }
            { name: 'GF_SERVER_ROOT_URL', value: 'https://${prefix}-grafana.${shared.defaultDomain}' }
            // Grafana's own state (users, UI changes) in Postgres: the container has no persistent disk
            { name: 'GF_DATABASE_TYPE', value: 'postgres' }
            { name: 'GF_DATABASE_HOST', value: '${pgHost}:5432' }
            { name: 'GF_DATABASE_NAME', value: 'grafana' }
            { name: 'GF_DATABASE_USER', value: adminUser }
            { name: 'GF_DATABASE_PASSWORD', secretRef: 'pg-admin-password' }
            { name: 'GF_DATABASE_SSL_MODE', value: 'require' }
            // datasources (provisioning/datasources.yml)
            { name: 'NX_METRICS_PG_HOST', value: '${pgHost}:5432' }
            { name: 'NX_METRICS_PG_USER', value: readerRole }
            { name: 'NX_METRICS_PG_PASSWORD', secretRef: 'reader-password' }
            { name: 'NX_METRICS_PG_DATABASE', value: 'nxmetrics' }
            { name: 'NX_METRICS_PG_SSLMODE', value: 'require' }
            { name: 'NX_CACHE_PROMETHEUS_URL', value: withPrometheus ? 'http://${prefix}-prometheus' : '' }
          ]
          probes: [{ type: 'Readiness', httpGet: { path: '/api/health', port: 3000 }, periodSeconds: 10 }]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 1 }
    }
  }
}

output collectorFqdn string = collector.properties.configuration.ingress.fqdn
output grafanaFqdn string = grafana.properties.configuration.ingress.fqdn
output postgresHost string = pgHost
