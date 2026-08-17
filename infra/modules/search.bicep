@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('The SKU of the search service.')
@allowed([
  'free'
  'basic'
  'standard'
])
param searchSku string = 'basic'

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

resource searchService 'Microsoft.Search/searchServices@2023-11-01-preview' = {
  name: 'search-${appName}'
  location: location
  tags: tags
  sku: {
    name: searchSku
  }
  properties: {
    replicaCount: 1
    partitionCount: 1
    hostingMode: 'default'
    publicNetworkAccess: 'enabled'
  }
}

resource searchSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: '${keyVaultName}/SEARCH-ADMIN-KEY'
  properties: {
    value: searchService.listAdminKeys().primaryKey
  }
}

output searchServiceName string = searchService.name
output searchServiceId string = searchService.id
output searchServiceEndpoint string = 'https://${searchService.name}.search.windows.net'
output searchSecretUri string = searchSecret.properties.secretUri
