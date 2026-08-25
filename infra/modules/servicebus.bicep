@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Service Bus SKU tier.')
@allowed([
  'Basic'
  'Standard'
  'Premium'
])
param serviceBusSku string = 'Standard'

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

@description('Name of the document processing queue.')
param queueName string = 'document-processing'

@description('Deliveries attempted before a message is dead-lettered.')
@minValue(1)
@maxValue(20)
param maxDeliveryCount int = 5

resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: 'sb-${appName}'
  location: location
  tags: tags
  sku: {
    name: serviceBusSku
    tier: serviceBusSku
  }
  properties: {
    minimumTlsVersion: '1.2'
    // SAS is still used because the Functions Service Bus trigger is configured
    // with a connection string. Switching to managed identity would mean binding
    // via fullyQualifiedNamespace instead.
    disableLocalAuth: false
  }
}

resource serviceBusQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: queueName
  properties: {
    // Must exceed the worker's functionTimeout (10 min) so a long PDF cannot lose
    // its lock mid-processing and get redelivered while still running.
    lockDuration: 'PT5M'
    maxSizeInMegabytes: 1024
    // The API sets messageId to the document id, so a retried publish is
    // collapsed instead of processing the same document twice.
    requiresDuplicateDetection: false
    requiresSession: false
    defaultMessageTimeToLive: 'P14D'
    deadLetteringOnMessageExpiration: true
    // The worker rethrows on failure, so exhausted deliveries land in the
    // dead-letter queue where they can be inspected and replayed.
    maxDeliveryCount: maxDeliveryCount
    enableBatchedOperations: true
  }
}

// -----------------------------------------------------------------------------
// Least-privilege SAS rules.
//
// Previously both components shared RootManageSharedAccessKey, which grants
// Manage (create/delete any entity) on the whole namespace. The API only needs
// to send and the worker only needs to receive.
//
// These are namespace-scoped rather than queue-scoped on purpose: a queue-scoped
// rule produces a connection string containing `EntityPath=`, which the
// @azure/service-bus client rejects and which conflicts with the queueName on
// the Functions trigger binding.
// -----------------------------------------------------------------------------
resource sendRule 'Microsoft.ServiceBus/namespaces/AuthorizationRules@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'api-send'
  properties: {
    rights: [
      'Send'
    ]
  }
}

resource listenRule 'Microsoft.ServiceBus/namespaces/AuthorizationRules@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'worker-listen'
  properties: {
    rights: [
      'Listen'
    ]
  }
}

resource sendConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/SERVICE-BUS-SEND-CONNECTION-STRING'
  properties: {
    value: sendRule.listKeys().primaryConnectionString
    contentType: 'Service Bus queue send-only connection string'
  }
}

resource listenConnectionSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/SERVICE-BUS-LISTEN-CONNECTION-STRING'
  properties: {
    value: listenRule.listKeys().primaryConnectionString
    contentType: 'Service Bus queue listen-only connection string'
  }
}

output serviceBusNamespaceName string = serviceBusNamespace.name
output serviceBusQueueName string = serviceBusQueue.name
output sendConnectionSecretUri string = sendConnectionSecret.properties.secretUri
output listenConnectionSecretUri string = listenConnectionSecret.properties.secretUri
