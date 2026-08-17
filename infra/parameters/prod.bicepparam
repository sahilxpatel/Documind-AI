using '../main.bicep'

param environment = 'prod'
param location = 'eastus'
param appName = 'documind'
param sqlAdminUser = 'sqladmin'
// Retrieve password from environment variables during deployment (Secure, no hardcoding)
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD', '')

// Production-ready SKUs
param appServicePlanSku = 'P1v3' // Premium V3 for production workloads
param sqlDbTier = 'Standard' // Standard or General Purpose for production SQL
param serviceBusSku = 'Standard'
param searchSku = 'standard' // Standard for production scale and SLA
param storageSku = 'Standard_ZRS' // Zone Redundant Storage for high availability
