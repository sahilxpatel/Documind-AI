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

@description('Name of the container holding uploaded documents.')
param containerName string = 'documents'

@description('Days to retain soft-deleted blobs.')
@minValue(1)
@maxValue(365)
param blobRetentionDays int = 7

// Storage account names are 3-24 characters, lowercase alphanumeric only.
var uniqueId = uniqueString(resourceGroup().id, appName)
var storageName = substring('st${uniqueId}', 0, min(length('st${uniqueId}'), 24))

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageName
  location: location
  tags: tags
  sku: {
    name: storageSku
  }
  kind: 'StorageV2'
  properties: {
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    // Uploaded documents are user data; no anonymous access under any container.
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
    encryption: {
      keySource: 'Microsoft.Storage'
      requireInfrastructureEncryption: false
      services: {
        blob: {
          enabled: true
          keyType: 'Account'
        }
        file: {
          enabled: true
          keyType: 'Account'
        }
      }
    }
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    // Recovers a document deleted by an application bug or a mistaken request.
    deleteRetentionPolicy: {
      enabled: true
      days: blobRetentionDays
    }
    containerDeleteRetentionPolicy: {
      enabled: true
      days: blobRetentionDays
    }
  }
}

resource container 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: containerName
  properties: {
    publicAccess: 'None'
  }
}

resource storageSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/STORAGE-CONNECTION-STRING'
  properties: {
    value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'
    contentType: 'Azure Storage connection string'
  }
}

output storageAccountName string = storageAccount.name
output storageAccountId string = storageAccount.id
output containerName string = container.name
output storageConnectionStringSecretUri string = storageSecret.properties.secretUri
