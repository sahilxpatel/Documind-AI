param location string = resourceGroup().location
param sqlLocation string = 'centralus'
param appName string = 'documind-ai-${uniqueString(resourceGroup().id)}'
param myIpAddress string = ''

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2022-09-01' = {
  name: 'st${uniqueString(resourceGroup().id)}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: { supportsHttpsTrafficOnly: true }
}

// Service Bus
resource serviceBus 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: 'sb-${appName}'
  location: location
  sku: { name: 'Standard', tier: 'Standard' }
}

resource queue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBus
  name: 'document-processing'
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: 'asp-${appName}'
  location: location
  sku: { name: 'B1', tier: 'Basic' }
  properties: { reserved: true }
}

// Backend Web App
resource webApp 'Microsoft.Web/sites@2022-09-01' = {
  name: 'app-${appName}'
  location: location
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: { linuxFxVersion: 'NODE|18-lts' }
  }
}

// Azure Function
resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: 'func-${appName}'
  location: location
  kind: 'functionapp,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'Node|18'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'node' }
        { name: 'AzureWebJobsStorage', value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};EndpointSuffix=${environment().suffixes.storage};AccountKey=${storageAccount.listKeys().keys[0].value}' }
      ]
    }
  }
}

// Azure AI Search
resource searchService 'Microsoft.Search/searchServices@2025-05-01' = {
  name: 'search-${appName}'
  location: location
  sku: { name: 'basic' }
  properties: { replicaCount: 1, partitionCount: 1 }
}

// Communication Services
resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01-preview' = {
  name: 'comm-${appName}'
  location: 'global'
  properties: { dataLocation: 'United States' }
}

// Azure SQL
resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: 'sqlc-${appName}'
  location: sqlLocation
  properties: {
    administratorLogin: 'sqladmin'
    administratorLoginPassword: 'ChangeYourPassword123!'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2022-05-01-preview' = {
  parent: sqlServer
  name: 'sqldb-${appName}'
  location: sqlLocation
  sku: { name: 'Basic' }
}

// SQL Firewall Rules
resource allowAzureServices 'Microsoft.Sql/servers/firewallRules@2022-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource allowMyIp 'Microsoft.Sql/servers/firewallRules@2022-05-01-preview' = if (!empty(myIpAddress)) {
  parent: sqlServer
  name: 'AllowMyIp'
  properties: {
    startIpAddress: myIpAddress
    endIpAddress: myIpAddress
  }
}