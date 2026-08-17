@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: 'log-${appName}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-${appName}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

resource appInsightsSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: '${keyVaultName}/APPINSIGHTS-CONNECTION-STRING'
  properties: {
    value: appInsights.properties.ConnectionString
  }
}

resource instrumentationKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: '${keyVaultName}/APPINSIGHTS-INSTRUMENTATION-KEY'
  properties: {
    value: appInsights.properties.InstrumentationKey
  }
}

output logAnalyticsWorkspaceId string = logAnalytics.id
output appInsightsSecretUri string = appInsightsSecret.properties.secretUri
output instrumentationKeySecretUri string = instrumentationKeySecret.properties.secretUri
