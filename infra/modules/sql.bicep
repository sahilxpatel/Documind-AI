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

@description('Optional client IP address to allow through the SQL firewall (for running migrations from CI or a workstation).')
param allowedClientIp string = ''

@description('Enable zone redundancy for the database. Requires a Premium/Business Critical tier.')
param zoneRedundant bool = false

resource sqlServer 'Microsoft.Sql/servers@2023-08-01' = {
  name: 'sql-${appName}'
  location: location
  tags: tags
  properties: {
    administratorLogin: sqlAdminUser
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    // Blocks SQL auth from being the only option is not desired here, but
    // restricting outbound access keeps the server from reaching arbitrary hosts.
    restrictOutboundNetworkAccess: 'Disabled'
  }
}

// The 0.0.0.0-0.0.0.0 range is the documented sentinel meaning "allow Azure
// services", which is how App Service and the Function App reach the database.
resource sqlFirewallAzureServices 'Microsoft.Sql/servers/firewallRules@2023-08-01' = {
  parent: sqlServer
  name: 'AllowAllWindowsAzureIps'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// Prisma migrations run from the CI agent, which is outside Azure, so its egress
// IP needs an explicit rule. Left empty when migrations run elsewhere.
resource sqlFirewallClient 'Microsoft.Sql/servers/firewallRules@2023-08-01' = if (!empty(allowedClientIp)) {
  parent: sqlServer
  name: 'AllowDeploymentClient'
  properties: {
    startIpAddress: allowedClientIp
    endIpAddress: allowedClientIp
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: sqlServer
  name: 'sqldb-${appName}'
  location: location
  tags: tags
  sku: {
    name: sqlDbTier
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    zoneRedundant: zoneRedundant
  }
}

// Retention protects against accidental deletes on the Basic tier, which has no
// long-term backup by default.
resource shortTermRetention 'Microsoft.Sql/servers/databases/backupShortTermRetentionPolicies@2023-08-01' = {
  parent: sqlDatabase
  name: 'default'
  properties: {
    retentionDays: 7
  }
}

// -----------------------------------------------------------------------------
// Connection strings
//
// Prisma's `sqlserver` datasource provider parses the JDBC-style URL below, NOT
// the ADO.NET format. Handing Prisma an ADO.NET string ("Server=tcp:...;Initial
// Catalog=...") makes the client fail to initialise on the first query, so this
// is the format DATABASE_URL must receive.
//
// encrypt=true and trustServerCertificate=false are required for Azure SQL.
// -----------------------------------------------------------------------------
var prismaConnectionString = 'sqlserver://${sqlServer.properties.fullyQualifiedDomainName}:1433;database=${sqlDatabase.name};user=${sqlAdminUser};password=${sqlAdminPassword};encrypt=true;trustServerCertificate=false;connectionLimit=5;connectTimeout=30;schema=dbo'

resource databaseUrlSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/DATABASE-URL'
  properties: {
    value: prismaConnectionString
    contentType: 'Prisma sqlserver connection URL'
  }
}

// Kept for tools that expect ADO.NET (SSMS, Azure Data Studio, .NET clients).
resource adoNetSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  name: '${keyVaultName}/SQL-CONNECTION-STRING'
  properties: {
    value: 'Server=tcp:${sqlServer.properties.fullyQualifiedDomainName},1433;Initial Catalog=${sqlDatabase.name};Persist Security Info=False;User ID=${sqlAdminUser};Password=${sqlAdminPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
    contentType: 'ADO.NET connection string'
  }
}

output sqlServerName string = sqlServer.name
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output sqlDatabaseName string = sqlDatabase.name
output databaseUrlSecretUri string = databaseUrlSecret.properties.secretUri
output databaseUrlSecretName string = 'DATABASE-URL'
output sqlConnectionStringSecretUri string = adoNetSecret.properties.secretUri
