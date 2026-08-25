@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('''
Enable purge protection. Once enabled it can never be turned off, and the vault
cannot be permanently deleted until the retention window expires - which blocks
recreating a vault of the same name. Recommended for prod, left off for dev so
environments can be torn down and rebuilt.
''')
param enablePurgeProtection bool = false

@description('Soft-delete retention in days.')
@minValue(7)
@maxValue(90)
param softDeleteRetentionInDays int = 7

@description('JWT signing secret for the API.')
@secure()
param jwtSecret string

// Key Vault names are capped at 24 characters. appName already carries a
// 13-character uniqueString suffix, so "kv-documind-<unique>" is 25 characters
// and the previous unguarded 'kv-${appName}' failed validation at deploy time.
// Truncating keeps the unique suffix's entropy and cannot end in a hyphen.
var rawVaultName = 'kv-${appName}'
var vaultName = length(rawVaultName) > 24 ? substring(rawVaultName, 0, 24) : rawVaultName

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: vaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enableSoftDelete: true
    softDeleteRetentionInDays: softDeleteRetentionInDays
    enablePurgeProtection: enablePurgeProtection ? true : null
    // RBAC rather than access policies: role assignments are managed in
    // main.bicep alongside the managed identities that need them.
    enableRbacAuthorization: true
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      // App Service Key Vault references resolve from Azure's shared outbound
      // ranges, so restricting by IP would break them without VNet integration.
      bypass: 'AzureServices'
      defaultAction: 'Allow'
    }
  }
}

// Stored here rather than generated in Bicep: Bicep has no cryptographically
// secure random function, and a value derived from resource ids would be
// predictable. The caller supplies it from a pipeline secret.
resource jwtSecretResource 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'JWT-SECRET'
  properties: {
    value: jwtSecret
    contentType: 'HS256 signing key for API access tokens'
  }
}

output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output keyVaultId string = keyVault.id
output jwtSecretUri string = jwtSecretResource.properties.secretUri
