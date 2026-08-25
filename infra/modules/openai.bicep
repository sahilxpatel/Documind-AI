@description('Location for the Azure OpenAI account. Model availability varies by region.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

@description('Chat model deployment name. The app reads this as AZURE_OPENAI_DEPLOYMENT_ID.')
param chatDeploymentName string = 'gpt-4o-mini'

@description('Chat model to deploy.')
param chatModelName string = 'gpt-4o-mini'

@description('Chat model version.')
param chatModelVersion string = '2024-07-18'

@description('Tokens-per-minute capacity for the chat deployment, in thousands.')
param chatCapacity int = 30

@description('Embedding model deployment name. The app reads this as AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID.')
param embeddingDeploymentName string = 'text-embedding-3-small'

@description('Embedding model to deploy.')
param embeddingModelName string = 'text-embedding-3-small'

@description('Embedding model version.')
param embeddingModelVersion string = '1'

@description('Tokens-per-minute capacity for the embedding deployment, in thousands.')
param embeddingCapacity int = 30

resource openAiAccount 'Microsoft.CognitiveServices/accounts@2024-10-01' = {
  name: 'oai-${appName}'
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    // Required: the endpoint the SDK builds is derived from this subdomain.
    customSubDomainName: 'oai-${appName}'
    publicNetworkAccess: 'Enabled'
    // Blocks the legacy key-in-query-string style of access.
    disableLocalAuth: false
  }
}

// Deployments must be created sequentially: the control plane rejects concurrent
// writes to the same account with a conflict.
resource chatDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAiAccount
  name: chatDeploymentName
  sku: {
    name: 'GlobalStandard'
    capacity: chatCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: chatModelName
      version: chatModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
}

resource embeddingDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-10-01' = {
  parent: openAiAccount
  name: embeddingDeploymentName
  sku: {
    name: 'Standard'
    capacity: embeddingCapacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: embeddingModelName
      version: embeddingModelVersion
    }
    versionUpgradeOption: 'OnceCurrentVersionExpired'
  }
  dependsOn: [
    chatDeployment
  ]
}

resource openAiKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/AZURE-OPENAI-KEY'
  properties: {
    value: openAiAccount.listKeys().key1
    contentType: 'Azure OpenAI API key'
  }
}

output openAiAccountName string = openAiAccount.name
output openAiEndpoint string = openAiAccount.properties.endpoint
output openAiKeySecretUri string = openAiKeySecret.properties.secretUri
output chatDeploymentName string = chatDeployment.name
output embeddingDeploymentName string = embeddingDeployment.name
