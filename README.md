# Anjuman — Community OS

Transparent, auditable management for village **anjumans** and **masjid committees**.
One platform, many committees — each with completely isolated data.

> Ye admin panel pehle **demo mode** me chalta hai (sample data ke saath), taaki
> bina kuch setup kiye sab kuch dekh sako. Supabase keys daalte hi real ban jata hai.

> **Naya developer? Pehle [`PROJECT.md`](./PROJECT.md) padhein.** Usme poora file map,
> database schema, RPCs, money rules, workflows, troubleshooting aur bug-fix checklist hai.

---

## Why this exists

Village committees usually run on a notebook and a WhatsApp group. That creates three
problems: members don't know where the money went, the khajanchi gets blamed for
shortfalls, and records disappear when a new committee takes over.

Anjuman fixes this with:

- **A hash-chained ledger** — every entry links to the previous one, so a silent edit
  breaks the chain visibly.
- **Maker–checker approvals** — the person who records a payment can never verify it.
  The khajanchi is protected by design.
- **Unique member IDs** (`BHR-000123-7`) with a check digit, plus printable ID cards.
- **Automatic dues, reminders, receipts and reconciliation.**
- **Zero platform custody of member money** — payments go to the committee's own UPI
  or gateway account (RBI-safe, no platform commission).

---

## Stack

| Layer     | Choice                              | Why |
| --------- | ----------------------------------- | --- |
| Frontend  | Next.js 15 (static export)          | No server to pay for |
| Hosting   | Cloudflare Pages                    | Unlimited bandwidth, free |
| Database  | Supabase (Postgres + Auth + RLS)    | Multi-tenant isolation at the DB layer |
| Files     | Cloudflare R2                       | Cheap storage for bills, photos, backups |
| Push      | Firebase Cloud Messaging            | Free, unlimited |
| Email     | Resend                              | Free tier 3,000/month |
| CI/CD     | GitHub Actions                      | Build, deploy, nightly backup |

Money is stored as **integer paise** everywhere. Never floats.

---

## Run it locally

```bash
npm install
npm run dev        # http://localhost:3000
```

Without environment variables the app starts in **demo mode**: pick a role on the login
screen (Sadar, Khajanchi, Collector, Member, Platform Admin) and the whole panel runs on
deterministic sample data. Nothing is sent to a server.

### Connect a real Supabase project

1. Create a project at **supabase.com** (Free plan is enough to start). Save the database password.
2. **Project Settings → API** → copy **Project URL** and **anon public** key into `.env.local`:

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   NEXT_PUBLIC_APP_URL=https://anjuman.pages.dev
   NEXT_PUBLIC_DEMO_MODE=false
   ```

   (Only `NEXT_PUBLIC_*` reaches the browser. **Never** put the `service_role` key here.)
3. **SQL Editor → New query** → paste the whole of `supabase/apply-all.sql` → **Run**.
   That file is all 12 migrations in order; it is safe on a brand-new project.
4. **Authentication → Users → Add user** — enter the Sadar's email + password and tick
   **Auto Confirm User**.
5. Edit the values at the top of `supabase/bootstrap-first-anjuman.sql` (anjuman name,
   village, district, and that email) and run it. It creates the anjuman, its default
   funds, a ₹500 monthly plan, and makes that user **Sadar**.
6. `npm run build` then `npm run deploy`. With direct upload the env values are baked in
   at build time, so Cloudflare dashboard variables are not used.
7. Sign in with the email/password from step 4. Office bearers and members are added the
   same way: create the auth user, then insert a `profiles` row with their `role`,
   `tenant_id` and (for members) `member_id`.

`supabase/seed.sql` is optional sample data for trying the panel — do not run it on a
production project that will hold real money.

The automation layer (Edge Functions, cron, webhooks) has its own step-by-step guide in
**[docs/AUTOMATION.md](docs/AUTOMATION.md)**.

```bash
npm run build      # static export → out/
npm run deploy     # upload out/ to Cloudflare Pages (project: anjuman)
npm run typecheck  # tsc --noEmit
npm run test:sql   # migrations + money-flow tests in PGlite (real Postgres)
```

> **Deploying:** the Cloudflare Pages project `anjuman` is set to **direct upload**.
> Git pushes no longer publish automatically (its Git builder kept serving an old
> cached build), so run `npm run build && npm run deploy` after a change. The
> GitHub Action in `.github/workflows/deploy.yml` does the same on push, but only
> once `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` and the
> `CLOUDFLARE_PAGES_PROJECT` repo variable are set in GitHub → Settings → Secrets.


`npm run test:sql` runs the actual migration files in an in-memory Postgres and then
asserts the security promises: tenant isolation, maker–checker, immutable amounts,
self-approval block, idempotent invoices, reversals and a valid ledger chain. It needs
no database, no Docker and no network. CI runs it before every deploy.

---

## What's inside

```
src/app/
  login/                     role picker (demo) or Supabase email login
  (app)/
    dashboard/               role-aware home — exceptions only
    approvals/               maker–checker queue
    members/                 list, filters, member-ID lookup, profile drawer
    households/              family-level dues view
    id-cards/                bulk A4 sheet (2×4) with QR codes
    namaz/                   timetable, iqamah offsets, Excel import
    notices/                 multi-channel publishing
    complaints/              tracking codes, SLA, anonymous mode
    finance/
      fees/                  plan builder, overrides, concessions, waivers
      collections/           collect 1/2/all months → receipt → thermal print
      donations/             zakat / sadaqah kept separate
      expenses/              bills, fund tags, approvals
      ledger/                hash chain viewer + integrity check
      reports/               statements for the committee and auditor
    settings/
      anjuman/               profile shown on receipts and ID cards
      payments/              Mode A (own UPI) + Mode B (own gateway keys)
      notifications/         WhatsApp / SMS / email / push, plug-and-play
      roles/                 permission matrix, access log
    platform/
      tenants/               per-anjuman pricing, flags, suspend, impersonate
      plans/                 free / fixed / custom plans
      billing/               platform subscription billing
supabase/
  migrations/                0001 schema · 0002 RLS · 0003 functions · 0004 automation · 0005 approvals · 0006 expense reject · 0007 fee change · 0008 complaints · 0009 prayer location · 0010 donations · 0011 security hardening
  seed.sql                   demo tenant
  functions/
    send-queue/              drains the WhatsApp/SMS/email/push queue
    payment-webhook/         Razorpay / Cashfree / PhonePe reconciliation
    nightly/                 invoices, reminders, expiry, ledger check
    admin-test/              "paste keys → test → enable"
  config.toml                per-function JWT settings
  tests/sql-tests.mjs        migrations + money-flow tests (PGlite)
.github/workflows/           deploy + nightly backup
docs/AUTOMATION.md           cron, secrets, webhook URLs, troubleshooting
```

---

## Security model

1. **Row Level Security on every table.** A tenant user can only read rows where
   `tenant_id = current_tenant_id()`, resolved from `profiles` via a `SECURITY DEFINER`
   helper (so it can't recurse).
2. **Append-only ledger.** `ledger_entries` has read + insert policies only; update and
   delete are blocked by restrictive policies.
3. **No self-approval.** Enforced by table checks (`verified_by <> entered_by`,
   `decided_by <> requested_by`) *and* by the RPCs.
4. **Anon key only in the browser.** `service_role` never ships to the client.
5. **Secrets stay server-side.** Gateway / WhatsApp / SMS keys live in
   `integration_secrets`, a table with no `anon` or `authenticated` access at all.
   Edge Functions read them with the service key; the panel only ever sends keys in.

---

## Payment compliance (important)

The platform **never holds member money**. There are two supported modes:

- **Mode A** — the committee's own UPI ID/QR. The member pays directly; the khajanchi
  verifies the reference and a receipt is issued.
- **Mode B** — the committee's own Razorpay/Cashfree/PhonePe keys. Settlement goes to the
  committee's bank account; the platform only reads webhooks to mark receipts.

Holding funds would make the platform a payment aggregator (RBI authorisation + security
deposit required). This architecture avoids that entirely, which is why there is no
platform commission on member payments.

---

## Roadmap

- [x] Web admin panel (this repo)
- [x] Multi-tenant schema + RLS + ledger functions
- [x] Public member lookup page (`/verify?id=…`) for ID-card QR codes
- [x] Edge Functions: WhatsApp/SMS/email sender, payment webhooks, nightly reconciliation
- [ ] Panel wiring for integration keys + test button (UI reads/writes through `save_integration_secret`)
- [ ] Android app (single app, role-based navigation)
- [ ] Bulk PDF ID cards (server-side, print-shop ready)
- [ ] Platform subscription auto-billing through the same webhook layer

---

## License

Private / all rights reserved. Built for a specific pilot committee first.
