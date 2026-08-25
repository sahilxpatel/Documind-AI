@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('The ID of the App Service Plan to host the Function App.')
param appServicePlanId string

@description('Log Analytics workspace resource id for diagnostic settings.')
param logAnalyticsWorkspaceId string

@description('Name of the storage account used by the Functions runtime.')
param storageAccountName string

// --- Key Vault secret references -------------------------------------------------
@description('Key Vault Secret URI for the Application Insights instrumentation key.')
param instrumentationKeySecretUri string

@description('Key Vault Secret URI for the Application Insights connection string.')
param appInsightsSecretUri string

@description('Key Vault Secret URI for the Prisma-format DATABASE_URL.')
param databaseUrlSecretUri string

@description('Key Vault Secret URI for the Service Bus listen-only connection string.')
param serviceBusListenConnectionSecretUri string

@description('Key Vault Secret URI for the Azure OpenAI API key.')
param openAiKeySecretUri string

@description('Key Vault Secret URI for the Azure AI Search admin key.')
param searchKeySecretUri string

@description('Key Vault Secret URI for the Azure Communication Services connection string.')
param communicationConnectionSecretUri string

// --- Plain (non-secret) configuration --------------------------------------------
@description('Azure OpenAI endpoint.')
param openAiEndpoint string

@description('Azure OpenAI chat deployment name.')
param openAiChatDeployment string

@description('Azure OpenAI embedding deployment name.')
param openAiEmbeddingDeployment string

@description('Azure AI Search endpoint.')
param searchEndpoint string

@description('Azure AI Search index name.')
param searchIndexName string

@description('Service Bus queue name the worker listens on.')
param serviceBusQueueName string

@description('Blob container holding uploaded documents.')
param storageContainerName string

@description('Verified sender address for Azure Communication Services email.')
param senderEmailAddress string = ''

// AzureWebJobsStorage is read by the Functions platform before app code runs and
// before managed-identity Key Vault references are guaranteed to resolve. A
// Key Vault reference here is a known cause of "Azure Functions runtime is
// unreachable" on first boot, so the connection string is built inline instead.
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' existing = {
  name: storageAccountName
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}'

resource functionApp 'Microsoft.Web/sites@2023-12-01' = {
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
      ftpsState: 'Disabled'
      http20Enabled: true
      // Required on a dedicated plan: without Always On the host is unloaded
      // when idle and the Service Bus trigger stops draining the queue.
      alwaysOn: true
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
          value: storageConnectionString
        }
        {
          // Supported on dedicated plans and makes deployments atomic.
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
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
          value: '@Microsoft.KeyVault(SecretUri=${databaseUrlSecretUri})'
        }
        {
          // Name referenced by the trigger binding's `connection` property.
          name: 'AZURE_SERVICE_BUS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${serviceBusListenConnectionSecretUri})'
        }
        {
          name: 'AZURE_SERVICE_BUS_QUEUE'
          value: serviceBusQueueName
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: storageConnectionString
        }
        {
          name: 'AZURE_STORAGE_CONTAINER'
          value: storageContainerName
        }
        {
          name: 'AZURE_OPENAI_ENDPOINT'
          value: openAiEndpoint
        }
        {
          name: 'AZURE_OPENAI_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${openAiKeySecretUri})'
        }
        {
          name: 'AZURE_OPENAI_DEPLOYMENT_ID'
          value: openAiChatDeployment
        }
        {
          name: 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID'
          value: openAiEmbeddingDeployment
        }
        {
          name: 'AZURE_SEARCH_ENDPOINT'
          value: searchEndpoint
        }
        {
          name: 'AZURE_SEARCH_INDEX'
          value: searchIndexName
        }
        {
          name: 'AZURE_SEARCH_KEY'
          value: '@Microsoft.KeyVault(SecretUri=${searchKeySecretUri})'
        }
        {
          name: 'AZURE_COMMUNICATION_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${communicationConnectionSecretUri})'
        }
        {
          name: 'AZURE_COMMUNICATION_SENDER_EMAIL'
          value: senderEmailAddress
        }
      ]
    }
  }
}

resource functionDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: functionApp
  name: 'send-to-log-analytics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'FunctionAppLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output functionAppName string = functionApp.name
output functionAppDefaultHostName string = functionApp.properties.defaultHostName
output functionAppPrincipalId string = functionApp.identity.principalId
