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
  'B3'
  'P0v3'
  'P1v3'
  'P2v3'
])
param appServicePlanSku string = 'B1'

@description('Number of instances in the plan.')
@minValue(1)
param instanceCount int = 1

@description('Log Analytics workspace resource id for diagnostic settings.')
param logAnalyticsWorkspaceId string

// --- Key Vault secret references -------------------------------------------------
@description('Key Vault Secret URI for the Application Insights connection string.')
param appInsightsSecretUri string

@description('Key Vault Secret URI for the Application Insights instrumentation key.')
param instrumentationKeySecretUri string

@description('Key Vault Secret URI for the Prisma-format DATABASE_URL.')
param databaseUrlSecretUri string

@description('Key Vault Secret URI for the JWT signing secret.')
param jwtSecretUri string

@description('Key Vault Secret URI for the storage account connection string.')
param storageConnectionStringSecretUri string

@description('Key Vault Secret URI for the Service Bus send-only connection string.')
param serviceBusSendConnectionSecretUri string

@description('Key Vault Secret URI for the Azure OpenAI API key.')
param openAiKeySecretUri string

@description('Key Vault Secret URI for the Azure AI Search admin key.')
param searchKeySecretUri string

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

@description('Service Bus queue name.')
param serviceBusQueueName string

@description('Blob container holding uploaded documents.')
param storageContainerName string

@description('Additional browser origins allowed to call the API (comma separated).')
param additionalCorsOrigins string = ''

var backendAppName = 'app-api-${appName}'
var frontendAppName = 'app-web-${appName}'

// Computed from the name rather than read from the resource, which would create a
// circular dependency: the backend needs the frontend origin for CORS, and the
// frontend needs the backend URL for its API base.
var frontendOrigin = 'https://${frontendAppName}.azurewebsites.net'
var corsOrigins = empty(additionalCorsOrigins)
  ? frontendOrigin
  : '${frontendOrigin},${additionalCorsOrigins}'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'asp-${appName}'
  location: location
  tags: tags
  sku: {
    name: appServicePlanSku
    capacity: instanceCount
  }
  kind: 'linux'
  properties: {
    reserved: true
    zoneRedundant: false
  }
}

resource backendWebApp 'Microsoft.Web/sites@2023-12-01' = {
  name: backendAppName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    clientAffinityEnabled: false
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      // Explicit startup command. Without it Oryx guesses, and a package.json
      // whose `start` script depends on devDependencies fails at container boot.
      appCommandLine: 'node dist/index.js'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      alwaysOn: true
      healthCheckPath: '/health'
      // CORS is enforced in the app against an allow-list; leaving the platform
      // layer empty avoids two competing sets of rules.
      cors: {
        allowedOrigins: []
      }
      appSettings: [
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          // The deployment package already contains node_modules and a compiled
          // dist, so Oryx must not try to rebuild it on the instance.
          // Note: WEBSITE_RUN_FROM_PACKAGE=1 is deliberately not set - on Linux
          // App Service only a package URL is supported, and the bare "1" value
          // breaks the deployment.
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
          name: 'JWT_SECRET'
          value: '@Microsoft.KeyVault(SecretUri=${jwtSecretUri})'
        }
        {
          name: 'CORS_ORIGINS'
          value: corsOrigins
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${storageConnectionStringSecretUri})'
        }
        {
          name: 'AZURE_STORAGE_CONTAINER'
          value: storageContainerName
        }
        {
          name: 'AZURE_SERVICE_BUS_CONNECTION_STRING'
          value: '@Microsoft.KeyVault(SecretUri=${serviceBusSendConnectionSecretUri})'
        }
        {
          name: 'AZURE_SERVICE_BUS_QUEUE'
          value: serviceBusQueueName
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
      ]
    }
  }
}

resource frontendWebApp 'Microsoft.Web/sites@2023-12-01' = {
  name: frontendAppName
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
      // The Node 20 App Service image no longer bundles pm2, so the usual
      // `pm2 serve --spa` startup command fails at container start. server.mjs is
      // a dependency-free static server with the same SPA-fallback behaviour.
      appCommandLine: 'node server.mjs'
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      http20Enabled: true
      alwaysOn: true
      healthCheckPath: '/healthz'
      appSettings: [
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          // Informational only. Vite inlines VITE_* variables at build time, so
          // the value that actually ships is the one set during `vite build` in
          // CI. Recorded here so the expected API origin is visible in the portal.
          name: 'EXPECTED_API_ORIGIN'
          value: 'https://${backendAppName}.azurewebsites.net'
        }
      ]
    }
  }
}

// Route App Service platform logs into the same workspace as App Insights so
// container startup failures are diagnosable.
resource backendDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: backendWebApp
  name: 'send-to-log-analytics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
      {
        category: 'AppServicePlatformLogs'
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

resource frontendDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  scope: frontendWebApp
  name: 'send-to-log-analytics'
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        category: 'AppServiceConsoleLogs'
        enabled: true
      }
      {
        category: 'AppServiceHTTPLogs'
        enabled: true
      }
    ]
  }
}

output appServicePlanId string = appServicePlan.id
output backendWebAppName string = backendWebApp.name
output backendWebAppDefaultHostName string = backendWebApp.properties.defaultHostName
output backendWebAppPrincipalId string = backendWebApp.identity.principalId
output frontendWebAppName string = frontendWebApp.name
output frontendWebAppDefaultHostName string = frontendWebApp.properties.defaultHostName
output frontendWebAppPrincipalId string = frontendWebApp.identity.principalId
