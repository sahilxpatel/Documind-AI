@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('The ID of the App Service Plan.')
param appServicePlanId string

@description('Key Vault Secret URI for Storage Connection String.')
param storageConnectionStringSecretUri string

@description('Key Vault Secret URI for Application Insights Instrumentation Key.')
param instrumentationKeySecretUri string

@description('Key Vault Secret URI for Application Insights Connection String.')
param appInsightsSecretUri string

@description('App Service Plan SKU.')
param appServicePlanSku string

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: 'func-${appName}'
  location: location
  tags: tags
  kind: 'functionapp,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlanId
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Node|20'
      minTlsVersion: '1.2'
      alwaysOn: appServicePlanSku != 'F1' && appServicePlanSku != 'D1' // Depends on the shared App Service Plan
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'AzureWebJobsStorage'
          value: '@Microsoft.KeyVault(SecretUri=${storageConnectionStringSecretUri})'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: '@Microsoft.KeyVault(SecretUri=${instrumentationKeySecretUri})'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${appInsightsSecretUri})'
        }
      ]
    }
  }
}

output functionAppName string = functionApp.name
output functionAppDefaultHostName string = functionApp.properties.defaultHostName
output functionAppPrincipalId string = functionApp.identity.principalId
