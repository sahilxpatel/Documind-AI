# DocuMind AI Infrastructure

Azure infrastructure-as-code for DocuMind AI, written in Bicep.

Bicep is the single source of truth. The earlier `infra/bicep/main.bicep` (a flat
duplicate that hardcoded a SQL password) and `infra/terraform/main.tf` (a partial
stack with no SQL, Key Vault or Function App) were removed to stop the three
definitions drifting apart.

## Layout

| Path | Purpose |
| :--- | :--- |
| `main.bicep` | Orchestrator: composes modules, assigns RBAC, declares outputs |
| `modules/*.bicep` | One file per service |
| `parameters/dev.bicepparam` | Dev SKUs and settings |
| `parameters/prod.bicepparam` | Production SKUs and settings |

### Modules

| Module | Creates |
| :--- | :--- |
| `keyvault.bicep` | Key Vault (RBAC auth) and the `JWT-SECRET` secret |
| `insights.bicep` | Log Analytics workspace + workspace-based Application Insights |
| `storage.bicep` | Storage account, `documents` container, soft delete |
| `sql.bicep` | SQL Server + database, firewall rules, `DATABASE-URL` secret |
| `servicebus.bicep` | Namespace, `document-processing` queue, send/listen SAS rules |
| `search.bicep` | Azure AI Search service |
| `openai.bicep` | Azure OpenAI account + chat and embedding model deployments |
| `communication.bicep` | Communication Services + Azure-managed email domain |
| `appservice.bicep` | Linux App Service Plan, API web app, web app for the SPA |
| `functionapp.bicep` | Linux Function App for the document worker |

## Two things Bicep does not do

**1. The Azure AI Search index.** Bicep can create the search *service* but there
is no ARM resource for an index definition; the REST API is the only way. Run it
separately, after the service exists:

```bash
export AZURE_SEARCH_ENDPOINT="https://<service>.search.windows.net"
export AZURE_SEARCH_KEY="<admin key>"
npm run search:index
```

Until this runs, every upload fails at the indexing step and every query
returns 404. `npm run search:inspect` reports the live index's compatibility
without changing anything.

**2. The database schema.** Run `prisma migrate deploy` (see the deployment
workflow). Bicep only provisions the empty database.

## Configuration contract

Every secret lands in Key Vault, and both compute identities read it through
`@Microsoft.KeyVault(SecretUri=...)` app settings, granted by a Key Vault Secrets
User role assignment scoped to the vault.

| Key Vault secret | Consumed as |
| :--- | :--- |
| `DATABASE-URL` | `DATABASE_URL` (API + worker) |
| `JWT-SECRET` | `JWT_SECRET` (API) |
| `STORAGE-CONNECTION-STRING` | `AZURE_STORAGE_CONNECTION_STRING` (API) |
| `SERVICE-BUS-SEND-CONNECTION-STRING` | `AZURE_SERVICE_BUS_CONNECTION_STRING` (API) |
| `SERVICE-BUS-LISTEN-CONNECTION-STRING` | `AZURE_SERVICE_BUS_CONNECTION_STRING` (worker) |
| `AZURE-OPENAI-KEY` | `AZURE_OPENAI_KEY` (API + worker) |
| `SEARCH-ADMIN-KEY` | `AZURE_SEARCH_KEY` (API + worker) |
| `COMMUNICATION-CONNECTION-STRING` | `AZURE_COMMUNICATION_CONNECTION_STRING` (worker) |
| `APPINSIGHTS-CONNECTION-STRING` | `APPLICATIONINSIGHTS_CONNECTION_STRING` (both) |

`DATABASE-URL` is emitted in Prisma's `sqlserver://host:1433;database=...` form.
Prisma's `sqlserver` provider cannot parse the ADO.NET form
(`Server=tcp:...;Initial Catalog=...`); the ADO.NET string is still published as
`SQL-CONNECTION-STRING` for SSMS and Azure Data Studio.

Two settings are deliberately *not* Key Vault references:

- `AzureWebJobsStorage` on the Function App. The platform reads it before app
  code runs and before managed-identity resolution is guaranteed, which is a
  known cause of "Azure Functions runtime is unreachable" on first boot.
- `VITE_API_URL` for the SPA. Vite inlines `VITE_*` at build time, so an app
  setting cannot change an already-built bundle. CI passes it during
  `vite build`, taking the value from the `backendAppUrl` deployment output.

## Deploying

### Prerequisites

- Azure CLI, logged in (`az login`) with the right subscription selected
- `SQL_ADMIN_PASSWORD` and `JWT_SECRET` in your environment

```bash
export SQL_ADMIN_PASSWORD='<strong password>'
export JWT_SECRET="$(openssl rand -base64 48)"   # 32+ characters required
```

The parameter files read these with `readEnvironmentVariable`, so template
compilation fails if they are missing rather than deploying something insecure.

### Validate, then deploy

```bash
az group create --name rg-documind-ai --location eastus

az deployment group validate \
  --resource-group rg-documind-ai \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam

az deployment group create \
  --resource-group rg-documind-ai \
  --template-file infra/main.bicep \
  --parameters infra/parameters/dev.bicepparam
```

Preview changes against an existing environment with `az deployment group what-if`
using the same arguments.

The deployment is idempotent, so CI runs it on every push and portal drift is
corrected automatically. Outputs contain no secrets.

### Resource naming

Names are `<prefix>-<appName>-<uniqueString(resourceGroup().id)>`, so they are
stable across redeployments of the same resource group but differ between
resource groups. `appName` is capped at 10 characters because Key Vault names are
limited to 24 in total.

Changing `appName` or the resource group creates a *parallel* set of resources
rather than renaming the existing ones.

## Cost estimate (dev)

| Resource | SKU | Approx. monthly |
| :--- | :--- | :--- |
| App Service Plan (shared by API, SPA and worker) | B1 | ~$13 |
| Azure SQL Database | Basic, 5 DTU | ~$5 |
| Service Bus | Standard | ~$10 |
| Azure AI Search | Basic | ~$74 |
| Blob Storage | Standard_LRS | ~$2 |
| Key Vault + Log Analytics | Standard / PerGB2018 | ~$2 |
| Azure OpenAI | Pay-per-token | usage-based |
| Communication Services | Pay-per-email | usage-based |
| **Total (excluding AI usage)** | | **~$106** |

AI Search Basic dominates the bill. The `free` tier does not support vector
search, so it is not an option for this application.

Production (`prod.bicepparam`) moves to P1v3, Standard SQL, Standard Search and
ZRS storage, and runs two instances.

## Security posture

- **No hardcoded secrets.** Passwords and keys arrive as `@secure()` parameters
  or are read from resource keys at deploy time and written straight to Key
  Vault.
- **Managed identities.** The API and worker use system-assigned identities with
  the Key Vault Secrets User role scoped to the vault, not the resource group.
- **Least-privilege messaging.** Separate send-only and listen-only Service Bus
  SAS rules replace the shared `RootManageSharedAccessKey`, which granted Manage
  over the entire namespace. They are namespace-scoped rather than queue-scoped
  because a queue-scoped rule emits a connection string containing `EntityPath=`,
  which the `@azure/service-bus` client rejects.
- **TLS everywhere.** `httpsOnly`, `minTlsVersion 1.2` and `supportsHttpsTrafficOnly`
  across App Service, Storage, SQL and Service Bus. FTPS deployment is disabled.
- **No public blobs.** `allowBlobPublicAccess: false`; documents are user data.
- **Diagnostics.** App Service and Function App logs are routed to the Log
  Analytics workspace, with a daily ingestion cap so a log storm cannot produce a
  surprise bill.

### Known trade-offs

- SQL and Storage use public endpoints with `AzureServices` bypass rather than
  Private Endpoints and VNet integration. Private networking needs a Premium
  plan and a VNet, which more than doubles the dev cost.
- Azure OpenAI and AI Search are accessed with API keys held in Key Vault rather
  than managed identity. Both support RBAC, so this is a reasonable next step.
- Key Vault purge protection is off in dev so environments can be torn down and
  rebuilt under the same name, and on in prod. Enabling it is irreversible.
