@description('Location for all resources.')
param location string

@description('Name of the application, used to generate a unique storage account name.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('The SKU of the storage account.')
@allowed([
  'Standard_LRS'
  'Standard_GRS'
  'Standard_ZRS'
])
param storageSku string = 'Standard_LRS'

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

// Ensures max length 24, lowercase, numbers/letters only, and unique to resource group
var uniqueId = uniqueString(resourceGroup().id, appName)
var storageName = 'st${uniqueId}'

resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: substring(storageName, 0, 24)
  location: location
  tags: tags
  sku: {
    name: storageSku
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2022-09-01' = {
  parent: storageAccount
  name: 'default'
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2022-09-01' = {
  parent: blobService
  name: 'documents'
  properties: {
    publicAccess: 'None'
  }
}

// Store secret directly in Key Vault
resource storageSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: '${keyVaultName}/STORAGE-CONNECTION-STRING'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
  }
}

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output storageConnectionStringSecretUri string = storageSecret.properties.secretUri
