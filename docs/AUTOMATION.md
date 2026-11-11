# Automation — chanda, reminders, receipts aur gateway reconciliation

Ye guide batati hai ki **kya automatic chalta hai**, use **kaise on karna hai**,
aur kuch galat ho to **kahan dekhna hai**.

Sab kuch Supabase ke andar chalta hai. Koi alag server, koi VPS, koi monthly
bill nahi — Free plan par bhi kaam karega.

---

## 1. Kya kab chalta hai

| Kaam | Kab | Kaun chalata hai |
| --- | --- | --- |
| Mahine ke invoices banana | 1 tareekh, raat 2 baje | `nightly` |
| Dues reminder bhejna | 3, 7, 10, 15 tareekh (tenant setting) | `nightly` |
| Overdue notice | Due date ke baad wale reminder din | `nightly` |
| Receipt ka WhatsApp/SMS | Payment verify hote hi | Database trigger |
| Notice broadcast | Notice publish hote hi (ya schedule time par) | Trigger + `nightly` |
| Queued messages bhejna | Har 5 minute | `send-queue` |
| Gateway payment match karna | Gateway webhook aate hi | `payment-webhook` |
| Subscription expire karna | Raat 2 baje | `nightly` |
| Ledger chain check | Raat 2 baje | `nightly` |
| Failed message retry | 10 → 20 → 40 min backoff | `send-queue` |

Nightly 02:00 **IST** par chalta hai (UTC me 20:30).

### 1.1 Database ke andar already scheduled (Edge Function ke bina)

`0018_daily_schedule.sql` teen `pg_cron` jobs lagata hai. Ye bina kisi Edge
Function ke chalte hain, isliye Free plan par bhi kaam karte hain:

| Job | Schedule | Kaam |
| --- | --- | --- |
| `anjuman-daily-maintenance` | `30 20 * * *` (02:00 IST) | invoices, reminders, due notices, expiry, queue retry, ledger check |
| `anjuman-keepalive` | `0 */6 * * *` (har 6 ghante) | `job_runs` me ek row likhta hai — project kabhi idle nahi dikhta |
| `anjuman-requeue` | `*/15 * * * *` (har 15 min) | failed messages wapas queue me |

Check karne ke liye:

```sql
select jobname, schedule, active from cron.job;
select job, status, started_at, error from public.job_runs order by started_at desc limit 10;
```

Manually ek baar chalana ho:

```sql
select public.keepalive();
select public.run_daily_maintenance();
```

> **Kyun zaroori hai:** Supabase Free plan ~7 din bina kisi activity ke project
> pause kar deta hai. `anjuman-keepalive` har 6 ghante database ko touch karta
> hai, isliye pause nahi hoga. GitHub par `.github/workflows/keepalive.yml` bhi
> roz ek REST ping bhejta hai — do layer ka safety net.

### 1.2 GitHub Actions (fallback + backup)

Repo me teen workflows hain:

| File | Kab | Kaam | Secret chahiye? |
| --- | --- | --- | --- |
| `.github/workflows/keepalive.yml` | roz 07:45 IST | Supabase REST ko ping | ❌ nahi |
| `.github/workflows/maintenance.yml` | roz 01:15 IST | `keepalive()` + `run_daily_maintenance()` | `SUPABASE_DB_URL` |
| `.github/workflows/backup.yml` | roz 02:30 IST | database dump → R2 + GitHub artifact | `SUPABASE_DB_URL` (+ optional R2) |

`SUPABASE_DB_URL` ek hi secret dono ke liye:

```text
GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Name : SUPABASE_DB_URL
Value: postgresql://postgres:<db-password>@db.oytcwpemrrnqrbrtonyu.supabase.co:5432/postgres
```

Jab tak secret nahi hai, wo do workflows khud ko skip kar dete hain (fail nahi hote).

**Agar `pg_cron` job na chale:** Dashboard → Database → Extensions → `pg_cron`
ko off/on karo (isse launcher restart hota hai), phir check karo:

```sql
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 5;
```

`pg_cron` chale ya na chale, `maintenance.yml` roz kaam karta rahega.

---

## 2. Pehli baar setup (15 minute)

### 2.1 Migrations chalao

Supabase Dashboard → **SQL Editor** me file-wise, is order me:

1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`
3. `supabase/migrations/0003_functions.sql`
4. `supabase/migrations/0004_automation.sql`
5. `supabase/migrations/0005_workflows.sql`
6. `supabase/migrations/0006_expense_reject.sql`
7. `supabase/migrations/0007_fee_change.sql`
8. `supabase/migrations/0008_complaint_workflow.sql`
9. `supabase/migrations/0009_prayer_location.sql`
10. `supabase/migrations/0010_donations.sql`
11. `supabase/migrations/0011_security_hardening.sql`
12. `supabase/seed.sql` (sirf demo ke liye)

Ya CLI se:

```powershell
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

> `0004` me `pg_cron` aur `pg_net` ka extension try hota hai. Agar wo pehle se
> enabled hain to koi error nahi aayega.

### 2.2 Function secrets

Sirf do secrets chahiye:

```powershell
# 32+ random characters. Koi bhi lamba password chalega.
npx supabase secrets set CRON_SECRET="<koi-lamba-random-secret>" --project-ref YOUR_PROJECT_REF
```

`SUPABASE_URL` aur `SUPABASE_SERVICE_ROLE_KEY` Supabase khud har function me
daal deta hai — unhe manually set karne ki zaroorat nahi.

Test karte waqt messages **bhejne ke bina** dekhna ho:

```powershell
npx supabase secrets set DRY_RUN=1 --project-ref YOUR_PROJECT_REF
# baad me hata do
npx supabase secrets unset DRY_RUN --project-ref YOUR_PROJECT_REF
```

### 2.3 Functions deploy karo

```powershell
npx supabase functions deploy send-queue   --project-ref YOUR_PROJECT_REF
npx supabase functions deploy payment-webhook --project-ref YOUR_PROJECT_REF
npx supabase functions deploy nightly      --project-ref YOUR_PROJECT_REF
npx supabase functions deploy admin-test   --project-ref YOUR_PROJECT_REF
```

`supabase/config.toml` pehle se tay karta hai:

- `send-queue`, `payment-webhook`, `nightly` → `verify_jwt = false`
  (inme apna `CRON_SECRET` / gateway signature check hota hai)
- `admin-test` → `verify_jwt = true`
  (sirf signed-in office bearer hi test kar sakta hai)

### 2.4 Cron lagao

Supabase Dashboard → SQL Editor me chalao. Pehle URL aur secret vault me rakho:

```sql
select vault.create_secret('https://YOUR_PROJECT.supabase.co', 'anjuman_project_url');
select vault.create_secret('<wahi CRON_SECRET>', 'anjuman_cron_secret');
```

Phir schedule:

```sql
-- Har 5 minute: message queue saaf karo
select cron.schedule(
  'anjuman-send-queue',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'anjuman_project_url') || '/functions/v1/send-queue',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'anjuman_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 50000
  );
  $$
);

-- Roz 20:30 UTC = 02:00 IST: invoices, reminders, expiry, ledger check
select cron.schedule(
  'anjuman-nightly',
  '30 20 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets
            where name = 'anjuman_project_url') || '/functions/v1/nightly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets
                        where name = 'anjuman_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
```

Check karo:

```sql
select jobname, schedule, active from cron.job;
select * from cron.job_run_details order by start_time desc limit 10;
```

Band karna ho:

```sql
select cron.unschedule('anjuman-send-queue');
select cron.unschedule('anjuman-nightly');
```

---

## 3. Panel me keys kaise daalein

Har tenant apni keys khud daalta hai — Super Admin apni platform billing ke liye.

1. Panel → **Settings → Notifications** (ya **Settings → Payments**).
2. Provider chuno, keys paste karo.
3. **Test** dabao → `admin-test` function provider ko ek safe read-only call
   bhejta hai. Secret kabhi wapas browser me nahi aata.
4. Test pass → **Enable** on karo.

Server par key `save_integration_secret()` RPC se jaati hai aur
`integration_secrets` table me rehti hai. Is table par `anon`/`authenticated`
ka koi access nahi hai — sirf `service_role`.

---

## 4. Integration key formats

### WhatsApp Cloud API (Meta)

```json
{
  "phone_number_id": "1234567890",
  "token": "EAAG...",
  "api_version": "v21.0",
  "template_language": "en",
  "template_map": {
    "dues_reminder": "dues_reminder_hi",
    "overdue_notice": "overdue_notice_hi",
    "receipt_issued": "receipt_issued_hi",
    "notice_alert": "notice_alert_hi",
    "test_message": "test_message_hi"
  }
}
```

- `template_map` ho to approved **template** bhejta hai.
- `template_map` na ho to **plain text** bhejta hai. Plain text sirf un numbers
  par jaata hai jinhone pichhle 24 ghante me aapko message kiya ho (ya test
  numbers par). Production ke liye templates approve karwao.

**Template variable order (exactly yahi rakho):**

| Template | `{{1}}` | `{{2}}` | `{{3}}` | `{{4}}` | `{{5}}` |
| --- | --- | --- | --- | --- | --- |
| `dues_reminder` | member name | month | amount | due date | masjid |
| `overdue_notice` | member name | month | amount | due date | masjid |
| `receipt_issued` | member name | amount | receipt no | masjid | — |
| `notice_alert` | title | body | masjid | — | — |
| `test_message` | masjid | — | — | — | — |

### SMS — MSG91 (DLT flow)

```json
{
  "authkey": "...",
  "template_id": "...",
  "sender_id": "ANJUMN",
  "country_code": "91"
}
```

Variables `VAR1`, `VAR2`, … usi order me jaate hain jo upar table me hai.
DLT template me variables ka order match hona chahiye.

### SMS — Fast2SMS

```json
{
  "api_key": "...",
  "sender_id": "ANJUMN",
  "dlt_template_id": "...",
  "route": "dlt"
}
```

`route: "q"` test ke liye hai (DLT ke bina). Production me `dlt`.

### Email — Resend

```json
{
  "api_key": "re_...",
  "from": "Anjuman <receipts@yourdomain.com>",
  "reply_to": "sadar@yourdomain.com"
}
```

Testing ke liye `from` me `onboarding@resend.dev` use kar sakte ho, lekin
production me apna verified domain lagao.

### Push — Firebase Cloud Messaging

```json
{
  "service_account": {
    "project_id": "...",
    "client_email": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  }
}
```

Yeh Android app phase me use hoga. Server-side JWT WebCrypto se banta hai,
koi extra library nahi.

### Payment — Razorpay

```json
{
  "key_id": "rzp_live_...",
  "key_secret": "...",
  "webhook_secret": "..."
}
```

### Payment — Cashfree

```json
{
  "app_id": "...",
  "secret_key": "...",
  "webhook_secret": "...",
  "api_version": "2023-08-01"
}
```

`webhook_secret` na ho to `secret_key` hi signature verify karne ke liye use
hota hai (Cashfree ka default behaviour).

### Payment — PhonePe

```json
{
  "merchant_id": "...",
  "salt_key": "...",
  "salt_index": "1"
}
```

PhonePe ke liye payment row pehle se honi chahiye (panel/checkout se), kyunki
callback me member ka reference nahi aata. Webhook `merchantTransactionId` se
payment dhoondhta hai.

---

## 5. Gateway webhook URLs

Razorpay / Cashfree / PhonePe dashboard me webhook URL ye daalo:

```text
https://YOUR_PROJECT.supabase.co/functions/v1/payment-webhook?provider=razorpay
https://YOUR_PROJECT.supabase.co/functions/v1/payment-webhook?provider=cashfree
https://YOUR_PROJECT.supabase.co/functions/v1/payment-webhook?provider=phonepe
```

Webhook secret wahi daalo jo `integration_secrets` me save kiya hai.

### Kya hota hai jab webhook aata hai

1. **Signature check** — bina sahi signature ke kuch nahi likha jaata.
2. **Event id** se duplicate delivery rok li jaati hai (`webhook_events`).
3. Payment `reference` (order id) se dhoondhi jaati hai.
4. Row na mile to — sirf tab banayi jaati hai jab `notes`/`tags` me
   `member_id` ho. Nahi to event `ignored` ho jaata hai.
5. **Amount match** nahi karta → auto-verify **nahi** hota; event `failed` ke
   saath panel me review ke liye aata hai.
6. Sab theek → `verify_payment_auto()` receipt number deta hai, ledger me entry
   karta hai, aur member ko receipt message queue hota hai.
7. `auto_verify_gateway = false` ho to payment `pending` rehti hai — khajanchi
   khud verify karega.

> **Safety:** auto-verify sirf un payments par chalta hai jo webhook ne banayi
> hon (`entered_by is null`) aur `method = 'gateway'`. Insaan ki entry hamesha
> manually verify hogi.

---

## 6. Manual test (bina panel ke)

### Queue dry-run

```powershell
curl.exe -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/send-queue" `
  -H "Content-Type: application/json" `
  -H "x-cron-secret: <CRON_SECRET>" `
  -d '{\"dry_run\":true,\"batch\":5}'
```

### Nightly ek hi tenant ke liye

```powershell
curl.exe -X POST "https://YOUR_PROJECT.supabase.co/functions/v1/nightly" `
  -H "Content-Type: application/json" `
  -H "x-cron-secret: <CRON_SECRET>" `
  -d '{\"tenant_id\":\"<TENANT_UUID>\"}'
```

### Invoice / reminder manually

SQL Editor me:

```sql
select public.generate_monthly_invoices('<TENANT_UUID>', '2026-11');
select public.queue_reminders('<TENANT_UUID>', '2026-11', true);
select * from public.notification_queue order by created_at desc limit 20;
```

---

## 7. Kahan dekhna hai jab kuch na chale

| Table | Kya batati hai |
| --- | --- |
| `notification_queue` | Har message ka status, attempts, provider error |
| `webhook_events` | Gateway event aaya ya nahi, signature ok tha ya nahi, error |
| `job_runs` | Nightly / send-queue kab chala, kya hua |
| `audit_log` | Kisne kya badla |

Common errors:

- **401 `invalid_signature`** — webhook secret galat hai. Panel me dobara save
  karo, phir gateway dashboard me wahi secret daalo.
- **`no_enabled_integration`** — Settings me integration enable nahi hai.
- **`missing_member_reference`** — gateway order me `member_id` nahi bheja gaya.
  Checkout banate waqt order notes/tags me `member_id` daalo.
- **`amount_mismatch:expected=...:received=...`** — member ne alag amount
  bheja, ya order amount badla gaya. Payment `pending` rahegi; khajanchi review
  karke verify ya reject karega.
- **Message `failed`** — 3 attempts ke baad ruk jaata hai. `notification_queue`
  me `error` dekho. Keys theek karke dobara queue kar sakte ho.
- **`sending` me atka** — 10 minute baad `requeue_notifications()` khud wapas
  queue kar deta hai.

---

## 8. Kya abhi nahi hai (jaan-boojh kar)

- **Public bill-payment portal** — abhi nahi. Member apne UPI se seedha pay
  karta hai; khajanchi reference verify karta hai.
- **Platform-held money** — kabhi nahi. Platform member ka paisa hold nahi
  karta (RBI payment-aggregator rules).
- **Late fee auto-charge** — invoice amount ko baad me badalna transparency
  kharab karta hai, isliye abhi manual custom charge hai.
- **Subscription auto-billing** — Super Admin panel se manual mark hota hai;
  gateway-based platform billing baad me.

---

## 9. Security notes (developer ke liye)

- `service_role` key sirf Edge Functions me hai; browser bundle me kabhi nahi.
- `integration_secrets` par koi RLS policy nahi — `anon`/`authenticated` ko
  table ka access hi nahi (`revoke all`).
- Financial tables (`ledger_entries`, `ledger_seals`, `receipt_sequences`,
  `payment_allocations`) par browser se insert/update/delete **revoked** hai.
- `payments`, `expenses`, `funds`, `invoices` par triggers har direct write
  rok dete hain; sirf approved RPC final state set kar sakta hai.
- Tenant apni subscription khud extend nahi kar sakta — `tenants` par guard
  trigger lagta hai.
- Har webhook signature constant-time compare hota hai.
- Failed webhook event delete hota hai taaki gateway retry kar sake; successful
  event hamesha `webhook_events` me rehta hai.
