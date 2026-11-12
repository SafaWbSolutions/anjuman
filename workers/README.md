# R2 Quota System

Hard stop at 10GB for Cloudflare R2 using Workers + KV + Cron.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  R2 Upload Gate │────▶│  R2_QUOTA_KV     │◀───│  Quota Checker  │
│  (Worker)       │     │  (uploads_disabled)│   │  (Cron 2 AM)    │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
   Checks flag            Flag: true/false         Reads R2 usage
   before upload          via KV                   via CF API
```

## Workers

### 1. r2-quota-checker (Cron: Daily 2 AM)
- Reads R2 usage via Cloudflare API
- If ≥ 9.5GB → sends warning alert
- If ≥ 10GB → sets `uploads_disabled=true` in KV + critical alert

### 2. r2-upload-gate (HTTP)
- Intercepts all upload requests
- Checks `uploads_disabled` flag in KV
- If disabled → returns 403
- If enabled → forwards to R2 bucket

## Quick Deploy

```powershell
# 1. Install wrangler
npm install -g wrangler
wrangler login

# 2. Deploy
.\workers\deploy-quota-system.ps1 -AccountId "your-account-id" -ApiToken "your-api-token"
```

## Manual Controls

```bash
# Disable uploads (emergency)
wrangler kv:key put uploads_disabled true --binding R2_QUOTA_KV

# Re-enable uploads (after quota reset)
wrangler kv:key delete uploads_disabled --binding R2_QUOTA_KV

# Check current flag
wrangler kv:key get uploads_disabled --binding R2_QUOTA_KV

# Tail logs
wrangler tail r2-quota-checker
wrangler tail r2-upload-gate
```

## Alerts

Configure `ALERT_WEBHOOK_URL` secret for Slack/Discord:
- ⚠️ Warning at 9.5GB (95%)
- 🚨 Critical at 10GB (uploads disabled)
- ❌ Errors

## Re-enabling After Limit Hit

1. Wait for next billing cycle (or upgrade plan)
2. Create new R2 API token in Cloudflare Dashboard
3. Update `CF_API_TOKEN` secret: `wrangler secret put CF_API_TOKEN`
3. Clear KV flag: `wrangler kv:key delete uploads_disabled --binding R2_QUOTA_KV`

## Testing

```powershell
# Deploy
.\workers\deploy-quota-system.ps1 -AccountId "xxx" -ApiToken "xxx"

# Test
.\workers\test-quota-system.ps1 -AccountId "xxx" -ApiToken "xxx" -WorkerUrl "https://r2-upload-gate.xxx.workers.dev"

# Simulate quota hit
wrangler kv:key put uploads_disabled true --binding R2_QUOTA_KV
# Try upload (should get 403)
wrangler kv:key delete uploads_disabled --binding R2_QUOTA_KV
```

## Secrets Required

| Secret | Description |
|--------|-------------|
| `CF_API_TOKEN` | Cloudflare API token with R2/KV/Workers permissions |
| `CF_ACCOUNT_ID` | Cloudflare Account ID |
| `ALERT_WEBHOOK_URL` | Optional: Slack/Discord webhook for alerts |

## Cost

- Workers: Free (100k req/day)
- KV: Free (1GB)
- Cron: Free
- **Total: $0/month**