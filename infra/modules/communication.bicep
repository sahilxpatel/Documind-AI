@description('Location for the Communication Services resource. Must be "global".')
param location string = 'global'

@description('Data location for the communication service.')
param dataLocation string = 'United States'

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

@description('''
Provision an Azure-managed email domain and connect it to the service.
This yields a sender address of the form
DoNotReply@<guid>.azurecomm.net, which works without DNS verification and is
suitable for dev. Production should use a verified custom domain instead.
''')
param provisionAzureManagedDomain bool = true

resource emailService 'Microsoft.Communication/emailServices@2023-04-01' = if (provisionAzureManagedDomain) {
  name: 'email-${appName}'
  location: 'global'
  tags: tags
  properties: {
    dataLocation: dataLocation
  }
}

resource managedDomain 'Microsoft.Communication/emailServices/domains@2023-04-01' = if (provisionAzureManagedDomain) {
  parent: emailService
  name: 'AzureManagedDomain'
  location: 'global'
  tags: tags
  properties: {
    domainManagement: 'AzureManaged'
    userEngagementTracking: 'Disabled'
  }
}

resource communicationService 'Microsoft.Communication/communicationServices@2023-04-01' = {
  name: 'comm-${appName}'
  location: location
  tags: tags
  properties: {
    dataLocation: dataLocation
    // Linking the domain here is what allows the service to send from it.
    linkedDomains: provisionAzureManagedDomain ? [managedDomain.id] : []
  }
}

resource commSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/COMMUNICATION-CONNECTION-STRING'
  properties: {
    value: communicationService.listKeys().primaryConnectionString
    contentType: 'Azure Communication Services connection string'
  }
}

output communicationServiceName string = communicationService.name
output communicationServiceId string = communicationService.id
output commSecretUri string = commSecret.properties.secretUri

// Empty when no managed domain was provisioned; the worker then skips email.
output senderEmailAddress string = provisionAzureManagedDomain
  ? 'DoNotReply@${managedDomain.properties.mailFromSenderDomain}'
  : ''
