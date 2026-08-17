targetScope = 'resourceGroup'

@description('Environment name.')
@allowed([
  'dev'
  'prod'
])
param environment string

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Name of the application.')
param appName string

@description('SQL Server administrator username.')
param sqlAdminUser string

@description('SQL Server administrator password.')
@secure()
param sqlAdminPassword string

@description('Tags to apply to all resources.')
param tags object = {
  Project: 'DocuMind AI'
  Environment: environment
  ManagedBy: 'Bicep'
}

@description('App Service Plan SKU.')
param appServicePlanSku string

@description('SQL Database Tier.')
param sqlDbTier string

@description('Service Bus SKU Tier.')
param serviceBusSku string

@description('Azure AI Search SKU.')
param searchSku string

@description('Storage Account SKU.')
param storageSku string

var uniqueAppName = '${appName}-${uniqueString(resourceGroup().id)}'

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVaultDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
  }
}

module insights 'modules/insights.bicep' = {
  name: 'insightsDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storageDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    storageSku: storageSku
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

module sql 'modules/sql.bicep' = {
  name: 'sqlDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    sqlAdminUser: sqlAdminUser
    sqlAdminPassword: sqlAdminPassword
    sqlDbTier: sqlDbTier
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

module serviceBus 'modules/servicebus.bicep' = {
  name: 'serviceBusDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    serviceBusSku: serviceBusSku
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

module search 'modules/search.bicep' = {
  name: 'searchDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    searchSku: searchSku
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

module communication 'modules/communication.bicep' = {
  name: 'communicationDeployment'
  params: {
    location: 'global'
    dataLocation: 'United States'
    appName: uniqueAppName
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
  }
}

module appService 'modules/appservice.bicep' = {
  name: 'appServiceDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    appServicePlanSku: appServicePlanSku
    appInsightsSecretUri: insights.outputs.appInsightsSecretUri
    instrumentationKeySecretUri: insights.outputs.instrumentationKeySecretUri
    sqlConnectionStringSecretUri: sql.outputs.sqlConnectionStringSecretUri
  }
}

module functionApp 'modules/functionapp.bicep' = {
  name: 'functionAppDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    appServicePlanId: appService.outputs.appServicePlanId
    appServicePlanSku: appServicePlanSku
    storageConnectionStringSecretUri: storage.outputs.storageConnectionStringSecretUri
    appInsightsSecretUri: insights.outputs.appInsightsSecretUri
    instrumentationKeySecretUri: insights.outputs.instrumentationKeySecretUri
  }
}

// Key Vault Secrets User Role Definition ID
var keyVaultSecretsUserRoleId = subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')

// RBAC Role Assignment for Backend Web App
resource backendAppKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, appService.outputs.backendWebAppPrincipalId, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalId: appService.outputs.backendWebAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// RBAC Role Assignment for Function App
resource functionAppKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, functionApp.outputs.functionAppPrincipalId, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalId: functionApp.outputs.functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Secure Outputs (No Secrets or Connection Strings)
output frontendAppUrl string = 'https://${appService.outputs.frontendWebAppDefaultHostName}'
output backendAppUrl string = 'https://${appService.outputs.backendWebAppDefaultHostName}'
output functionAppUrl string = 'https://${functionApp.outputs.functionAppDefaultHostName}'
output storageAccountName string = storage.outputs.storageAccountName
output sqlServerName string = sql.outputs.sqlServerName
output sqlDatabaseName string = sql.outputs.sqlDatabaseName
output serviceBusNamespaceName string = serviceBus.outputs.serviceBusNamespaceName
output serviceBusQueueName string = serviceBus.outputs.serviceBusQueueName
output searchServiceName string = search.outputs.searchServiceName
output communicationServiceName string = communication.outputs.communicationServiceName
output keyVaultName string = keyVault.outputs.keyVaultName
