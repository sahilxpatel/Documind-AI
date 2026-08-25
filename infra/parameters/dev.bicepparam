using '../main.bicep'

param environment = 'dev'
param location = 'eastus'
// Azure OpenAI model availability varies by region; eastus carries gpt-4o-mini
// and text-embedding-3-small.
param openAiLocation = 'eastus'
param appName = 'documind'

param sqlAdminUser = 'sqladmin'
// Secrets come from the environment at deploy time, never from this file.
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD')
param jwtSecret = readEnvironmentVariable('JWT_SECRET')

// Public IP allowed through the SQL firewall so `prisma migrate deploy` can run
// from the CI agent. Empty locally, set by the pipeline.
param deploymentClientIp = readEnvironmentVariable('DEPLOYMENT_CLIENT_IP', '')

// Additional browser origins (custom domains, preview hosts). The frontend Web
// App's own origin is always allowed.
param additionalCorsOrigins = readEnvironmentVariable('ADDITIONAL_CORS_ORIGINS', 'http://localhost:5173')

// Dev-optimised SKUs
param appServicePlanSku = 'B1' // Basic: Linux + Always On, adequate for dev
param instanceCount = 1
param sqlDbTier = 'Basic' // Cheapest tier for relational metadata
param serviceBusSku = 'Standard' // Basic does not support the features used here
param searchSku = 'basic' // Cheapest tier that supports vector search
param storageSku = 'Standard_LRS' // Cheapest redundancy option

// Off in dev so the environment can be torn down and rebuilt under the same name.
param enableKeyVaultPurgeProtection = false
param logDailyQuotaGb = 1
