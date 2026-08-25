# Deploying DocuMind AI to Azure

There are two paths. Pick one.

| | Use when | How |
| :--- | :--- | :--- |
| **[A. Existing resources](#path-a-deploy-to-existing-resources)** | Your Azure resources already exist and you do not want anything new created | `scripts/deploy-existing.ps1` |
| **[B. Greenfield](#path-b-greenfield-with-bicep-and-github-actions)** | Building a fresh environment from nothing | Bicep + GitHub Actions |

Path A configures and deploys onto what you already have, reading settings from
your local `.env` files. It creates no resources and needs no Key Vault.

---

# Path A: deploy to existing resources

## What it does

| Component | Goes to |
| :--- | :--- |
| API **and** web UI | your existing App Service |
| Document worker | your existing Function App |

The built SPA is packaged inside the API deployment and served by Express from
the same origin. That is deliberate: a typical resource group has one App
Service, and hosting the UI there avoids provisioning a second one. It also
removes two problems — same-origin requests need no CORS allow-list, and the
frontend uses relative URLs instead of having the API origin compiled into the
bundle.

Application settings come from `apps/backend/.env` and
`apps/functions/local.settings.json`, so the values you already filled in locally
become the values in Azure. No Key Vault is required.

## Before you start

```powershell
winget install --exact --id Microsoft.AzureCLI   # then open a NEW terminal
az login
az account set --subscription "<your subscription>"
```

Check your configuration and confirm every Azure service is reachable:

```bash
npm run check:env        # keys present, correctly formatted, API and worker agree
npm run check:azure      # live calls to SQL, Blob, Service Bus, OpenAI, Search, ACS
```

`check:azure` makes real requests, including a small chat completion and an
embedding, so a pass means the app will genuinely work. Neither script prints
keys or connection strings.

## Deploy

Preview first — this prints every setting name and the runtime changes, and
touches nothing:

```powershell
./scripts/deploy-existing.ps1 -ResourceGroup rg-documind-ai -DryRun
```

Then apply:

```powershell
./scripts/deploy-existing.ps1 -ResourceGroup rg-documind-ai
```

App Service and Function App names are auto-detected from the resource group.
Pass `-ApiAppName` / `-FunctionAppName` if there is more than one of either.

Useful switches: `-ApiOnly`, `-WorkerOnly`, `-SkipBuild`, `-SkipSettings`.

The script is idempotent, so re-running it is the normal way to ship a change.

### What it changes on existing resources

It creates nothing, but it does update configuration:

- Application settings on both apps (from your local config)
- `linuxFxVersion` to **Node 20** on both — the resources were created on Node 18
  and this code requires 20
- An explicit startup command, `node dist/index.js`, so Oryx does not have to guess
- `alwaysOn`, `httpsOnly`, TLS 1.2 minimum, FTPS disabled, health check `/health`
- `SCM_DO_BUILD_DURING_DEPLOYMENT=false`, because the package already contains
  compiled JS and production `node_modules`

## Database and search index

Run these once, before or just after the first deploy.

**1. Apply the migration.** `prisma/migrations/0_init` is the committed baseline,
so this is a normal versioned deploy:

```bash
npm run check:migration                            # read-only report
npm run prisma:migrate --workspace=apps/backend    # prisma migrate deploy
```

`check:migration` reports current row counts, document statuses, and whether
anything blocks the unique constraint on `DocumentChunk(documentId, chunkIndex)`.
Run it before any future schema change too — a unique constraint fails if
duplicates already exist.

Your workstation IP needs a SQL firewall rule to connect:

```bash
az sql server firewall-rule create \
  --resource-group rg-documind-ai --server <sql-server-name> \
  --name my-workstation \
  --start-ip-address "$(curl -s https://api.ipify.org)" \
  --end-ip-address "$(curl -s https://api.ipify.org)"
```

**2. Update the search index.**

```bash
npm run search:inspect                  # what the live index looks like now
npm run search:index                    # create or update in place
npm run search:index -- --recreate      # only if the script says it must be rebuilt
```

A rebuild is required when the index lacks the `userId` field, which the API uses
to scope every query to the calling user inside the search service. Rebuilding
discards indexed chunks only — document rows and blobs are untouched, so
re-uploading or re-queueing a document restores it to search.

## After deploying

```bash
curl https://<app-name>.azurewebsites.net/health/ready
```

Expect `{"status":"ready","checks":{"database":{"status":"up"},...}}`. The script
polls this for you and also verifies that `/dashboard` returns the SPA shell,
which proves deep links do not 404 on refresh.

If something is wrong:

```bash
az webapp log tail --name <app-name> --resource-group rg-documind-ai
```

---

# Path B: greenfield with Bicep and GitHub Actions

Use this to build a **new** environment from scratch. It provisions everything
(including Key Vault and Azure OpenAI), then deploys. It will not adopt existing
resources — names are derived from `uniqueString(resourceGroup().id)`, so
deploying into a group that already has differently-named resources creates a
parallel set alongside them.

The pipeline in `.github/workflows/deploy.yml` provisions infrastructure, migrates
the database, creates the search index and deploys all three components.

Stages run in this order, because each depends on the previous one being real:

```
validate  ->  infrastructure  ->  build  ->  provision  ->  deploy
```

`build` runs after `infrastructure` because Vite inlines the API URL into the
bundle at build time, so it needs the deployed backend's hostname. `deploy` runs
after `provision` because an API without its database schema or search index will
start successfully and then fail every request.

---

## 1. One-time Azure setup

### Register the OIDC identity

The workflow authenticates with federated credentials, so there is no long-lived
`AZURE_CREDENTIALS` secret to rotate.

```bash
SUBSCRIPTION_ID=$(az account show --query id -o tsv)
RG=rg-documind-ai
APP_NAME=documind-github-actions

az group create --name "$RG" --location eastus

# App registration + service principal
APP_ID=$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)
az ad sp create --id "$APP_ID"

# Contributor on the resource group is enough to deploy everything here.
az role assignment create \
  --role Contributor \
  --assignee "$APP_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG"

# Creating role assignments (Key Vault Secrets User) needs this as well.
az role assignment create \
  --role "User Access Administrator" \
  --assignee "$APP_ID" \
  --scope "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$RG"

# Trust pushes to main. Add one credential per branch or environment you deploy.
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:<OWNER>/<REPO>:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

echo "AZURE_CLIENT_ID       = $APP_ID"
echo "AZURE_SUBSCRIPTION_ID = $SUBSCRIPTION_ID"
echo "AZURE_TENANT_ID       = $(az account show --query tenantId -o tsv)"
```

If you deploy via a GitHub **environment** (the workflow uses `dev`/`prod`), the
federated subject must be `repo:<OWNER>/<REPO>:environment:dev` instead of the
`ref:` form.

### Check Azure OpenAI quota

`infra/modules/openai.bicep` deploys `gpt-4o-mini` and `text-embedding-3-small`.
Model availability and quota vary by region and subscription:

```bash
az cognitiveservices account list-skus --location eastus --kind OpenAI -o table
```

If either model is unavailable in your region, set `openAiLocation` in the
parameter file to one where it is, or override the deployment parameters.

---

## 2. Repository configuration

### Secrets (Settings -> Secrets and variables -> Actions -> Secrets)

| Secret | Value |
| :--- | :--- |
| `AZURE_CLIENT_ID` | App registration client id from above |
| `AZURE_TENANT_ID` | Tenant id |
| `AZURE_SUBSCRIPTION_ID` | Subscription id |
| `SQL_ADMIN_PASSWORD` | Strong password, 12+ characters |
| `JWT_SECRET` | `openssl rand -base64 48` — **32+ characters, or the API refuses to start** |

### Variables (same page, Variables tab)

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `AZURE_RESOURCE_GROUP` | `rg-documind-ai` | Target resource group |
| `AZURE_LOCATION` | `eastus` | Region for the group |
| `ADDITIONAL_CORS_ORIGINS` | *(empty)* | Extra browser origins, comma separated. The SPA's own origin is always allowed. |

---

## 3. Deploy

Push to `main`, or trigger **Actions -> Build and Deploy DocuMind AI -> Run
workflow** and pick an environment.

The infrastructure job prints every resource name and URL to the run summary.

### What each stage verifies

| Stage | Check |
| :--- | :--- |
| `validate` | Prisma schema copies in sync, all workspaces type-check and lint |
| `infrastructure` | Required secrets present, Bicep validates, then deploys |
| `build` | Self-contained artifacts for API, worker and SPA |
| `provision` | `prisma migrate deploy`, then create/update the search index |
| `deploy-api` | Polls `/health/ready` until the database round-trip succeeds |
| `deploy-worker` | Confirms the Function App reports at least one function |
| `deploy-web` | Confirms `/healthz` serves and `/dashboard` returns 200 (SPA fallback) |

Those final checks matter: a green `webapps-deploy` step only means the zip
uploaded. The readiness poll is what catches a bad connection string or a missing
app setting, and the function count is what catches a worker that throws while
loading a module — which otherwise looks identical to a successful deploy.

---

## 4. Notes on data stores

### Database migrations

`apps/backend/prisma/migrations/0_init` is the committed baseline, so the pipeline
runs `prisma migrate deploy` rather than falling back to `db push`.

For a **brand new, empty** database this applies cleanly. For a database that
already has the tables (baselined outside CI), mark the baseline as applied once
so Prisma does not try to recreate them:

```bash
cd apps/backend
DATABASE_URL='<connection string>' npx prisma migrate resolve --applied 0_init
```

To add a schema change later, edit `schema.prisma`, then generate and commit a new
migration folder:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/<timestamp>_<name>/migration.sql
```

Keep `apps/functions/prisma/schema.prisma` in sync; `npm run check:schema-drift`
fails the build otherwise.

### Search index

The pipeline creates the index automatically. It will refuse to continue if an
*existing* index cannot be updated in place — for example when a field's type,
vector dimension or vector profile changes. That is deliberate: rebuilding drops
every indexed chunk.

To rebuild intentionally, run the workflow manually with
**recreate_search_index** enabled, then re-queue documents so they are re-indexed.
Document rows and blobs are untouched by a rebuild.

Inspect the live index at any time without changing it:

```bash
npm run search:inspect
```

---

## 5. Local development

```bash
npm install
npm run prisma:generate

cp .env.example apps/backend/.env       # then fill in
cp .env.example apps/functions/.env     # worker also needs local.settings.json

npm run check:env                       # validates keys, formats and cross-file consistency
```

`npm run check:env` prints key names, value lengths and pass/fail only — never the
values — so its output is safe to paste into an issue.

Then, in three terminals:

```bash
npm run dev --workspace=apps/backend     # http://localhost:4000
npm start  --workspace=apps/functions    # requires Azure Functions Core Tools
npm run dev --workspace=apps/frontend    # http://localhost:5173
```

Leave `VITE_API_URL` empty in `apps/frontend/.env` to route API calls through the
Vite dev proxy on a single origin, which sidesteps CORS entirely. If you set it,
use the **origin only** — `http://localhost:4000`, not `.../api`, because every
call site already adds the `/api` prefix.

To run against Azure SQL from your machine, add your IP to the server firewall:

```bash
az sql server firewall-rule create \
  --resource-group rg-documind-ai --server <sql-server-name> \
  --name my-workstation \
  --start-ip-address "$(curl -s https://api.ipify.org)" \
  --end-ip-address "$(curl -s https://api.ipify.org)"
```

---

## 6. Operating notes

### Health endpoints

- `GET /health` — liveness, no dependencies. This is what App Service polls.
  Kept dependency-free on purpose: failing it makes Azure recycle the instance, so
  a database outage must not trigger an endless replacement loop.
- `GET /health/ready` — readiness. Runs `SELECT 1` against Azure SQL and reports
  which integrations are configured. Used by CI and suitable for an external
  monitor.

A Basic-tier or serverless Azure SQL database parks when idle and can take 15+
seconds to accept its first connection, so the readiness probe allows 20 seconds
(`DB_HEALTHCHECK_TIMEOUT_MS`).

### When a document gets stuck

Status lives on the `Document` row: `UPLOADED` -> `PROCESSING` -> `COMPLETED`, or
`FAILED` with the reason in `errorMessage`.

The worker rethrows on failure, so Service Bus retries up to `maxDeliveryCount`
(5) and then moves the message to the dead-letter queue. Inspect it with:

```bash
az servicebus queue show \
  --resource-group rg-documind-ai \
  --namespace-name <namespace> \
  --name document-processing \
  --query countDetails
```

Reprocessing is idempotent: the worker clears the document's existing chunks
first, and search documents are keyed `<documentId>-<chunkIndex>`, so a replay
overwrites rather than duplicates.

Scanned PDFs with no text layer fail with a message saying so — text extraction
does not perform OCR.

### Logs

```bash
az webapp log tail --name <api-app-name> --resource-group rg-documind-ai
```

Both the API and the worker send traces to Application Insights. The API logs one
structured line per request with a `requestId`, correlated with the
`x-request-id` response header.

### Rotating a secret

Update the Key Vault secret, then restart the consumers so the reference is
re-resolved:

```bash
az keyvault secret set --vault-name <kv> --name JWT-SECRET --value "$(openssl rand -base64 48)"
az webapp restart --name <api-app-name> --resource-group rg-documind-ai
```

Rotating `JWT-SECRET` invalidates every issued token, so all users are signed out.
