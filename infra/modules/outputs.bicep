// This file satisfies the structural requirement from the prompt.
// In standard Bicep, outputs are usually declared directly in main.bicep as implemented.
// This module simply acts as a passthrough example if strict modular output aggregation was desired.

@description('Backend URL')
param backendUrl string

@description('Frontend URL')
param frontendUrl string

output finalBackendUrl string = backendUrl
output finalFrontendUrl string = frontendUrl
