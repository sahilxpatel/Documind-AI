using '../main.bicep'

param environment = 'dev'
param location = 'eastus'
param appName = 'documind'
param sqlAdminUser = 'sqladmin'
// Retrieve password from environment variables during deployment (Secure, no hardcoding)
param sqlAdminPassword = readEnvironmentVariable('SQL_ADMIN_PASSWORD', '')

// Dev-optimized SKUs (Cost optimization for MS for Startups)
param appServicePlanSku = 'B1' // Basic Tier is cheap, supports Linux & Always On
param sqlDbTier = 'Basic' // Basic Tier is cheapest for Dev SQL
param serviceBusSku = 'Standard' // Standard needed for topics/queues
param searchSku = 'basic' // Basic is the cheapest tier for Vector Search
param storageSku = 'Standard_LRS' // Locally Redundant Storage is cheapest
