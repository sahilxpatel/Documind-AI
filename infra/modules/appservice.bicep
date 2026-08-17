@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('App Service Plan SKU.')
@allowed([
  'B1'
  'B2'
  'P1v3'
])
param appServicePlanSku string = 'B1'

@description('Key Vault Secret URI for Application Insights Connection String.')
param appInsightsSecretUri string

@description('Key Vault Secret URI for Application Insights Instrumentation Key.')
param instrumentationKeySecretUri string

@description('Key Vault Secret URI for SQL Connection String.')
param sqlConnectionStringSecretUri string

resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: 'asp-${appName}'
  location: location
  tags: tags
  sku: {
    name: appServicePlanSku
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource backendWebApp 'Microsoft.Web/sites@2022-09-01' = {
  name: 'app-api-${appName}'
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      minTlsVersion: '1.2'
      alwaysOn: appServicePlanSku != 'F1' && appServicePlanSku != 'D1'
      healthCheckPath: '/health' // Ensure health check is configured
      appSettings: [
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: '@Microsoft.KeyVault(SecretUri=${instrumentationKeySecretUri})'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${appInsightsSecretUri})'
        }
        {
          name: 'DATABASE_URL'
          value: '@Microsoft.KeyVault(SecretUri=${sqlConnectionStringSecretUri})'
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
      ]
    }
  }
}

resource frontendWebApp 'Microsoft.Web/sites@2022-09-01' = {
  name: 'app-web-${appName}'
  location: location
  tags: tags
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      minTlsVersion: '1.2'
      appCommandLine: 'pm2 serve /home/site/wwwroot --no-daemon --spa'
      appSettings: [
        {
          name: 'VITE_API_URL'
          value: 'https://${backendWebApp.properties.defaultHostName}'
        }
      ]
    }
  }
}

output appServicePlanId string = appServicePlan.id
output backendWebAppName string = backendWebApp.name
output backendWebAppDefaultHostName string = backendWebApp.properties.defaultHostName
output backendWebAppPrincipalId string = backendWebApp.identity.principalId
output frontendWebAppName string = frontendWebApp.name
output frontendWebAppDefaultHostName string = frontendWebApp.properties.defaultHostName
