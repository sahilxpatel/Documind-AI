<#
.SYNOPSIS
  Builds deployable zips and Azure Portal app-settings files. Needs no Azure CLI.

.DESCRIPTION
  Produces everything required for a fully manual deployment through the Azure
  Portal, for when the Azure CLI is not available:

    .deploy-out/api.zip                  API + web UI  -> App Service
    .deploy-out/worker.zip               document worker -> Function App
    .deploy-out/appsettings-api.json     paste into App Service > Configuration
    .deploy-out/appsettings-worker.json  paste into Function App > Configuration
    .deploy-out/INSTRUCTIONS.txt         the click-by-click steps

  Why the zip must be built rather than just zipping the repo: the archive needs
  compiled JavaScript (`dist/`) and production `node_modules` including the
  generated Prisma client. npm workspaces hoist dependencies to the repo root, so
  `apps/backend/node_modules` is nearly empty and a naive folder zip would deploy
  an application with no dependencies.

  The generated settings files contain live secrets. They are written under
  .deploy-out/, which is gitignored. Delete them once pasted.

.PARAMETER SkipBuild
  Reuse existing build output instead of rebuilding.

.EXAMPLE
  ./scripts/package-for-portal.ps1
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
$outRoot = Join-Path $repoRoot '.deploy-out'
$stagingRoot = Join-Path $outRoot 'staging'

function Write-Step($t) { Write-Host "`n==> $t" -ForegroundColor Cyan }
function Write-Ok($t) { Write-Host "    [ok] $t" -ForegroundColor Green }
function Write-Info($t) { Write-Host "    $t" -ForegroundColor DarkGray }

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
  foreach ($p in $json.Values.PSObject.Properties) { $values[$p.Name] = [string]$p.Value }
  return $values
}

function Write-SettingsFile {
  param([System.Collections.IDictionary]$Settings, [string]$Path)

  # This is exactly the shape the Portal's "Advanced edit" box expects.
  $payload = @()
  foreach ($k in $Settings.Keys) {
    $payload += [ordered]@{ name = $k; value = [string]$Settings[$k]; slotSetting = $false }
  }
  ($payload | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $Path -Encoding utf8
}

function New-Zip {
  param([string]$SourceDir, [string]$DestinationPath)

  # The .NET API is used rather than Compress-Archive: Compress-Archive is very
  # slow across a node_modules tree and skips hidden entries such as
  # node_modules/.prisma, which holds the Prisma query engine.
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  if (Test-Path $DestinationPath) { Remove-Item -LiteralPath $DestinationPath -Force }
  [System.IO.Compression.ZipFile]::CreateFromDirectory(
    $SourceDir, $DestinationPath,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false   # contents at the archive root, not nested in a folder
  )
}

# Strips build-time-only artifacts from a staged node_modules tree.
#
# `prisma generate` needs the Prisma CLI and its engine downloads, but none of it
# is used at runtime: @prisma/client loads the query engine from
# node_modules/.prisma/client. Left in place these add roughly 200 MB to the
# archive, most of it Windows binaries that cannot even run on App Service.
function Remove-BuildOnlyArtifacts {
  param([string]$Stage)

  $nm = Join-Path $Stage 'node_modules'
  if (-not (Test-Path $nm)) { return 0 }

  $before = (Get-ChildItem $nm -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum

  # Engine download cache, and the CLI plus its engine package.
  foreach ($path in @('.cache', 'prisma', '@prisma/engines', 'typescript')) {
    $target = Join-Path $nm $path
    if (Test-Path $target) { Remove-Item -Recurse -Force $target -ErrorAction SilentlyContinue }
  }

  # The generated client ships an engine per declared binaryTarget. App Service
  # runs Linux, so the Windows engine is dead weight. Both Debian variants are
  # kept because the base image's OpenSSL version can differ between stamps and
  # Prisma picks the matching one at runtime.
  Get-ChildItem (Join-Path $nm '.prisma') -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like '*windows*' } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  # TypeScript declarations, source maps and package docs are never read at
  # runtime. In an SDK-heavy tree they are most of the weight: @azure,
  # @opentelemetry and effect ship very large .d.ts files.
  Get-ChildItem $nm -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object {
      $_.Name -like '*.d.ts' -or $_.Name -like '*.d.mts' -or $_.Name -like '*.d.cts' -or
      $_.Name -like '*.map' -or
      $_.Name -like '*.md' -or $_.Name -like '*.markdown' -or
      $_.Name -eq 'CHANGELOG' -or $_.Name -like '*.ts.map'
    } |
    Remove-Item -Force -ErrorAction SilentlyContinue

  $after = (Get-ChildItem $nm -Recurse -File -ErrorAction SilentlyContinue |
    Measure-Object Length -Sum).Sum

  return [math]::Round(($before - $after) / 1MB, 1)
}

function New-NodePackage {
  param([string]$Name, [string]$SourceApp)

  $stage = Join-Path $stagingRoot $Name
  New-Item -ItemType Directory -Path $stage -Force | Out-Null

  Copy-Item -Recurse -Force (Join-Path $SourceApp 'dist') (Join-Path $stage 'dist')
  Copy-Item -Force (Join-Path $SourceApp 'package.json') (Join-Path $stage 'package.json')
  if (Test-Path (Join-Path $SourceApp 'prisma')) {
    Copy-Item -Recurse -Force (Join-Path $SourceApp 'prisma') (Join-Path $stage 'prisma')
  }

  Push-Location $stage
  try {
    # Output is captured into variables rather than left on the pipeline: anything
    # a function writes to stdout becomes part of its return value, which would
    # turn the returned path into an array of npm log lines.
    $npmOut = & npm install --omit=dev --no-audit --no-fund --ignore-scripts 2>&1
    if ($LASTEXITCODE -ne 0) { throw "npm install failed for ${Name}:`n$npmOut" }

    if (Test-Path (Join-Path $stage 'prisma/schema.prisma')) {
      $prismaOut = & npx --yes prisma generate 2>&1
      if ($LASTEXITCODE -ne 0) { throw "prisma generate failed for ${Name}:`n$prismaOut" }
    }
  }
  finally { Pop-Location }

  $saved = Remove-BuildOnlyArtifacts -Stage $stage
  Write-Info "pruned $saved MB of build-only artifacts from $Name"

  return $stage
}

# -----------------------------------------------------------------------------
Write-Step 'Reading local configuration'

$backendEnv = Read-DotEnv (Join-Path $repoRoot 'apps/backend/.env')
$workerEnv = Read-LocalSettings (Join-Path $repoRoot 'apps/functions/local.settings.json')
if ($workerEnv.Count -eq 0) { $workerEnv = Read-DotEnv (Join-Path $repoRoot 'apps/functions/.env') }

if ($backendEnv.Count -eq 0) { throw 'apps/backend/.env not found or empty.' }

$requiredApi = @(
  'DATABASE_URL', 'JWT_SECRET',
  'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_SERVICE_BUS_CONNECTION_STRING',
  'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY',
  'AZURE_OPENAI_DEPLOYMENT_ID', 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID',
  'AZURE_SEARCH_ENDPOINT', 'AZURE_SEARCH_KEY'
)
$missing = @($requiredApi | Where-Object { -not $backendEnv[$_] })
if ($missing.Count -gt 0) { throw "apps/backend/.env is missing: $($missing -join ', ')" }
if ($backendEnv['JWT_SECRET'].Length -lt 32) {
  throw "JWT_SECRET must be at least 32 characters (currently $($backendEnv['JWT_SECRET'].Length))."
}
Write-Ok "Configuration looks complete"

# --- API settings -------------------------------------------------------------
$apiSettings = [ordered]@{}
foreach ($k in $requiredApi) { $apiSettings[$k] = $backendEnv[$k] }
foreach ($opt in @('AZURE_SEARCH_INDEX', 'AZURE_STORAGE_CONTAINER', 'AZURE_SERVICE_BUS_QUEUE',
    'AZURE_OPENAI_API_VERSION', 'JWT_EXPIRES_IN', 'MAX_UPLOAD_BYTES', 'DB_HEALTHCHECK_TIMEOUT_MS')) {
  if ($backendEnv[$opt]) { $apiSettings[$opt] = $backendEnv[$opt] }
}
$apiSettings['NODE_ENV'] = 'production'
# The SPA ships inside this package and is served from the same origin, so no
# cross-origin allow-list is needed.
$apiSettings['CORS_ORIGINS'] = if ($backendEnv['CORS_ORIGINS']) { $backendEnv['CORS_ORIGINS'] } else { '' }
$apiSettings['SERVE_STATIC_DIR'] = 'public'
# The package already contains node_modules and compiled JS; Oryx must not rebuild.
$apiSettings['SCM_DO_BUILD_DURING_DEPLOYMENT'] = 'false'

# --- Worker settings ----------------------------------------------------------
$workerSettings = [ordered]@{}
if ($workerEnv.Count -gt 0) {
  foreach ($k in @('DATABASE_URL',
      'AZURE_STORAGE_CONNECTION_STRING', 'AZURE_STORAGE_CONTAINER',
      'AZURE_SERVICE_BUS_CONNECTION_STRING', 'AZURE_SERVICE_BUS_QUEUE',
      'AZURE_OPENAI_ENDPOINT', 'AZURE_OPENAI_KEY', 'AZURE_OPENAI_API_VERSION',
      'AZURE_OPENAI_DEPLOYMENT_ID', 'AZURE_OPENAI_EMBEDDING_DEPLOYMENT_ID',
      'AZURE_SEARCH_ENDPOINT', 'AZURE_SEARCH_KEY', 'AZURE_SEARCH_INDEX',
      'AZURE_COMMUNICATION_CONNECTION_STRING', 'AZURE_COMMUNICATION_SENDER_EMAIL',
      'CHUNK_SIZE', 'CHUNK_OVERLAP', 'MAX_SUMMARY_CHARS')) {
    $v = if ($workerEnv[$k]) { $workerEnv[$k] } else { $backendEnv[$k] }
    if ($v) { $workerSettings[$k] = $v }
  }

  # Read by the Functions platform before app code runs, so it must be a literal.
  $webJobs = if ($workerEnv['AzureWebJobsStorage'] -and
      $workerEnv['AzureWebJobsStorage'].StartsWith('DefaultEndpoints')) {
    $workerEnv['AzureWebJobsStorage']
  } else { $workerSettings['AZURE_STORAGE_CONNECTION_STRING'] }

  $workerSettings['AzureWebJobsStorage'] = $webJobs
  $workerSettings['FUNCTIONS_EXTENSION_VERSION'] = '~4'
  $workerSettings['FUNCTIONS_WORKER_RUNTIME'] = 'node'
  $workerSettings['WEBSITE_RUN_FROM_PACKAGE'] = '1'
  $workerSettings['SCM_DO_BUILD_DURING_DEPLOYMENT'] = 'false'
}

# -----------------------------------------------------------------------------
if (-not $SkipBuild) {
  Write-Step 'Building'
  Push-Location $repoRoot
  try {
    # Left empty on purpose: the API serves the SPA, so relative URLs resolve to
    # the right origin and no hostname is baked into the bundle.
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

# -----------------------------------------------------------------------------
Write-Step 'Packaging'

if (Test-Path $outRoot) { Remove-Item -Recurse -Force $outRoot }
New-Item -ItemType Directory -Path $stagingRoot -Force | Out-Null

$frontendDist = Join-Path $repoRoot 'apps/frontend/dist'
if (-not (Test-Path (Join-Path $frontendDist 'index.html'))) {
  throw "Frontend build not found at $frontendDist. Run without -SkipBuild."
}

$apiStage = New-NodePackage -Name 'api' -SourceApp (Join-Path $repoRoot 'apps/backend')
$publicDir = Join-Path $apiStage 'public'
New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
Copy-Item -Recurse -Force (Join-Path $frontendDist '*') $publicDir

$apiZip = Join-Path $outRoot 'api.zip'
New-Zip -SourceDir $apiStage -DestinationPath $apiZip
Write-Ok ("api.zip    {0:N1} MB" -f ((Get-Item $apiZip).Length / 1MB))

$workerZip = $null
if ($workerSettings.Count -gt 0) {
  $workerStage = New-NodePackage -Name 'worker' -SourceApp (Join-Path $repoRoot 'apps/functions')
  Copy-Item -Force (Join-Path $repoRoot 'apps/functions/host.json') (Join-Path $workerStage 'host.json')
  # Only needed to generate the client, which embeds its own copy of the schema.
  Remove-Item -Recurse -Force (Join-Path $workerStage 'prisma') -ErrorAction SilentlyContinue

  $workerZip = Join-Path $outRoot 'worker.zip'
  New-Zip -SourceDir $workerStage -DestinationPath $workerZip
  Write-Ok ("worker.zip {0:N1} MB" -f ((Get-Item $workerZip).Length / 1MB))
}

Write-SettingsFile -Settings $apiSettings -Path (Join-Path $outRoot 'appsettings-api.json')
Write-Ok "appsettings-api.json ($($apiSettings.Count) settings)"

if ($workerSettings.Count -gt 0) {
  Write-SettingsFile -Settings $workerSettings -Path (Join-Path $outRoot 'appsettings-worker.json')
  Write-Ok "appsettings-worker.json ($($workerSettings.Count) settings)"
}

Remove-Item -Recurse -Force $stagingRoot -ErrorAction SilentlyContinue

# -----------------------------------------------------------------------------
$instructions = @"
DocuMind AI - manual deployment through the Azure Portal
========================================================

Order matters. Settings first: the API validates its configuration at startup and
exits if anything required is missing, so a zip deployed before the settings are
in place will just crash-loop.

----------------------------------------------------------------------
STEP 1 - App Service (API + web UI) settings
----------------------------------------------------------------------
Portal > your App Service > Settings > Environment variables
  (older portals: Configuration > Application settings)

  1. Click "Advanced edit"
  2. Replace the entire contents with appsettings-api.json
  3. Click OK, then Apply, and confirm the restart

----------------------------------------------------------------------
STEP 2 - App Service runtime
----------------------------------------------------------------------
Portal > your App Service > Settings > Configuration > General settings

  Stack             Node
  Major version     Node 20 LTS      <-- currently 18; the code requires 20
  Startup Command   node dist/index.js
  Always on         On

  Save, and confirm the restart.

Also set the health check:
Portal > Monitoring > Health check > Enable, Path = /health

----------------------------------------------------------------------
STEP 3 - Deploy api.zip
----------------------------------------------------------------------
Easiest route is the Kudu ZipDeploy UI:

  https://<your-app-name>.scm.azurewebsites.net/ZipDeployUI

  Drag api.zip onto the page and wait for it to finish.

  Note: the archive already has dist/, node_modules/, public/ and package.json at
  its root. Do not re-zip it into a subfolder.

----------------------------------------------------------------------
STEP 4 - Function App (worker) settings
----------------------------------------------------------------------
Portal > your Function App > Settings > Environment variables
  Advanced edit  ->  paste appsettings-worker.json  ->  OK  ->  Apply

Then Configuration > General settings:
  Node version   20
  Always on      On

----------------------------------------------------------------------
STEP 5 - Deploy worker.zip
----------------------------------------------------------------------
  https://<your-function-app-name>.scm.azurewebsites.net/ZipDeployUI

  Drag worker.zip onto the page.

----------------------------------------------------------------------
STEP 6 - Verify
----------------------------------------------------------------------
In a browser:

  https://<your-app-name>.azurewebsites.net/health
      -> {"status":"ok",...}

  https://<your-app-name>.azurewebsites.net/health/ready
      -> {"status":"ready","checks":{"database":{"status":"up"},...}}
      A cold start plus an idle Azure SQL database can take up to a minute.

  https://<your-app-name>.azurewebsites.net/
      -> the web UI

  https://<your-app-name>.azurewebsites.net/dashboard
      -> also the web UI, not a 404 (this proves the SPA fallback works)

For the worker, check that Portal > Function App > Overview > Functions lists
"processDocument". An empty list means the worker failed to load a module; check
Log stream or Application Insights.

----------------------------------------------------------------------
If the API will not start
----------------------------------------------------------------------
Portal > App Service > Monitoring > Log stream

The startup validator prints exactly which variables are wrong, for example:

  Invalid environment configuration:
    - JWT_SECRET must be at least 32 characters

----------------------------------------------------------------------
Clean up
----------------------------------------------------------------------
appsettings-api.json and appsettings-worker.json contain live secrets.
Delete the .deploy-out folder once you have pasted them.
"@

$instructions | Set-Content -LiteralPath (Join-Path $outRoot 'INSTRUCTIONS.txt') -Encoding utf8

Write-Step 'Done'
Write-Host "  Output: $outRoot" -ForegroundColor White
Get-ChildItem $outRoot | ForEach-Object {
  Write-Host ("    {0,-28} {1,8:N1} KB" -f $_.Name, ($_.Length / 1KB)) -ForegroundColor DarkGray
}
Write-Host ''
Write-Host '  Read INSTRUCTIONS.txt, then start with the app settings (not the zip).' -ForegroundColor Yellow
Write-Host '  The settings files contain live secrets - delete .deploy-out when finished.' -ForegroundColor Yellow
Write-Host ''
