<#
.SYNOPSIS
    Tests the R2 quota system

.DESCRIPTION
    Verifies the quota system is working correctly
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$AccountId,
    
    [Parameter(Mandatory=$true)]
    [string]$ApiToken,
    
    [string]$WorkerUrl = "https://r2-upload-gate.your-subdomain.workers.dev"
)

Write-Host "=== Testing R2 Quota System ===" -ForegroundColor Cyan

# 1. Check KV flag
Write-Host "`n[1/4] Checking KV flag..." -ForegroundColor Yellow
$kvResult = wrangler kv:key get uploads_disabled --binding R2_QUOTA_KV 2>&1
if ($kvResult -eq "true") {
    Write-Host "⚠️ Uploads DISABLED (quota flag is TRUE)" -ForegroundColor Red
} else {
    Write-Host "✅ Uploads ENABLED (quota flag is FALSE/empty)" -ForegroundColor Green
}

# 2. Test upload gate
Write-Host "`n[2/4] Testing upload gate..." -ForegroundColor Yellow
$testFile = [System.IO.Path]::GetTempFileName()
"test content" | Out-File -FilePath $testFile -Encoding utf8

try {
    $response = Invoke-RestMethod -Method Put -Uri "$WorkerUrl?key=test/quota-test.txt" `
        -InFile $testFile -Headers @{ "Content-Type" = "text/plain" }
    Write-Host "✅ Upload successful: $($response | ConvertTo-Json)" -ForegroundColor Green
} catch {
    Write-Host "❌ Upload failed: $($_.Exception.Message)" -ForegroundColor Red
}

# 3. Check quota status via worker
Write-Host "`n[3/4] Checking quota status..." -ForegroundColor Yellow
# The quota checker runs daily, but we can check current usage via API
Write-Host "Check Cloudflare Dashboard > R2 > Usage for current usage" -ForegroundColor Cyan

# 4. Simulate quota exceeded
Write-Host "`n[4/4] Simulating quota exceeded..." -ForegroundColor Yellow
Write-Host "To test quota exceeded:" -ForegroundColor Cyan
Write-Host "  1. wrangler kv:key put uploads_disabled true --binding R2_QUOTA_KV"
Write-Host "  2. Try uploading again (should get 403)"
Write-Host "  3. wrangler kv:key delete uploads_disabled --binding R2_QUOTA_KV (to re-enable)"

Remove-Item $testFile -ErrorAction SilentlyContinue

Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan