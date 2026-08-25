@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('The SKU of the search service. "free" does not support vector search.')
@allowed([
  'basic'
  'standard'
  'standard2'
])
param searchSku string = 'basic'

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

@description('Name of the index holding document chunks.')
param indexName string = 'documents'

@description('Number of replicas. More than one is required for a read SLA.')
@minValue(1)
param replicaCount int = 1

@description('Number of partitions.')
@minValue(1)
param partitionCount int = 1

resource searchService 'Microsoft.Search/searchServices@2024-06-01-preview' = {
  name: 'search-${appName}'
  location: location
  tags: tags
  sku: {
    name: searchSku
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    replicaCount: replicaCount
    partitionCount: partitionCount
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
    // The app authenticates with the admin key held in Key Vault. Keeping key
    // auth enabled alongside RBAC leaves room to migrate to managed identity
    // without a breaking change.
    authOptions: {
      aadOrApiKey: {
        aadAuthFailureMode: 'http401WithBearerChallenge'
      }
    }
    semanticSearch: 'disabled'
  }
}

resource searchAdminKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/SEARCH-ADMIN-KEY'
  properties: {
    value: searchService.listAdminKeys().primaryKey
    contentType: 'Azure AI Search admin key'
  }
}

output searchServiceName string = searchService.name
output searchServiceId string = searchService.id
output searchServiceEndpoint string = 'https://${searchService.name}.search.windows.net'
output searchIndexName string = indexName
output searchKeySecretUri string = searchAdminKeySecret.properties.secretUri
