<# 
.SYNOPSIS
    Deploys the R2 Quota System (quota checker + upload gate)

.DESCRIPTION
    1. Creates KV namespace for quota flags
    2. Updates wrangler.toml with KV namespace IDs
    3. Deploys both workers
    4. Sets required secrets

.PARAMETER AccountId
    Cloudflare Account ID

.PARAMETER ApiToken
    Cloudflare API Token with Workers/R2/KV permissions

.EXAMPLE
    .\deploy-quota-system.ps1 -AccountId "abc123" -ApiToken "xxx"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$AccountId,
    
    [Parameter(Mandatory=$true)]
    [string]$ApiToken,
    
    [string]$KvNamespaceName = "R2_QUOTA_KV",
    [string]$BucketName = "anjuman-assets"
)

Write-Host "=== R2 Quota System Deployment ===" -ForegroundColor Cyan

# 1. Login check
Write-Host "`n[1/6] Checking wrangler auth..." -ForegroundColor Yellow
try {
    $result = wrangler whoami 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Not logged in. Running wrangler login..." -ForegroundColor Yellow
        wrangler login
    } else {
        Write-Host "Already logged in: $result" -ForegroundColor Green
    }
} catch {
    Write-Host "Wrangler not found. Installing..." -ForegroundColor Yellow
    npm install -g wrangler
    wrangler login
}

# 2. Create KV namespace
Write-Host "`n[2/6] Creating KV namespace: $KvNamespaceName..." -ForegroundColor Yellow
$kvResult = wrangler kv:namespace create $KvNamespaceName 2>&1
Write-Host $kvResult

# Extract IDs from output
$idRegex = 'id = "([^"]+)"'
$previewIdRegex = 'preview_id = "([^"]+)"'

$prodId = ($kvResult | Select-String -Pattern $idRegex).Matches.Groups[1].Value
$previewId = ($kvResult | Select-String -Pattern $previewIdRegex).Matches.Groups[1].Value

if (-not $prodId) {
    Write-Host "Failed to extract KV namespace ID" -ForegroundColor Red
    exit 1
}

Write-Host "Production KV ID: $prodId" -ForegroundColor Green
Write-Host "Preview KV ID: $previewId" -ForegroundColor Green

# 3. Update wrangler.toml files
Write-Host "`n[3/6] Updating wrangler.toml files..." -ForegroundColor Yellow

$checkerToml = "workers\r2-quota-checker\wrangler.toml"
$gateToml = "workers\r2-upload-gate\wrangler.toml"

$content = Get-Content $checkerToml -Raw
$content = $content -replace '<YOUR_KV_NAMESPACE_ID>', $prodId
$content = $content -replace '<YOUR_PREVIEW_KV_ID>', $previewId
Set-Content $checkerToml $content -Encoding UTF8

$content = Get-Content $gateToml -Raw
$content = $content -replace '<YOUR_KV_NAMESPACE_ID>', $prodId
$content = $content -replace '<YOUR_PREVIEW_KV_ID>', $previewId
Set-Content $gateToml $content -Encoding UTF8

Write-Host "Updated wrangler.toml files" -ForegroundColor Green

# 4. Set secrets
Write-Host "`n[4/6] Setting secrets..." -ForegroundColor Yellow

Write-Host "Setting CF_API_TOKEN..." -ForegroundColor Yellow
$secureToken = ConvertTo-SecureString -String $ApiToken -AsPlainText -Force
wrangler secret put CF_API_TOKEN --env production --binding CF_API_TOKEN --text $ApiToken

Write-Host "Setting CF_ACCOUNT_ID..." -ForegroundColor Yellow
wrangler secret put CF_ACCOUNT_ID --env production --binding CF_ACCOUNT_ID --text $AccountId

# Optional webhook
$webhook = Read-Host "Alert webhook URL (Slack/Discord) [optional, press Enter to skip]"
if ($webhook) {
    wrangler secret put ALERT_WEBHOOK_URL --env production --binding ALERT_WEBHOOK_URL --text $webhook
}

# 5. Install deps and deploy quota checker
Write-Host "`n[5/6] Deploying quota checker worker..." -ForegroundColor Yellow
Set-Location "workers\r2-quota-checker"
npm install
wrangler deploy
Set-Location "..\.."

# 6. Deploy upload gate
Write-Host "`n[6/6] Deploying upload gate worker..." -ForegroundColor Yellow
Set-Location "workers\r2-upload-gate"
npm install
wrangler deploy
Set-Location "..\.."

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Cyan
Write-Host "Workers deployed:" -ForegroundColor Green
Write-Host "  - r2-quota-checker (daily 2 AM cron)"
Write-Host "  - r2-upload-gate (upload gate)"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Verify KV namespace ID in wrangler.toml files"
Write-Host "2. Test quota check: wrangler tail r2-quota-checker"
Write-Host "3. Test upload gate: curl -X PUT ..."
Write-Host "4. Set ALERT_WEBHOOK_URL secret for Slack/Discord alerts"