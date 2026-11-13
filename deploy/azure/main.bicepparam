// Values come from the environment (deploy.sh exports ACR_NAME + IMAGE_TAG; secrets from your secret store / .env).
using './main.bicep'

param prefix = readEnvironmentVariable('PREFIX', 'nx')
param acrName = readEnvironmentVariable('ACR_NAME')
param imageTag = readEnvironmentVariable('IMAGE_TAG')
param deployCache = bool(readEnvironmentVariable('DEPLOY_CACHE', 'true'))
param deployMetrics = bool(readEnvironmentVariable('DEPLOY_METRICS', 'true'))

param cacheCiTokens = readEnvironmentVariable('NX_CACHE_CI_TOKENS', '')
param cacheReadOnlyTokens = readEnvironmentVariable('NX_CACHE_READ_ONLY_TOKENS', '')
param cacheDevTokens = readEnvironmentVariable('NX_CACHE_DEV_TOKENS', '')
param cacheMetricsToken = readEnvironmentVariable('NX_CACHE_METRICS_TOKEN', '')

param collectorTokens = readEnvironmentVariable('COLLECTOR_TOKENS', '')
param postgresAdminPassword = readEnvironmentVariable('POSTGRES_ADMIN_PASSWORD', '')
param grafanaReaderPassword = readEnvironmentVariable('GRAFANA_READER_PASSWORD', '')
param grafanaAdminPassword = readEnvironmentVariable('GRAFANA_ADMIN_PASSWORD', '')
param grafanaAnonymousViewer = bool(readEnvironmentVariable('GRAFANA_ANONYMOUS_VIEWER', 'false'))

// cache on your own server, metrics here: DEPLOY_CACHE=false CACHE_METRICS_TARGET=nx-cache.example.com:443
param cacheMetricsTarget = readEnvironmentVariable('CACHE_METRICS_TARGET', '')
param cacheMetricsScheme = readEnvironmentVariable('CACHE_METRICS_SCHEME', 'https')
