// nx-remote-cache-custom: Blob storage (managed identity, no keys) + lifecycle per namespace + Container App.
param prefix string
param suffix string
param shared object
param identityPrincipalId string
param identityClientId string
@secure()
param ciTokens string
@secure()
param readOnlyTokens string
@secure()
param devTokens string
@secure()
param metricsToken string
param retentionTrustedDays int
param retentionDevDays int

var containerName = 'nx-cache'

resource storage 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: take('${replace(prefix, '-', '')}cache${suffix}', 24)
  location: shared.location
  kind: 'StorageV2'
  sku: { name: 'Standard_LRS' }
  properties: {
    accessTier: 'Hot'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false // managed identity only
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storage
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: { publicAccess: 'None' }
}

// The server deletes nothing: entries expire per namespace prefix.
resource lifecycle 'Microsoft.Storage/storageAccounts/managementPolicies@2023-05-01' = {
  parent: storage
  name: 'default'
  properties: {
    policy: {
      rules: [
        {
          name: 'expire-trusted'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${containerName}/trusted/'] }
            actions: { baseBlob: { delete: { daysAfterCreationGreaterThan: retentionTrustedDays } } }
          }
        }
        {
          name: 'expire-dev'
          enabled: true
          type: 'Lifecycle'
          definition: {
            filters: { blobTypes: ['blockBlob'], prefixMatch: ['${containerName}/dev/'] }
            actions: { baseBlob: { delete: { daysAfterCreationGreaterThan: retentionDevDays } } }
          }
        }
      ]
    }
  }
}

var blobContributorRoleId = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
resource blobAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(container.id, identityPrincipalId, blobContributorRoleId)
  scope: container
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobContributorRoleId)
    principalId: identityPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Empty tokens are left out (Container Apps rejects empty secrets).
var tokenSecrets = filter(
  [
    { name: 'ci-tokens', value: ciTokens, env: 'NX_CACHE_CI_TOKENS' }
    { name: 'read-only-tokens', value: readOnlyTokens, env: 'NX_CACHE_READ_ONLY_TOKENS' }
    { name: 'dev-tokens', value: devTokens, env: 'NX_CACHE_DEV_TOKENS' }
    { name: 'metrics-token', value: metricsToken, env: 'NX_CACHE_METRICS_TOKEN' }
  ],
  s => !empty(s.value)
)

resource app 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${prefix}-cache'
  location: shared.location
  dependsOn: [blobAccess]
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: { '${shared.identityId}': {} }
  }
  properties: {
    environmentId: shared.environmentId
    configuration: {
      ingress: {
        external: true
        targetPort: 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: [{ server: shared.registryServer, identity: shared.identityId }]
      secrets: map(tokenSecrets, s => { name: s.name, value: s.value })
    }
    template: {
      containers: [
        {
          name: 'cache'
          image: '${shared.registryServer}/nx-remote-cache-custom:${shared.imageTag}'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: concat(
            [
              { name: 'STORAGE_PROVIDER', value: 'azure' }
              { name: 'AZURE_STORAGE_ACCOUNT_URL', value: storage.properties.primaryEndpoints.blob }
              { name: 'AZURE_STORAGE_CONTAINER', value: containerName }
              { name: 'AZURE_CLIENT_ID', value: identityClientId } // DefaultAzureCredential → this identity
            ],
            map(tokenSecrets, s => { name: s.env, secretRef: s.name })
          )
          probes: [
            { type: 'Liveness', httpGet: { path: '/health', port: 3000 }, periodSeconds: 30 }
            { type: 'Readiness', httpGet: { path: '/health', port: 3000 }, periodSeconds: 10 }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 3
        rules: [{ name: 'http', http: { metadata: { concurrentRequests: '50' } } }]
      }
    }
  }
}

output fqdn string = app.properties.configuration.ingress.fqdn
output storageAccount string = storage.name
