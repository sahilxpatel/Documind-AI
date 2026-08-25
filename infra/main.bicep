targetScope = 'resourceGroup'

@description('Environment name.')
@allowed([
  'dev'
  'prod'
])
param environment string

@description('Location for all resources.')
param location string = resourceGroup().location

@description('Location for the Azure OpenAI account. Model availability differs by region, so this is separate from `location`.')
param openAiLocation string = location

@description('Name of the application. Keep it short: a 13-character uniqueness suffix is appended.')
@minLength(3)
@maxLength(10)
param appName string

@description('SQL Server administrator username.')
param sqlAdminUser string

@description('SQL Server administrator password.')
@secure()
@minLength(12)
param sqlAdminPassword string

@description('Signing key for API access tokens. Must be at least 32 characters. Generate with: openssl rand -base64 48')
@secure()
@minLength(32)
param jwtSecret string

@description('Optional public IP allowed through the SQL firewall so migrations can run from CI.')
param deploymentClientIp string = ''

@description('Extra browser origins allowed to call the API, comma separated (custom domains, preview hosts).')
param additionalCorsOrigins string = ''

@description('Tags to apply to all resources.')
param tags object = {
  Project: 'DocuMind AI'
  Environment: environment
  ManagedBy: 'Bicep'
}

@description('App Service Plan SKU.')
param appServicePlanSku string

@description('Number of App Service Plan instances.')
param instanceCount int = 1

@description('SQL Database Tier.')
param sqlDbTier string

@description('Service Bus SKU Tier.')
param serviceBusSku string

@description('Azure AI Search SKU.')
param searchSku string

@description('Storage Account SKU.')
param storageSku string

@description('Enable Key Vault purge protection. Recommended for prod; blocks rebuilding a vault of the same name.')
param enableKeyVaultPurgeProtection bool = false

@description('Daily Log Analytics ingestion cap in GB.')
param logDailyQuotaGb int = 1

// A 13-character deterministic suffix keeps globally-unique names stable across
// redeployments of the same resource group.
var uniqueAppName = '${appName}-${uniqueString(resourceGroup().id)}'

var searchIndexName = 'documents'
var storageContainerName = 'documents'
var serviceBusQueueName = 'document-processing'

// -----------------------------------------------------------------------------
// Platform services
// -----------------------------------------------------------------------------

module keyVault 'modules/keyvault.bicep' = {
  name: 'keyVaultDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    enablePurgeProtection: enableKeyVaultPurgeProtection
    jwtSecret: jwtSecret
  }
}

module insights 'modules/insights.bicep' = {
  name: 'insightsDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    keyVaultName: keyVault.outputs.keyVaultName
    dailyQuotaGb: logDailyQuotaGb
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
    containerName: storageContainerName
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
    allowedClientIp: deploymentClientIp
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
    queueName: serviceBusQueueName
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
    indexName: searchIndexName
  }
}

module openAi 'modules/openai.bicep' = {
  name: 'openAiDeployment'
  params: {
    location: openAiLocation
    appName: uniqueAppName
    tags: tags
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

// -----------------------------------------------------------------------------
// Compute
// -----------------------------------------------------------------------------

module appService 'modules/appservice.bicep' = {
  name: 'appServiceDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    appServicePlanSku: appServicePlanSku
    instanceCount: instanceCount
    logAnalyticsWorkspaceId: insights.outputs.logAnalyticsWorkspaceId
    appInsightsSecretUri: insights.outputs.appInsightsSecretUri
    instrumentationKeySecretUri: insights.outputs.instrumentationKeySecretUri
    databaseUrlSecretUri: sql.outputs.databaseUrlSecretUri
    jwtSecretUri: keyVault.outputs.jwtSecretUri
    storageConnectionStringSecretUri: storage.outputs.storageConnectionStringSecretUri
    serviceBusSendConnectionSecretUri: serviceBus.outputs.sendConnectionSecretUri
    openAiKeySecretUri: openAi.outputs.openAiKeySecretUri
    searchKeySecretUri: search.outputs.searchKeySecretUri
    openAiEndpoint: openAi.outputs.openAiEndpoint
    openAiChatDeployment: openAi.outputs.chatDeploymentName
    openAiEmbeddingDeployment: openAi.outputs.embeddingDeploymentName
    searchEndpoint: search.outputs.searchServiceEndpoint
    searchIndexName: searchIndexName
    serviceBusQueueName: serviceBusQueueName
    storageContainerName: storageContainerName
    additionalCorsOrigins: additionalCorsOrigins
  }
}

module functionApp 'modules/functionapp.bicep' = {
  name: 'functionAppDeployment'
  params: {
    location: location
    appName: uniqueAppName
    tags: tags
    appServicePlanId: appService.outputs.appServicePlanId
    logAnalyticsWorkspaceId: insights.outputs.logAnalyticsWorkspaceId
    storageAccountName: storage.outputs.storageAccountName
    instrumentationKeySecretUri: insights.outputs.instrumentationKeySecretUri
    appInsightsSecretUri: insights.outputs.appInsightsSecretUri
    databaseUrlSecretUri: sql.outputs.databaseUrlSecretUri
    serviceBusListenConnectionSecretUri: serviceBus.outputs.listenConnectionSecretUri
    openAiKeySecretUri: openAi.outputs.openAiKeySecretUri
    searchKeySecretUri: search.outputs.searchKeySecretUri
    communicationConnectionSecretUri: communication.outputs.commSecretUri
    openAiEndpoint: openAi.outputs.openAiEndpoint
    openAiChatDeployment: openAi.outputs.chatDeploymentName
    openAiEmbeddingDeployment: openAi.outputs.embeddingDeploymentName
    searchEndpoint: search.outputs.searchServiceEndpoint
    searchIndexName: searchIndexName
    serviceBusQueueName: serviceBusQueueName
    storageContainerName: storageContainerName
    senderEmailAddress: communication.outputs.senderEmailAddress
  }
}

// -----------------------------------------------------------------------------
// RBAC
//
// Both compute identities read their configuration from Key Vault via
// @Microsoft.KeyVault(...) references, which requires the Key Vault Secrets User
// role. Scoped to the vault rather than the resource group so the identities
// cannot read unrelated resources.
// -----------------------------------------------------------------------------

resource vault 'Microsoft.KeyVault/vaults@2023-07-01' existing = {
  name: keyVault.outputs.keyVaultName
}

@description('Built-in Key Vault Secrets User role.')
var keyVaultSecretsUserRoleId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)

resource backendAppKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, appService.outputs.backendWebAppPrincipalId, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalId: appService.outputs.backendWebAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

resource functionAppKeyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  scope: vault
  name: guid(vault.id, functionApp.outputs.functionAppPrincipalId, keyVaultSecretsUserRoleId)
  properties: {
    roleDefinitionId: keyVaultSecretsUserRoleId
    principalId: functionApp.outputs.functionAppPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// -----------------------------------------------------------------------------
// Outputs
//
// No secrets or connection strings: deployment outputs are readable by anyone
// with reader access to the resource group. Secrets stay in Key Vault.
// -----------------------------------------------------------------------------

output frontendAppUrl string = 'https://${appService.outputs.frontendWebAppDefaultHostName}'
output backendAppUrl string = 'https://${appService.outputs.backendWebAppDefaultHostName}'
output functionAppUrl string = 'https://${functionApp.outputs.functionAppDefaultHostName}'

output backendWebAppName string = appService.outputs.backendWebAppName
output frontendWebAppName string = appService.outputs.frontendWebAppName
output functionAppName string = functionApp.outputs.functionAppName

output storageAccountName string = storage.outputs.storageAccountName
output sqlServerName string = sql.outputs.sqlServerName
output sqlServerFqdn string = sql.outputs.sqlServerFqdn
output sqlDatabaseName string = sql.outputs.sqlDatabaseName
output serviceBusNamespaceName string = serviceBus.outputs.serviceBusNamespaceName
output serviceBusQueueName string = serviceBus.outputs.serviceBusQueueName

output searchServiceName string = search.outputs.searchServiceName
output searchEndpoint string = search.outputs.searchServiceEndpoint
output searchIndexName string = searchIndexName

output openAiAccountName string = openAi.outputs.openAiAccountName
output openAiEndpoint string = openAi.outputs.openAiEndpoint
output openAiChatDeployment string = openAi.outputs.chatDeploymentName
output openAiEmbeddingDeployment string = openAi.outputs.embeddingDeploymentName

output communicationServiceName string = communication.outputs.communicationServiceName
output senderEmailAddress string = communication.outputs.senderEmailAddress
output keyVaultName string = keyVault.outputs.keyVaultName
