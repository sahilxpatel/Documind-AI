@description('Location for all resources (Data location).')
param location string = 'global'

@description('Data location for communication service.')
param dataLocation string = 'United States'

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01-preview' = {
  name: 'comm-${appName}'
  location: location
  tags: tags
  properties: {
    dataLocation: dataLocation
  }
}

resource commSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: '${keyVaultName}/COMMUNICATION-CONNECTION-STRING'
  properties: {
    value: communicationService.listKeys().primaryConnectionString
  }
}

output communicationServiceName string = communicationService.name
output communicationServiceId string = communicationService.id
output commSecretUri string = commSecret.properties.secretUri
