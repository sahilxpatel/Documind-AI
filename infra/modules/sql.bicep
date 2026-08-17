@description('Location for all resources.')
param location string

@description('Name of the application.')
param appName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('SQL Server administrator username.')
param sqlAdminUser string

@description('SQL Server administrator password.')
@secure()
param sqlAdminPassword string

@description('The tier for the SQL Database.')
@allowed([
  'Basic'
  'Standard'
])
param sqlDbTier string = 'Basic'

@description('Name of the Key Vault to store secrets.')
param keyVaultName string

resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: 'sql-${appName}'
  location: location
  tags: tags
  properties: {
    administratorLogin: sqlAdminUser
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource sqlFirewallRule 'Microsoft.Sql/servers/firewallRules@2022-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2022-05-01-preview' = {
  parent: sqlServer
  name: 'sqldb-${appName}'
  location: location
  tags: tags
  sku: {
    name: sqlDbTier
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
  }
}

resource sqlSecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  name: '${keyVaultName}/SQL-CONNECTION-STRING'
  properties: {
    value: 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Initial Catalog=${sqlDatabase.name};Persist Security Info=False;User ID=${sqlAdminUser};Password=${sqlAdminPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
  }
}

output sqlServerName string = sqlServer.name
output sqlDatabaseName string = sqlDatabase.name
output sqlConnectionStringSecretUri string = sqlSecret.properties.secretUri
