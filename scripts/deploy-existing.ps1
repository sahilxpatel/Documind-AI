<#
.SYNOPSIS
  Deploys DocuMind AI to Azure resources that already exist. Creates nothing.

.DESCRIPTION
  Configures and deploys onto an existing resource group:

    * API + web UI  -> the existing App Service (the built SPA is served by the
                       API, so no second App Service or Static Web App is needed)
    * Worker        -> the existing Function App

  Application settings are read from apps/backend/.env and
  apps/functions/local.settings.json, so the values you have already filled in
  locally become the values in Azure. Nothing is provisioned, renamed or deleted.

  Safe to re-run: every step is idempotent.

.PARAMETER ResourceGroup
  Resource group holding the existing resources.

.PARAMETER ApiAppName
  Existing App Service for the API. Auto-detected when omitted.

.PARAMETER FunctionAppName
  Existing Function App for the worker. Auto-detected when omitted.

.PARAMETER SkipSettings
  Deploy code without touching application settings.

.PARAMETER SkipBuild
  Reuse the existing build output instead of rebuilding.

.PARAMETER ApiOnly / WorkerOnly
  Restrict the deployment to one component.

.PARAMETER DryRun
  Print the plan, including every setting name, and exit without changing Azure.

.EXAMPLE
  ./scripts/deploy-existing.ps1 -ResourceGroup rg-documind-ai -DryRun
  ./scripts/deploy-existing.ps1 -ResourceGroup rg-documind-ai
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [string]$ApiAppName,
  [string]$FunctionAppName,
  [switch]$SkipSettings,
  [switch]$SkipBuild,
  [switch]$ApiOnly,
  [switch]$WorkerOnly,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$stagingRoot = Join-Path $repoRoot '.deploy'

function Write-Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "    [ok] $text" -ForegroundColor Green }
function Write-Warn($text) { Write-Host "    [!]  $text" -ForegroundColor Yellow }
function Write-Info($text) { Write-Host "    $text" -ForegroundColor DarkGray }

function Invoke-Az {
  param([string[]]$Arguments, [switch]$AllowFailure)

  $output = & az @Arguments 2>&1
  if ($LASTEXITCODE -ne 0 -and -not $AllowFailure) {
    throw "az $($Arguments -join ' ') failed:`n$output"
  }
  return $output
}

# -----------------------------------------------------------------------------
# Config file parsing
# -----------------------------------------------------------------------------
function Read-DotEnv([string]$Path) {
  $values = [ordered]@{}
  if (-not (Test-Path $Path)) { return $values }

  foreach ($raw in Get-Content -LiteralPath $Path) {
    $line = $raw.Trim()
    if (-not $line -or $line.StartsWith('#')) { continue }
    $idx = $line.IndexOf('=')
    if ($idx -lt 1) { continue }

    $key = $line.Substring(0, $idx).Trim()
    $value = $line.Substring($idx + 1).Trim()
    if ($value.Length -ge 2) {
      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
          ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
    }
    $values[$key] = $value
  }
  return $values
}

function Read-LocalSettings([string]$Path) {
  $values = [ordered]@{}
  if (-not (Test-Path $Path)) { return $values }

  $json = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  if ($null -eq $json.Values) { return $values }

  foreach ($prop in $json.Values.PSObject.Properties) {
    $values[$prop.Name] = [string]$prop.Value
  }
  return $values
}

# Settings are handed to az via a JSON file rather than the command line:
# connection strings contain ; = / + characters that shell quoting mangles.
function Set-AppSettings {
  param(
    [string]$Kind,           # 'webapp' or 'functionapp'
    [string]$AppName,
    [System.Collections.IDictionary]$Settings
  )

  $payload = @()
  foreach ($key in $Settings.Keys) {
    $payload += [ordered]@{ name = $key; value = [string]$Settings[$key]; slotSetting = $false }
  }

  $tempFile = Join-Path ([System.IO.Path]::GetTempPath()) "documind-settings-$([guid]::NewGuid()).json"
  try {
    # -Depth 5 keeps ConvertTo-Json from truncating; -Compress avoids stray newlines.
    ($payload | ConvertTo-Json -Depth 5 -Compress) | Set-Content -LiteralPath $tempFile -Encoding utf8 -NoNewline

    Invoke-Az @($Kind, 'config', 'appsettings', 'set',
      '--resource-group', $ResourceGroup, '--name', $AppName,
      '--settings', "@$tempFile", '--output', 'none') | Out-Null
  }
  finally {
    # Contains live secrets - remove it even if az failed.
    if (Test-Path $tempFile) { Remove-Item -LiteralPath $tempFile -Force }
  }
}

# -----------------------------------------------------------------------------
# 0. Preflight
# -----------------------------------------------------------------------------
Write-Step 'Checking prerequisites'

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
  throw @'
Azure CLI not found. Install it, then open a NEW terminal:

    winget install --exact --id Microsoft.AzureCLI

Then sign in:

    az login
'@
}

$account = Invoke-Az @('account', 'show', '--output', 'json') -AllowFailure
if ($LASTEXITCODE -ne 0) { throw "Not signed in to Azure. Run: az login" }
$accountInfo = $account | ConvertFrom-Json
Write-Ok "Subscription: $($accountInfo.name)"

Invoke-Az @('group', 'show', '--name', $ResourceGroup, '--output', 'none') | Out-Null
Write-Ok "Resource group: $ResourceGroup"

# -----------------------------------------------------------------------------
# 1. Resolve the existing resources
# -----------------------------------------------------------------------------
Write-Step 'Resolving existing resources'

$sites = Invoke-Az @('resource', 'list', '--resource-group', $ResourceGroup,
  '--resource-type', 'Microsoft.Web/sites', '--output', 'json') | ConvertFrom-Json

if (-not $sites) { throw "No App Service or Function App found in $ResourceGroup." }

# 'kind' distinguishes them: function apps contain 'functionapp'.
$functionSites = @($sites | Where-Object { $_.kind -like '*functionapp*' })
$webSites = @($sites | Where-Object { $_.kind -notlike '*functionapp*' })

if (-not $ApiAppName) {
  if ($webSites.Count -eq 1) {
    $ApiAppName = $webSites[0].name
  }
  elseif ($webSites.Count -eq 0) {
    throw 'No App Service (non-Function) found. Pass -ApiAppName explicitly.'
  }
  else {
    throw "Multiple App Services found ($($webSites.name -join ', ')). Pass -ApiAppName explicitly."
  }
}

if (-not $FunctionAppName) {
  if ($functionSites.Count -eq 1) {
    $FunctionAppName = $functionSites[0].name
  }
  elseif ($functionSites.Count -eq 0 -and -not $ApiOnly) {
    throw 'No Function App found. Pass -FunctionAppName or use -ApiOnly.'
  }
  elseif ($functionSites.Count -gt 1) {
    throw "Multiple Function Apps found ($($functionSites.name -join ', ')). Pass -FunctionAppName explicitly."
  }
}

Write-Ok "API App Service: $ApiAppName"
if ($FunctionAppName) { Write-Ok "Function App:    $FunctionAppName" }

$apiHost = (Invoke-Az @('webapp', 'show', '--resource-group', $ResourceGroup,
    '--name', $ApiAppName, '--query', 'defaultHostName', '--output', 'tsv')).Trim()
$apiUrl = "https://$apiHost"
Write-Ok "API URL: $apiUrl"

# -----------------------------------------------------------------------------
# 2. Build the settings from local config
# -----------------------------------------------------------------------------
Write-Step 'Reading local configuration'

$backendEnv = Read-DotEnv (Join-Path $repoRoot 'apps/backend/.env')
$workerEnv = Read-LocalSettings (Join-Path $repoRoot 'apps/functions/local.settings.json')
if ($workerEnv.Count -eq 0) {
  $workerEnv = Read-DotEnv (Join-Path $repoRoot 'apps/functions/.env')
}

if ($backendEnv.Count -eq 0) { throw 'apps/backend/.env not found or empty.' }
Write-Ok "apps/backend/.env: $($backendEnv.Count) keys"
if ($workerEnv.Count -gt 0) { Write-Ok "worker settings: $($workerEnv.Count) keys" }

$requiredApi = @(
  'DATABASE_URL', 'JWT_SECRET',
  'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_SERVICE_BUS_CONNECTION_STRING',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY',
  'AZURE_OPENAI_DEPLOYMENT_ID', 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID',
  'AZURE_SEARCH_ENDPOINT', 'AZURE_SEARCH_KEY'
)
$missing = @($requiredApi | Where-Object { -not $backendEnv[$_] })
if ($missing.Count -gt 0) {
  throw "apps/backend/.env is missing: $($missing -join ', ')"
}
if ($backendEnv['JWT_SECRET'].Length -lt 32) {
  throw "JWT_SECRET must be at least 32 characters (currently $($backendEnv['JWT_SECRET'].Length)). The API refuses to start otherwise."
}

# --- API settings -------------------------------------------------------------
$apiSettings = [ordered]@{}
foreach ($key in $requiredApi) { $apiSettings[$key] = $backendEnv[$key] }

foreach ($optional in @('AZURE_SEARCH_INDEX', 'AZURE_STORAGE_CONTAINER',
    'AZURE_SERVICE_BUS_QUEUE', 'AZURE_OPENAI_API_VERSION', 'JWT_EXPIRES_IN',
    'MAX_UPLOAD_BYTES', 'DB_HEALTHCHECK_TIMEOUT_MS')) {
  if ($backendEnv[$optional]) { $apiSettings[$optional] = $backendEnv[$optional] }
}

$apiSettings['NODE_ENV'] = 'production'
# The SPA ships inside this deployment and is served from the same origin, so no
# cross-origin allow-list is required. Add origins here only if you host the UI
# somewhere else as well.
$apiSettings['CORS_ORIGINS'] = if ($backendEnv['CORS_ORIGINS']) { $backendEnv['CORS_ORIGINS'] } else { '' }
$apiSettings['SERVE_STATIC_DIR'] = 'public'
# The package already contains node_modules and compiled JS; Oryx must not rebuild.
$apiSettings['SCM_DO_BUILD_DURING_DEPLOYMENT'] = 'false'
$apiSettings['WEBSITE_NODE_DEFAULT_VERSION'] = '~20'

# --- Worker settings ----------------------------------------------------------
$workerSettings = [ordered]@{}
if ($FunctionAppName -and $workerEnv.Count -gt 0) {
  foreach ($key in @('DATABASE_URL',
      'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER',
      'AZURE_SERVICE_BUS_CONNECTION_STRING', 'AZURE_SERVICE_BUS_QUEUE',
      'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_API_VERSION',
      'AZURE_OPENAI_DEPLOYMENT_ID', 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID',
      'AZURE_SEARCH_ENDPOINT', 'AZURE_SEARCH_KEY', 'AZURE_SEARCH_INDEX',
      'AZURE_COMMUNICATION_CONNECTION_STRING', 'AZURE_COMMUNICATION_SENDER_EMAIL',
      'CHUNK_SIZE', 'CHUNK_OVERLAP', 'MAX_SUMMARY_CHARS')) {
    $value = if ($workerEnv[$key]) { $workerEnv[$key] } else { $backendEnv[$key] }
    if ($value) { $workerSettings[$key] = $value }
  }

  # AzureWebJobsStorage is read by the platform before any app code runs.
  $webJobs = if ($workerEnv['AzureWebJobsStorage'] -and $workerEnv['AzureWebJobsStorage'].StartsWith('DefaultEndpoints')) {
    $workerEnv['AzureWebJobsStorage']
  } else {
    $workerSettings['AZURE_STORAGE_CONNECTION_STRING']
  }
  $workerSettings['AzureWebJobsStorage'] = $webJobs
  $workerSettings['FUNCTIONS_EXTENSION_VERSION'] = '~4'
  $workerSettings['FUNCTIONS_WORKER_RUNTIME'] = 'node'
  $workerSettings['WEBSITE_RUN_FROM_PACKAGE'] = '1'
  $workerSettings['SCM_DO_BUILD_DURING_DEPLOYMENT'] = 'false'
}

# -----------------------------------------------------------------------------
# 3. Dry run
# -----------------------------------------------------------------------------
if ($DryRun) {
  Write-Step 'Dry run - no changes will be made'

  Write-Host "`n  API ($ApiAppName) settings:" -ForegroundColor White
  foreach ($key in $apiSettings.Keys) {
    $len = [string]$apiSettings[$key] | ForEach-Object { $_.Length }
    Write-Info ("{0,-40} ({1} chars)" -f $key, $len)
  }

  if ($workerSettings.Count -gt 0) {
    Write-Host "`n  Worker ($FunctionAppName) settings:" -ForegroundColor White
    foreach ($key in $workerSettings.Keys) {
      $len = [string]$workerSettings[$key] | ForEach-Object { $_.Length }
      Write-Info ("{0,-40} ({1} chars)" -f $key, $len)
    }
  }

  Write-Host "`n  Runtime configuration to apply:" -ForegroundColor White
  Write-Info "API      linuxFxVersion=NODE|20-lts  startup='node dist/index.js'  healthCheck=/health  alwaysOn=true  httpsOnly=true"
  if ($FunctionAppName) { Write-Info "Worker   linuxFxVersion=Node|20  alwaysOn=true  httpsOnly=true" }

  Write-Host "`n  Would deploy:" -ForegroundColor White
  Write-Info "API + SPA bundle -> $ApiAppName"
  if ($FunctionAppName -and -not $ApiOnly) { Write-Info "Worker           -> $FunctionAppName" }
  Write-Host "`nNo resources are created. Re-run without -DryRun to apply.`n" -ForegroundColor Yellow
  exit 0
}

# -----------------------------------------------------------------------------
# 4. Build
# -----------------------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Step 'Building'
  Push-Location $repoRoot
  try {
    # Leave VITE_API_URL unset: the SPA is served by the API, so relative URLs
    # resolve to the correct origin automatically and nothing is baked in.
    $env:VITE_API_URL = ''

    & npm run check:schema-drift
    if ($LASTEXITCODE -ne 0) { throw 'Prisma schema copies are out of sync.' }

    & npm run typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Type-check failed.' }

    & npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
  }
  finally { Pop-Location }
  Write-Ok 'All workspaces built'
}
else { Write-Warn 'Skipping build (-SkipBuild)' }

# -----------------------------------------------------------------------------
# 5. Package
# -----------------------------------------------------------------------------
Write-Step 'Packaging'

if (Test-Path $stagingRoot) { Remove-Item -Recurse -Force $stagingRoot }
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

function New-NodePackage {
  param(
    [string]$Name,
    [string]$SourceApp,
    [string[]]$ExtraDirs = @()
  )

  $stage = Join-Path $stagingRoot $Name
  New-Item -ItemType Directory -Path $stage -Force | Out-Null

  Copy-Item -Recurse -Force (Join-Path $SourceApp 'dist') (Join-Path $stage 'dist')
  Copy-Item -Force (Join-Path $SourceApp 'package.json') (Join-Path $stage 'package.json')
  if (Test-Path (Join-Path $SourceApp 'prisma')) {
    Copy-Item -Recurse -Force (Join-Path $SourceApp 'prisma') (Join-Path $stage 'prisma')
  }
  foreach ($dir in $ExtraDirs) {
    if (Test-Path $dir) {
      Copy-Item -Recurse -Force $dir (Join-Path $stage (Split-Path -Leaf $dir))
    }
  }

  # Install production dependencies inside the staging directory. npm hoists
  # workspace dependencies to the repo root, so apps/*/node_modules is nearly
  # empty and copying it would ship an app with no dependencies.
  Push-Location $stage
  try {
    & npm install --omit=dev --no-audit --no-fund --ignore-scripts --silent
    if ($LASTEXITCODE -ne 0) { throw "npm install failed for $Name." }

    if (Test-Path (Join-Path $stage 'prisma/schema.prisma')) {
      & npx --yes prisma generate
      if ($LASTEXITCODE -ne 0) { throw "prisma generate failed for $Name." }
    }
  }
  finally { Pop-Location }

  return $stage
}

# Compress-Archive is very slow over a node_modules tree (tens of thousands of
# small files) and skips hidden entries such as node_modules/.prisma, which holds
# the Prisma query engine. The .NET API is faster and includes everything.
function New-Zip {
  param([string]$SourceDir, [string]$DestinationPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path $DestinationPath) { Remove-Item -LiteralPath $DestinationPath -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $SourceDir,
    $DestinationPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false   # do not nest the directory itself inside the archive
  )
}

$apiZip = Join-Path $stagingRoot 'api.zip'
$workerZip = Join-Path $stagingRoot 'worker.zip'

if (-not $WorkerOnly) {
  $frontendDist = Join-Path $repoRoot 'apps/frontend/dist'
  if (-not (Test-Path (Join-Path $frontendDist 'index.html'))) {
    throw "Frontend build not found at $frontendDist. Run without -SkipBuild."
  }

  $apiStage = New-NodePackage -Name 'api' -SourceApp (Join-Path $repoRoot 'apps/backend')

  # The SPA travels with the API and is served from the same origin. SERVE_STATIC_DIR
  # points at this folder.
  $publicDir = Join-Path $apiStage 'public'
  New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
  Copy-Item -Recurse -Force (Join-Path $frontendDist '*') $publicDir

  New-Zip -SourceDir $apiStage -DestinationPath $apiZip
  Write-Ok "API package: $([math]::Round((Get-Item $apiZip).Length / 1MB, 1)) MB"
}

if ($FunctionAppName -and -not $ApiOnly) {
  $workerStage = New-NodePackage -Name 'worker' -SourceApp (Join-Path $repoRoot 'apps/functions')
  Copy-Item -Force (Join-Path $repoRoot 'apps/functions/host.json') (Join-Path $workerStage 'host.json')
  # Needed only to generate the client, which embeds its own copy of the schema.
  Remove-Item -Recurse -Force (Join-Path $workerStage 'prisma') -ErrorAction SilentlyContinue

  New-Zip -SourceDir $workerStage -DestinationPath $workerZip
  Write-Ok "Worker package: $([math]::Round((Get-Item $workerZip).Length / 1MB, 1)) MB"
}

# -----------------------------------------------------------------------------
# 6. Configure
# -----------------------------------------------------------------------------
if (-not $SkipSettings) {
  Write-Step 'Applying configuration'

  if (-not $WorkerOnly) {
    Set-AppSettings -Kind 'webapp' -AppName $ApiAppName -Settings $apiSettings
    Write-Ok "$($apiSettings.Count) application settings set on $ApiAppName"

    # The existing App Service was created on Node 18; this code needs Node 20.
    Invoke-Az @('webapp', 'config', 'set',
      '--resource-group', $ResourceGroup, '--name', $ApiAppName,
      '--linux-fx-version', 'NODE|20-lts',
      '--startup-file', 'node dist/index.js',
      '--always-on', 'true',
      '--ftps-state', 'Disabled',
      '--min-tls-version', '1.2',
      '--output', 'none') | Out-Null

    Invoke-Az @('webapp', 'update',
      '--resource-group', $ResourceGroup, '--name', $ApiAppName,
      '--https-only', 'true', '--output', 'none') | Out-Null

    # Azure removes an unhealthy instance from rotation; /health is dependency-free
    # on purpose so a database blip cannot cause an endless recycle loop.
    Invoke-Az @('webapp', 'config', 'set',
      '--resource-group', $ResourceGroup, '--name', $ApiAppName,
      '--generic-configurations', '{"healthCheckPath":"/health"}',
      '--output', 'none') -AllowFailure | Out-Null

    Write-Ok 'Runtime set to Node 20 with an explicit startup command'
  }

  if ($workerSettings.Count -gt 0 -and -not $ApiOnly) {
    Set-AppSettings -Kind 'functionapp' -AppName $FunctionAppName -Settings $workerSettings
    Write-Ok "$($workerSettings.Count) application settings set on $FunctionAppName"

    Invoke-Az @('functionapp', 'config', 'set',
      '--resource-group', $ResourceGroup, '--name', $FunctionAppName,
      '--linux-fx-version', 'Node|20',
      '--always-on', 'true',
      '--ftps-state', 'Disabled',
      '--min-tls-version', '1.2',
      '--output', 'none') -AllowFailure | Out-Null

    Write-Ok 'Worker runtime set to Node 20'
  }
}
else { Write-Warn 'Skipping settings (-SkipSettings)' }

# -----------------------------------------------------------------------------
# 7. Deploy
# -----------------------------------------------------------------------------
if (-not $WorkerOnly) {
  Write-Step "Deploying API + web UI to $ApiAppName"
  Invoke-Az @('webapp', 'deploy',
    '--resource-group', $ResourceGroup, '--name', $ApiAppName,
    '--src-path', $apiZip, '--type', 'zip',
    '--async', 'false', '--output', 'none') | Out-Null
  Write-Ok 'API deployed'
}

if ($FunctionAppName -and -not $ApiOnly) {
  Write-Step "Deploying worker to $FunctionAppName"
  Invoke-Az @('functionapp', 'deployment', 'source', 'config-zip',
    '--resource-group', $ResourceGroup, '--name', $FunctionAppName,
    '--src', $workerZip, '--build-remote', 'false', '--output', 'none') | Out-Null
  Write-Ok 'Worker deployed'
}

# -----------------------------------------------------------------------------
# 8. Verify
# -----------------------------------------------------------------------------
if (-not $WorkerOnly) {
  Write-Step 'Verifying the API'
  Write-Info 'A cold start plus an idle Azure SQL database can take a minute.'

  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt++) {
    try {
      $response = Invoke-WebRequest -Uri "$apiUrl/health/ready" -UseBasicParsing -TimeoutSec 20
      if ($response.StatusCode -eq 200) {
        Write-Ok "Readiness: $($response.Content)"
        $ready = $true
        break
      }
    }
    catch {
      $body = $_.ErrorDetails.Message
      Write-Info "attempt $attempt/30 ... $($_.Exception.Response.StatusCode.value__) $body"
    }
    Start-Sleep -Seconds 10
  }

  if (-not $ready) {
    Write-Warn 'API did not report ready. Stream logs with:'
    Write-Info "az webapp log tail --name $ApiAppName --resource-group $ResourceGroup"
  }

  # Proves the SPA shipped and that deep links fall back to index.html.
  try {
    $spa = Invoke-WebRequest -Uri "$apiUrl/dashboard" -UseBasicParsing -TimeoutSec 20
    if ($spa.StatusCode -eq 200 -and $spa.Content -match '<div id="root"') {
      Write-Ok 'Web UI served, SPA deep-link fallback working'
    }
    else { Write-Warn "Unexpected response from /dashboard (HTTP $($spa.StatusCode))" }
  }
  catch { Write-Warn "Could not fetch /dashboard: $($_.Exception.Message)" }
}

if ($FunctionAppName -and -not $ApiOnly) {
  Write-Step 'Verifying the worker'
  $count = 0
  for ($attempt = 1; $attempt -le 12; $attempt++) {
    $result = Invoke-Az @('functionapp', 'function', 'list',
      '--resource-group', $ResourceGroup, '--name', $FunctionAppName,
      '--query', 'length(@)', '--output', 'tsv') -AllowFailure
    if ($LASTEXITCODE -eq 0 -and [int]::TryParse(("$result").Trim(), [ref]$count) -and $count -ge 1) {
      Write-Ok "Function App reports $count function(s)"
      break
    }
    Write-Info "attempt $attempt/12 ... no functions reported yet"
    Start-Sleep -Seconds 15
  }
  if ($count -lt 1) {
    Write-Warn 'Worker reports no functions - usually a module load error. Check Application Insights traces.'
  }
}

Remove-Item -Recurse -Force $stagingRoot -ErrorAction SilentlyContinue

Write-Host "`nDone." -ForegroundColor Green
Write-Host "  Web UI + API : $apiUrl" -ForegroundColor White
Write-Host "  Health       : $apiUrl/health/ready" -ForegroundColor White
Write-Host ''
