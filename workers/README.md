# R2 Uploads + 10 GB Quota Hard Stop

Two Cloudflare Workers handle public image storage and enforce a hard 10 GB
limit. No R2 secret keys ever reach the browser.

| Worker | URL | Job |
|---|---|---|
| `r2-upload-gate` | https://r2-upload-gate.starservices0026.workers.dev | Validates the Supabase session, uploads images to R2, serves them back |
| `r2-quota-checker` | https://r2-quota-checker.starservices0026.workers.dev | Daily 02:00 UTC: sums bucket size, sets/clears the `uploads_disabled` flag |

KV namespace: `R2_QUOTA_KV` (`ad0dc6f8f4bc44f486c53d61a0aec45d`)
R2 bucket: `anjuman-assets` (private; files are served through the Worker)

## How the pieces fit

```
Browser ──POST /upload (Supabase JWT + FormData)──▶ r2-upload-gate ──▶ R2
Browser ──GET /files/<key>───────────────────────▶ r2-upload-gate ──▶ R2
Daily 02:00 ──list bucket + sum sizes───────────▶ r2-quota-checker
                         │
                         ├─ ≥ 9.5 GB → webhook warning
                         └─ ≥ 10 GB  → KV uploads_disabled=true
                                        (all uploads return 403)
```

- `avatars/...` → member profile photos (any signed-in user)
- `tenants/<tenant-id>/...` → logo, masjid photo, UPI QR (office bearers only)
- `ads/<ad-id>/...` → platform announcement banners (**super admin only**)
- KYC / registration documents stay in the **private Supabase** bucket; they
  are never public.

## App configuration

`NEXT_PUBLIC_R2_UPLOAD_URL` (build-time) must point at the upload gate. The code
falls back to the production URL above, and `.github/workflows/deploy.yml`
passes it to the build.

## Manual controls

```powershell
cd workers\r2-quota-checker

# Check flag
wrangler kv key get uploads_disabled --binding R2_QUOTA_KV --remote

# Emergency stop
wrangler kv key put uploads_disabled true --binding R2_QUOTA_KV --remote

# Re-enable (after freeing space / new billing cycle)
wrangler kv key delete uploads_disabled --binding R2_QUOTA_KV --remote
```

## Alerts

Set an optional Slack/Discord webhook:

```powershell
wrangler secret put ALERT_WEBHOOK_URL --name r2-quota-checker
```

## Deploy

```powershell
cd workers\r2-quota-checker
npm install
wrangler deploy

cd ..\r2-upload-gate
npm install
wrangler deploy
```

## Test

```powershell
# Worker is up
curl https://r2-upload-gate.starservices0026.workers.dev/

# Unauthenticated upload is rejected
curl -X POST https://r2-upload-gate.starservices0026.workers.dev/upload

# Quota kill switch
wrangler kv key put uploads_disabled true --binding R2_QUOTA_KV --remote
curl -X POST https://r2-upload-gate.starservices0026.workers.dev/upload
# → 403 QUOTA_EXCEEDED
wrangler kv key delete uploads_disabled --binding R2_QUOTA_KV --remote
```

## Cost

Workers free tier (100k requests/day), KV free tier, R2 storage only.
No paid plan required.
