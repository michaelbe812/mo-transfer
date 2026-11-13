// Nx remote cache + Nx metrics on Azure Container Apps. Deploy with ./deploy.sh (builds the images in ACR first).
// Each part is optional: e.g. cache on your own server (deployCache=false, cacheMetricsTarget=<host:port>) and
// metrics in Azure, or only the cache in Azure.
targetScope = 'resourceGroup'

@description('Short name prefix for all resources (lowercase letters, digits, hyphens).')
@maxLength(12)
param prefix string = 'nx'
param location string = resourceGroup().location

@description('Existing Azure Container Registry holding the images (deploy.sh creates it and builds the images).')
param acrName string
param imageTag string

param deployCache bool = true
param deployMetrics bool = true

// --- cache ---
@secure()
@description('Comma-separated write tokens for CI on main/release.')
param cacheCiTokens string = ''
@secure()
@description('Comma-separated read-only tokens for PR pipelines.')
param cacheReadOnlyTokens string = ''
@secure()
@description('Comma-separated developer tokens (one per person).')
param cacheDevTokens string = ''
@secure()
@description('Bearer token for GET /metrics (Prometheus). Empty → /metrics open.')
param cacheMetricsToken string = ''
param cacheRetentionTrustedDays int = 14
param cacheRetentionDevDays int = 3

// --- metrics ---
@secure()
@description('Comma-separated tokens for POST /v1/runs (NX_METRICS_TOKEN on CI/dev machines).')
param collectorTokens string
@secure()
param postgresAdminPassword string
@secure()
@description('Password of the read-only Postgres role "grafana" (created by the collector).')
param grafanaReaderPassword string
@secure()
param grafanaAdminPassword string
param grafanaAnonymousViewer bool = false
@allowed(['14', '15', '16', '17'])
param postgresVersion string = '16'
param deployPrometheus bool = true
@description('Cache /metrics target when the cache does not run here (deployCache=false), e.g. nx-cache.example.com:443. Empty → none.')
param cacheMetricsTarget string = ''
param cacheMetricsScheme string = 'https'

var suffix = uniqueString(resourceGroup().id)

resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' existing = {
  name: acrName
}

resource logs 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${prefix}-logs'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${prefix}-env'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logs.properties.customerId
        sharedKey: logs.listKeys().primarySharedKey
      }
    }
  }
}

// One identity for all apps: pulls images; the cache additionally writes blobs.
resource identity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${prefix}-apps'
  location: location
}

var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'
resource acrPull 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(acr.id, identity.id, acrPullRoleId)
  scope: acr
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: identity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

var shared = {
  location: location
  environmentId: env.id
  identityId: identity.id
  registryServer: acr.properties.loginServer
  imageTag: imageTag
  defaultDomain: env.properties.defaultDomain
}

module cache 'modules/cache.bicep' = if (deployCache) {
  name: 'cache'
  dependsOn: [acrPull]
  params: {
    prefix: prefix
    suffix: suffix
    shared: shared
    identityPrincipalId: identity.properties.principalId
    identityClientId: identity.properties.clientId
    ciTokens: cacheCiTokens
    readOnlyTokens: cacheReadOnlyTokens
    devTokens: cacheDevTokens
    metricsToken: cacheMetricsToken
    retentionTrustedDays: cacheRetentionTrustedDays
    retentionDevDays: cacheRetentionDevDays
  }
}

module metrics 'modules/metrics.bicep' = if (deployMetrics) {
  name: 'metrics'
  dependsOn: [acrPull]
  params: {
    prefix: prefix
    suffix: suffix
    shared: shared
    collectorTokens: collectorTokens
    postgresAdminPassword: postgresAdminPassword
    grafanaReaderPassword: grafanaReaderPassword
    grafanaAdminPassword: grafanaAdminPassword
    grafanaAnonymousViewer: grafanaAnonymousViewer
    postgresVersion: postgresVersion
    deployPrometheus: deployPrometheus
    cacheMetricsTarget: deployCache ? '${cache!.outputs.fqdn}:443' : cacheMetricsTarget
    cacheMetricsScheme: deployCache ? 'https' : cacheMetricsScheme
    cacheMetricsToken: cacheMetricsToken
  }
}

output cacheUrl string = deployCache ? 'https://${cache!.outputs.fqdn}' : ''
output collectorEndpoint string = deployMetrics ? 'https://${metrics!.outputs.collectorFqdn}/v1/runs' : ''
output grafanaUrl string = deployMetrics ? 'https://${metrics!.outputs.grafanaFqdn}' : ''
