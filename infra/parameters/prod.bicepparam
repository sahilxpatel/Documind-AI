using '../main.bicep'

param environment = 'prod'
param location = 'eastus'
param openAiLocation = 'eastus'
param appName = 'documind'

param sqlAdminUser = 'sqladmin'
// Secrets come from the environment at deploy time, never from this file.
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD')
param jwtSecret = readEnvironmentVariable('JWT_SECRET')

param deploymentClientIp = readEnvironmentVariable('DEPLOYMENT_CLIENT_IP', '')
param additionalCorsOrigins = readEnvironmentVariable('ADDITIONAL_CORS_ORIGINS', '')

// Production SKUs
param appServicePlanSku = 'P1v3' // Premium v3: better CPU, more memory for PDF parsing
param instanceCount = 2 // Two instances so a recycle does not drop all traffic
param sqlDbTier = 'Standard'
param serviceBusSku = 'Standard'
param searchSku = 'standard' // Standard is required for a read/write SLA
param storageSku = 'Standard_ZRS' // Zone-redundant

// On in prod: prevents an accidental or malicious permanent delete of the vault.
// Note this cannot be reversed, and blocks recreating a vault with the same name
// until the soft-delete retention window expires.
param enableKeyVaultPurgeProtection = true
param logDailyQuotaGb = 5
