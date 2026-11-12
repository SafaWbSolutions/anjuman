# Anjuman / Community OS — Developer Handbook

> **Purpose of this file:** ek hi jagah poora project. Kaun si file kahan hai, kya karti hai,
> database me kya hai, paisa kaise calculate hota hai, aur bug aaye to **direct kis file me
> haath daalna hai**. Naya developer pehle ye file padhe, phir code khole.
>
> **Last verified:** 12 Nov 2026 · migration head `0043` · Raziya monthly hisab + gift reclassification deployed.

---

## 0. How to read this document

| If you want to… | Read |
| --- | --- |
| Understand the product in 2 minutes | [§1](#1-product-overview) |
| Run the project locally | [§4](#4-local-development) |
| Know which page/file does what | [§6](#6-frontend-routes-pages) |
| Know which DB table/RPC to touch | [§9](#9-database-tables), [§10](#10-database-functions-rpcs) |
| Understand money rules (**must read before any finance change**) | [§16](#16-financial-invariants--never-break-these) |
| Fix a specific bug | [§21](#21-troubleshooting-symptom--file--fix) |
| Add/change a feature safely | [§22](#22-change-this--touch-these-files), [§24](#24-bug-fix-checklist) |
| Avoid known traps | [§23](#23-known-pitfalls) |

**Rule for every developer:** UI sirf dikhawa hai. **Asli security aur paisa database me hai**
(RLS + SECURITY DEFINER RPCs). UI me button hide karna kaafi nahi hai.

---

## 1. Product overview

Anjuman / Masjid committees ke liye multi-tenant SaaS. Har gaon / masjid ka apna alag
account hota hai; ek tenant ka data doosre tenant ko kabhi nahi dikhna chahiye.

### The six promises

1. **Multi-tenant, zero leakage** — har row par `tenant_id`, har query RLS se scoped.
2. **Tamper-evident money** — ledger hash-chained hai; entry edit karne se chain tootegi.
3. **Maker–checker** — jo payment/expense enter kare, wahi approve nahi kar sakta.
4. **Khajanchi protected** — system proof deta hai ki paisa kahan gaya.
5. **Zero platform custody** — member ka paisa committee ke apne UPI/gateway me jata hai
   (RBI-safe); platform sirf software deta hai.
6. **Zero cost** — Supabase Free + Cloudflare Pages + GitHub Actions.

### Roles (short)

| Role | Hinglish | Main kaam |
| --- | --- | --- |
| `super_admin` | Platform Admin | Saare anjuman, plans, billing, registration requests, support |
| `sadar` | President | Anjuman profile, members, fees, approvals, contact admin |
| `khajanchi` | Treasurer | Collections, donations, expenses, payments settings, approvals |
| `secretary` | Secretary | Members, notices, profile, roles, contact admin |
| `auditor` | Auditor | Finance oversight; verify payments/donations, approve expenses (never own entry) |
| `collector` | Collector | Field collection entry (no approval rights) |
| `member` | Member | Apna dashboard, ID card, notices, notifications, complaints |

Full matrix: [§14](#14-roles--navigation-matrix).

---

## 2. Live environment

| Item | Value |
| --- | --- |
| Production URL | `https://anjuman.pages.dev` |
| Hosting | Cloudflare Pages, project `anjuman`, branch `main` |
| Supabase project ref | `oytcwpemrrnqrbrtonyu` (region `ap-south-1` / Mumbai) |
| GitHub repo | `SafaWbSolutions/anjuman` (public) |
| Migration head | `0037_payment_settings_rpc.sql` |
| DB connection (CI) | session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.<ref>` |
| Backups | GitHub Release tag `backup-archive`, encrypted `.sql.gz.gpg` |

> Supabase project URL/anon key `.env.local` me hain (gitignored). **Service role key kabhi
> frontend me nahi.** Woh sirf Edge Functions ke secrets me hai.

### Test / demo accounts (live)

| Email | Role |
| --- | --- |
| `starservices0026@gmail.com` | super_admin |
| `tahirkhan0026@gmail.com` | sadar |
| `tahirkhan00026@gmail.com` | khajanchi |
| `mdnisar3062@gmail.com` | member |

Demo data me active tenant **Bharauli** hai. Live me ek test tenant
**Raziya Manzil Co-Operative Society** `suspended` hai — bina puche activate na karein.

---

## 3. Tech stack & architecture

| Layer | Choice | Notes |
| --- | --- | --- |
| Frontend | Next.js 15 (App Router) + React 19 | `output: "export"` — pure static SPA |
| Styling | Tailwind CSS 4 | emerald brand theme in `globals.css` |
| Icons | `lucide-react` | nav icons string se resolve hote hain |
| Charts | hand-written SVG | `src/components/charts.tsx`, koi heavy lib nahi |
| PDF | `jspdf` | table PDF + ID card PDF |
| Image capture | `html-to-image` | ID card / receipt PNG |
| QR | `qrcode` | member code verification QR |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) | single DB, `tenant_id` + RLS |
| Hosting | Cloudflare Pages | `out/` folder upload |
| CI/CD | GitHub Actions | `deploy.yml`, `backup.yml`, `keepalive.yml`, `maintenance.yml` |

### Data flow

```
Browser (static Next.js)
   │  supabase-js (anon key + user JWT)
   ▼
PostgREST / Supabase Auth / Storage
   │  RLS: tenant_id = current_tenant_id()
   ▼
Postgres tables (source of truth)
   ▲
   │  SECURITY DEFINER RPCs (verify_payment, approve_expense, …)
   │  triggers (ledger hash chain, notifications, guards)
   │
Edge Functions (service_role): nightly, send-queue, payment-webhook, admin-*
```

**Important:** browser kabhi `payments.status` direct update nahi karta. Woh `verify_payment`
RPC call karta hai, jo role + maker-checker + tenant khud check karta hai.

---

## 4. Local development

### Requirements

- Node.js 20+ (repo `npm` lockfile use karta hai)
- Git (Windows par GitHub Desktop ka bundled git bhi chalega)
- Supabase project (optional — bina keys ke **demo mode** chalta hai)

### Commands

```powershell
cd C:\Users\tahir\OneDrive\Documents\GitHub\anjuman
copy .env.example .env.local     # optional, live mode ke liye
npm.cmd install                  # PowerShell me npm.cmd use karein
npm.cmd run dev                  # http://localhost:3000
npm.cmd run typecheck            # tsc --noEmit
npm.cmd run build                # writes public/version.json + out/
npm.cmd run test:sql             # pglite SQL tests
npm.cmd run deploy               # wrangler pages deploy out
```

> **PowerShell gotcha:** `npm` blocked ho sakta hai, `npm.cmd` use karein.
> Git PATH me nahi hai to:
> `C:\Users\tahir\AppData\Local\GitHubDesktop\app-3.6.10\resources\app\git\cmd\git.exe`

### Demo mode

`src/lib/supabase.ts`:

```ts
isDemoMode = !isSupabaseConfigured || NEXT_PUBLIC_DEMO_MODE === "true";
```

Demo mode me har `repo.ts` function mock data return karta hai (`src/lib/mock.ts`).
Login screen par role picker dikhta hai. Live mode me email/password + email OTP.

`NEXT_PUBLIC_DEMO_MODE=true` **production me kabhi na chhodein** warna asli data nahi dikhega.

---

## 5. Repository map (root)

```
anjuman/
├─ PROJECT.md                  ← ye file (developer handbook)
├─ README.md                   ← short project intro
├─ BACKUP.md                   ← backup/restore runbook
├─ docs/
│  ├─ SETUP.md                 ← non-technical zero-cost setup guide
│  └─ AUTOMATION.md            ← cron/automation explanation
├─ package.json                ← scripts + deps
├─ next.config.ts              ← static export, trailingSlash, unoptimized images
├─ postcss.config.mjs          ← Tailwind 4
├─ tsconfig.json               ← path alias `@/* -> src/*`
├─ .env.example                ← public env template
├─ public/
│  ├─ _redirects               ← SPA fallback for Cloudflare Pages
│  ├─ _headers                 ← cache/security headers (version.json no-store)
│  └─ version.json             ← generated before every build (auto-reload stamp)
├─ scripts/
│  └─ write-version.mjs        ← writes build timestamp for VersionWatcher
├─ .github/workflows/
│  ├─ deploy.yml               ← typecheck + SQL tests + build + Cloudflare deploy
│  ├─ migrate.yml              ← applies one migration file via SUPABASE_DB_URL
│  ├─ backup.yml               ← nightly encrypted backup → GitHub Release
│  ├─ keepalive.yml            ← daily ping so Supabase free DB doesn't pause
│  └─ maintenance.yml          ← daily SQL maintenance RPC
├─ supabase/
│  ├─ migrations/              ← 0001 … 0037 (schema + logic, source of truth)
│  ├─ functions/               ← Deno Edge Functions
│  └─ tests/sql-tests.mjs      ← pglite-based migration/logic tests
└─ src/
   ├─ app/                     ← routes (Next.js App Router)
   ├─ components/              ← shared UI + shell + receipts
   └─ lib/                     ← auth, repo, types, helpers
```

---

## 6. Frontend routes (pages)

`src/app` static export hai. Har folder ek route. `(app)` group URL me nahi dikhta,
lekin uske andar sab pages `AppShell` (sidebar/header) use karte hain.

| Route | File | Roles (nav) | Purpose |
| --- | --- | --- | --- |
| `/` | `app/page.tsx` | public | session check → `/dashboard/` ya `/login/` |
| `/login/` | `app/login/page.tsx` | public | login, forgot password, email OTP, registration request entry |
| `/verify/` | `app/verify/page.tsx` | public | ID card QR scan → limited member verification |
| `/dashboard/` | `(app)/dashboard/page.tsx` | all | role-wise KPIs, alerts, charts, quick actions |
| `/notifications/` | `(app)/notifications/page.tsx` | all | member notifications (payment/due/notice/approval) |
| `/approvals/` | `(app)/approvals/page.tsx` | sadar, khajanchi, auditor | single maker-checker queue |
| `/members/` | `(app)/members/page.tsx` | office + collector + super_admin | member list, add/edit, dues range, advance, remove, login create, payment edit/reset |
| `/households/` | `(app)/households/page.tsx` | office | household grouping & dues rollup (active members only; archived excluded) |
| `/id-cards/` | `(app)/id-cards/page.tsx` | sadar, secretary, super_admin (member: own) | ID card view/print/bulk PDF/PNG/WhatsApp |
| `/namaz/` | `(app)/namaz/page.tsx` | office + member | prayer timetable, calculation, manual override |
| `/notices/` | `(app)/notices/page.tsx` | all | notices create/broadcast |
| `/complaints/` | `(app)/complaints/page.tsx` | office + member | complaint tracking |
| `/finance/fees/` | `(app)/finance/fees/page.tsx` | sadar, secretary, auditor | fee plans, fee cycle, automation toggles, overrides |
| `/finance/collections/` | `(app)/finance/collections/page.tsx` | sadar, khajanchi, collector, auditor | record payment, verify/reject, receipts |
| `/finance/donations/` | `(app)/finance/donations/page.tsx` | sadar, khajanchi, auditor | zakat/sadqa/gift donations + receipt |
| `/finance/expenses/` | `(app)/finance/expenses/page.tsx` | sadar, khajanchi, auditor | expense entry, approve/reject, fund balances |
| `/finance/ledger/` | `(app)/finance/ledger/page.tsx` | sadar, khajanchi, auditor | hash-chained ledger + verify chain |
| `/finance/reports/` | `(app)/finance/reports/page.tsx` | office | date-wise/all-time analysis, Excel + PDF |
| `/contact-admin/` | `(app)/contact-admin/page.tsx` | sadar, secretary | message platform admin |
| `/profile/` | `(app)/profile/page.tsx` | all | photo/name/mobile/email + optional TOTP |
| `/settings/anjuman/` | `(app)/settings/anjuman/page.tsx` | sadar, secretary | identity, contact, branding, location |
| `/settings/payments/` | `(app)/settings/payments/page.tsx` | sadar, khajanchi | UPI QR upload, bank details, gateway keys, modes |
| `/settings/notifications/` | `(app)/settings/notifications/page.tsx` | sadar, secretary | SMS/WhatsApp/email/push channels |
| `/settings/roles/` | `(app)/settings/roles/page.tsx` | sadar, secretary | staff list + permission matrix |
| `/platform/tenants/` | `(app)/platform/tenants/page.tsx` | super_admin | create/suspend/reactivate anjumans, pricing, limits |
| `/platform/registrations/` | `(app)/platform/registrations/page.tsx` | super_admin | public registration inbox, KYC/proof, approve/reject |
| `/platform/members/` | `(app)/platform/members/page.tsx` | super_admin | cross-tenant member search/edit |
| `/platform/team/` | `(app)/platform/team/page.tsx` | super_admin | all accounts, role change, activate/deactivate |
| `/platform/plans/` | `(app)/platform/plans/page.tsx` | super_admin | plans, pricing, feature flags |
| `/platform/billing/` | `(app)/platform/billing/page.tsx` | super_admin | platform invoices + payment gateway keys |
| `/platform/support/` | `(app)/platform/support/page.tsx` | super_admin | support inbox |

### Route access — important

- `AppShell` sirf **login** check karta hai (`ready && !user → /login/`).
- Nav links role ke hisaab se hide hote hain (`src/lib/nav.ts`).
- **Direct URL open karna security bypass nahi hai**, kyunki Postgres RLS us role ko rows
  nahi dega. Lekin agar naya page sensitive action karta hai, usme role check + RPC-level
  check zaroor rakhein.

---

## 7. Components

| File | What it owns |
| --- | --- |
| `components/ui.tsx` | design system: `Button`, `Card`, `CardHeader`, `Badge`, `StatusPill`, `Avatar`, `Field`, `Input`, `PhoneInput` (10-digit lock), `Select`, `SearchInput`, `Switch` (fixed ON state), `Drawer`, `TableWrap`, `Th`, `Td`, `EmptyState`, `StatCard`, `PageHeader`, `toast`, `Toaster` |
| `components/brand.tsx` | `MadeBy` — "Made By : Safa Web Solution" + "Made in India" (heart + tiranga) |
| `components/shell/AppShell.tsx` | sidebar, header, role nav, badges, Ctrl+K palette, `VersionWatcher`, monthly dues self-heal, print shortcut isolation |
| `components/receipt.tsx` | `ReceiptDrawer`, `receiptOf`, `methodLabel` — 58mm/80mm receipt, print/share |
| `components/charts.tsx` | `BarPair`, `Sparkline`, `ProgressBar`, `Donut` — pure SVG |
| `components/finance-overview.tsx` | reusable finance analysis block (date-wise/all-time cards + breakdown) |
| `components/registration-request-form.tsx` | public anjuman registration modal (all fields + 3 uploads + success ref) |

### `PageHeader`

Har page ka top heading. `eyebrow` (section), `title`, `description`, optional action.

### `Td` gotcha

`Td` **`colSpan` accept nahi karta** (type me nahi hai). Agar full-width row chahiye to
plain `<td colSpan={n}>` use karein, ya `Td` ka type extend karein — jaldi me
`colSpan` pass karne se TypeScript error aayega.

### `Switch` gotcha (already fixed)

ON state ka thumb right aur track emerald dikhna chahiye. Pehle thumb position galat thi.
Ab flex `justify-start` / `justify-end` + `p-0.5` use hota hai. Ise dobara absolute
positioning me na badlein bina mobile par test kiye.

---

## 8. `src/lib` reference

### 8.1 `types.ts` — domain types

- `Role`, `MFA_ROLES`, `ROLE_LABEL`
- `TenantStatus`, `PlanType`, `Tenant` (UPI QR + bank fields included)
- `Member`, `MemberType`, `MemberStatus`
- `Invoice`, `Payment`, `PaymentMethod`, `PaymentStatus`
- `Fund`, `Expense`, `Donation`, `LedgerEntry`
- `Approval`, `Complaint`, `Notice`, `PrayerDay`
- `RegistrationRequest`, `SessionUser`, etc.

**Rule:** naya DB column add karein to `types.ts` + `repo.ts` mapping dono update karein.
Warna TypeScript pass ho jayega lekin field `undefined` rahegi.

### 8.2 `repo.ts` — the only data-access layer

Har page seedha supabase call nahi karta; `repo.ts` call karta hai. Isse demo fallback,
error handling aur type mapping ek jagah rehti hai.

**Groups of exported functions:**

| Area | Functions |
| --- | --- |
| Reads | `listMembers`, `listInvoices`, `listPayments`, `listExpenses`, `listFunds`, `listLedger`, `listNotices`, `listComplaints`, `listDonations`, `listApprovals`, `listInvitations`, `listStaff`, `listTenants`, `listAllMembers`, `listAllAccounts`, `listSupportMessages`, `listRegistrationRequests`, `getMyMember`, `findMemberByCode` |
| Dashboard | `getDashboard`, `getWorkQueue`, `dashboard_snapshot` RPC |
| Tenant | `getCurrentTenant`, `getTenantSettings`, `saveTenantSettings`, `saveTenantProfile`, `saveTenantProfileForTenant`, `savePaymentSettings`, `createTenantRecord`, `setMemberPrefix`, `setFeeCycle`, `saveTenantLocation` |
| Members | `createMember`, `saveMemberDetails`, `removeMember`, `updateMemberAcrossTenants`, `setMemberActiveAcrossTenants`, `createMemberLogin` |
| Fees / dues | `listFeePlans`, `createFeePlan`, `archiveFeePlan`, `listFeeOverrides`, `requestFeeChange`, `requestWaiver`, `generateInvoices`, `generateDuesRange`, `submitAdvancePayment` |
| Payments | `createPayment`, `verifyPayment`, `rejectPayment`, `reversePayment`, `requestPaymentEdit`, `requestPaymentReset` |
| Donations | `createDonation`, `verifyDonation`, `rejectDonation` |
| Expenses | `createExpense`, `approveExpense`, `rejectExpense` |
| Approvals | `listApprovals`, `decideApproval` |
| Complaints / notices | `createComplaint`, `updateComplaint`, `createNotice`, `broadcastNotice` |
| Notifications | `listMyNotifications`, `markNotificationRead`, `markAllNotificationsRead` |
| Prayer | `listPrayerDays`, `savePrayerDay`, `savePrayerDays` |
| Platform | `listPlatformPlans`, `savePlatformPlan`, `createPlatformPlan`, `listPlatformInvoices`, `createPlatformInvoice`, `markPlatformInvoicePaid`, `voidPlatformInvoice`, `setAccountRole`, `setAccountActive` |
| Integrations | `listIntegrations`, `saveIntegrationSecret`, `testIntegration` |
| Registration | `submitRegistrationRequest`, `uploadRegistrationDoc`, `getRegistrationDocUrl`, `decideRegistrationRequest` |
| Profile / upload | `saveMyProfile`, `uploadAvatar`, `uploadPaymentQr` |
| Support | `sendSupportMessage`, `sendPublicSupportMessage`, `setSupportMessageStatus` |
| Invites | `createInvitation`, `listInvitations`, `acceptInvitation` |
| Reminders | `queueReminders` |

> `repo.ts` hi wo file hai jahan **naya API call** add hota hai. Page me direct
> `supabase.from(...)` likhna avoid karein (demo mode toot jayega).

### 8.3 `auth.tsx` — session & login

- Demo mode: role picker → `localStorage["anjuman.session"]`.
- Live mode:
  1. `signInWithPassword`.
  2. `loadSessionUser(user.id)` → `profiles` se role, tenant, suspension check.
  3. Agar role `MFA_ROLES` me hai aur device trusted nahi hai → `signInWithOtp` (email OTP).
  4. OTP verify → `localStorage["anjuman.device.<uid>"] = "1"`.
  5. Agar user ne TOTP factor enable kiya hai to `mfa.challenge` + `mfa.verify`.
- Suspended / inactive profile: Supabase session clear + `sessionStorage["anjuman.auth.error"]`
  me exact message; login page use dikhata hai.
- `updateLocalUser(patch)` profile edit ke baad shell ko refresh karta hai.

**Exact suspension message:**
`Aapka Account Suspend kar diya gaya hai. Admin se contact karen.`

### 8.4 `session.ts`

`loadSessionUser(userId)`:
- `profiles` row read karta hai (role yahin se, `user_metadata` se **nahi**).
- `my_tenant_status()` RPC se tenant status check.
- `suspended` → throw exact message.
- `read_only` → user load hota hai lekin write actions DB guard se block.
- `currentUserId()` helper.

### 8.5 `nav.ts`

Single source of truth for sidebar. `NAV` sections + per-item `roles`; `navForRole(role)`
filter karta hai. Naya page add karein to yahan entry karein, warna sidebar me nahi dikhega.

### 8.6 `supabase.ts`

Browser client (anon key only). `isSupabaseConfigured`, `isDemoMode`. Service role yahan
**kabhi** nahi.

### 8.7 `utils.ts`

`cn`, `formatINR`, `periodLabel`, `formatDate`, `downloadCSV`, `initials`, `currentPeriod`,
`shiftPeriod`, `periodRange`, `memberCode`, `checkDigit`, `amountInWords`, `printArea`,
`ensurePrintRoot`, `whatsappShareUrl`, `downloadNodePng`, `shareNodeOnWhatsApp`.

- `printArea()` — sirf `.print-area` clone karke `#print-root` me daalta hai.
- `shareNodeOnWhatsApp()` — Web Share API; support na ho to PNG download.
- `checkDigit()` — member code `BHR-000123-7` ka last digit.

### 8.8 `export.ts`

- `downloadCsv(filename, headers, rows)` — Excel-compatible CSV.
- `downloadPdfTable(...)` — **real table** PDF (jsPDF), image screenshot nahi.

### 8.9 `prayer.ts`

Prayer time calculation (Hanafi/Shafi etc.), `hijriFor`, `monthDates`, `addMinutes`,
`todayIso`. `DEFAULT_PRAYER_PARAMS` tenant location se override hote hain.

### 8.10 `states.ts`

`INDIAN_STATES` — 28 states + 8 UTs + "Other". **Har state dropdown isi ko use kare**;
duplicate list na banayein.

### 8.11 `mock.ts`

Demo data: tenants, 30 members, invoices, payments, funds, expenses, donations, ledger,
approvals, complaints, notices, prayer days, plans. `memberById`, `memberByCode`,
`duesForMember`, `dueTotal`, `paymentsForMember`, `stats`, `monthlySeries`,
`topDefaulters`.

---

## 9. Database tables

Schema source: `supabase/migrations/0001_schema.sql` + later alters. Money **integer paise**
me hai, kabhi float nahi.

### 9.1 Tenancy & identity

| Table | Purpose | Key columns |
| --- | --- | --- |
| `tenants` | Ek anjuman/masjid | `code` (2–4 uppercase), `name`, `village`, `district`, `state`, `pincode`, `masjid`, `reg_no`, `phone`, `email`, `upi_id`, `upi_qr_url`, `upi_enabled`, `auto_verify_upi`, bank fields, `address`, `logo_url`, `theme_color`, `status`, `plan_type`, `plan_amount_paise`, `plan_cycle`, `expires_at`, `grace_days`, `member_limit`, `features` |
| `profiles` | Har auth user ka role/tenant | `id → auth.users`, `tenant_id`, `full_name`, `phone`, `email`, `role`, `is_active`, `two_factor`, `member_id` |
| `members` | Anjuman member | `serial_no`, `code`, `name`, `father_name`, `phone`, `email`, `household`, `mohalla`, `member_type`, `status`, `fee_paise`, `joined_on`, `blood_group`, `photo_url`, `concession`, `notes` |
| `invitations` | Staff invite | `email`, `role`, `token`, `expires_at`, `accepted_at` |

> Member ID format: `<TENANT_CODE>-<6 digit serial>-<check digit>`, e.g. `BHR-000123-7`.
> `assign_member_code()` trigger banata hai; `serial_no` tenant ke andar unique.

### 9.2 Fees, invoices, payments

| Table | Purpose | Key columns |
| --- | --- | --- |
| `fee_plans` | Default monthly fee | `name`, `amount_paise`, `cycle`, `due_day` (1–28), `grace_days`, `is_active` |
| `fee_overrides` | Per-member special fee | `member_id` unique, `amount_paise`, `reason`, `approved_by`, `approved_at` |
| `invoices` | Member ki monthly due | `period` (`YYYY-MM`), `amount_paise`, `paid_paise`, `status`, `due_date`, `waived_reason`, `waived_by`; unique `(tenant_id, member_id, period)` |
| `payments` | Member payment | `amount_paise`, `method`, `reference`, `status`, `receipt_no`, `period_from/to`, `entered_by`, `verified_by`, `verified_at`, `note`, **`unallocated_paise`** (advance), **`settled_at`** |
| `payment_allocations` | Payment → invoice split | `payment_id`, `invoice_id`, `amount_paise` |
| `receipt_sequences` | Fiscal-year receipt counter | `fiscal_year`, `last_no` (starts 1000) |

**Payment status flow:** `pending → verified` (or `rejected` / `disputed`).
**Invoice status flow:** `pending → partial → paid`; `waived` bhi possible.
**Never** `payments.paid_paise` par bharosa karein — invoice paid = allocations ka sum.

### 9.3 Funds, expenses, ledger

| Table | Purpose |
| --- | --- |
| `funds` | Fund balances. Core codes: `GEN` (General), `ZAKAT`, `SADQA`, `GIFT`; demo mock me `IMS`, `MST`, `JNZ` bhi |
| `expenses` | Expense with fund, bill, maker/checker |
| `ledger_entries` | Append-only hash-chained journal (`prev_hash`, `hash`, `ref_type`, `ref_no`) |
| `ledger_seals` | Last sealed head hash per tenant |

**Ledger convention:** payments + positive corrections = **debit** (inflow);
expenses + reversals + negative corrections = **credit** (outflow). Donations historically
credit hain. Ledger rows **rewrite nahi** hote (hash chain); calculations source tables se
aate hain.

### 9.4 Approvals & audit

| Table | Purpose |
| --- | --- |
| `approvals` | Single maker-checker queue. `entity_type`: `payment`, `expense`, `waiver`, `member`, `fee_change` (+ `payment_edit` in 0033). `requested_by <> decided_by` check |
| `audit_log` | `actor_id`, `action`, `entity`, `entity_id`, `meta`, `ip` |
| `job_runs` | Cron job history (`nightly`, `maintenance`, etc.) |

### 9.5 Communication

| Table | Purpose |
| --- | --- |
| `notification_queue` | Outbound WhatsApp/SMS/email/push queue with retry/backoff |
| `member_notifications` | In-app member notifications: `kind` (`payment`,`due`,`notice`,`approval`,`info`), `read_at` |
| `notices` | Anjuman notices with audience (`all`,`members`,`office_bearers`) |
| `complaints` | Complaint with tracking code, SLA, status |
| `support_messages` | Sadar/secretary → platform admin messages (also public contact) |
| `registration_requests` | Public anjuman registration + KYC/proof URLs |

### 9.6 Platform & integrations

| Table | Purpose |
| --- | --- |
| `tenant_settings` | Automation toggles, reminder days, `invoice_due_day`, receipt footer, `fee_start_period` |
| `platform_plans` | SaaS plans (price, cycle, max_members, features) |
| `platform_invoices` | Platform subscription invoices |
| `integrations` | Provider config per tenant/platform (payment/SMS/WhatsApp/email/push) |
| `integration_secrets` | Encrypted secrets; **anon/authenticated se revoked**, only RPC/Edge |
| `webhook_events` | Gateway event idempotency (`provider, event_id` unique) |
| `prayer_days` | Prayer timetable per date |

### 9.7 Storage buckets

| Bucket | Visibility | Contents |
| --- | --- | --- |
| `avatars` | public | profile photos + `qr/<tenant-id>/…` payment QR images |
| `registration-docs` | private | Sadar/Khajanchi KYC + anjuman proof; super admin signed URL se read karta hai |
| bill/expense attachments | private (per migration) | expense bills |

---

## 10. Database functions (RPCs)

**All money writes must go through these.** SECURITY DEFINER hone ki wajah se ye
`is_trusted_context()` ke andar guarded tables update kar sakte hain.

### 10.1 Identity & tenancy

| Function | Purpose |
| --- | --- |
| `current_tenant_id()` | JWT/profile se tenant; suspended tenant par `NULL` |
| `current_role()`, `current_profile()` | Role/profile helpers |
| `is_super_admin()`, `is_office_bearer()`, `is_trusted_context()`, `is_service_role()` | guards |
| `my_tenant_status()` | suspension gate ke liye |
| `login_block_reason()` | suspended/inactive reason |
| `jwt_role()`, `jwt_aal()`, `mfa_ok()` | auth claim helpers |
| `list_all_accounts()`, `set_account_role()`, `set_account_active()` | super admin global control |
| `update_my_profile()` | safe self profile edit |
| `save_payment_settings(...)` | scoped QR/bank/UPI save for sadar/secretary/khajanchi (0037) |

### 10.2 Members & fees

| Function | Purpose |
| --- | --- |
| `assign_member_code()` | serial + check digit |
| `set_member_prefix()`, `set_fee_cycle()` | tenant settings |
| `update_member_details()` | guarded member edit |
| `remove_member()` | hard delete only if no financial history, else archive |
| `restore_member()` | archived member ko wapas active (Sadar / platform admin) |
| `request_member_pause()` | pause request → approval (Sadar/Khajanchi cross) |
| `request_member_resume()` | resume request → approval |
| `request_member_archive()` | archive request → approval |
| `request_member_delete()` | delete request → approval (fails if finance history) |
| `apply_member_pause()` | approve pause → status=paused |
| `apply_member_resume()` | approve resume → status=active |
| `apply_member_archive()` | approve archive → status=inactive |
| `apply_member_delete()` | approve delete → row delete |
| `generate_member_dues(member, from, to)` | backdated range, never before `joined_on` |
| `generate_dues_range(...)` | member onboarding date-range total |
| `generate_monthly_invoices(...)` | idempotent monthly run |
| `request_fee_change()`, `approve_fee_override()` | fee maker-checker |
| `request_waiver()` | invoice waiver approval |
| `sync_invoice_status()` | recompute invoice from allocations |
| `invoices_apply_advance()` | auto-apply advance to new invoices |

### 10.3 Payments

| Function | Purpose |
| --- | --- |
| `next_receipt_no()` | `R-YYYY-NNNNN` |
| `next_donation_receipt_no()` | donation receipt |
| `apply_verified_payment()` | allocations + invoice status + ledger + funds |
| `verify_payment(id)` | maker-checker verify; dual approval returns literal `'PENDING-SECOND-APPROVAL'` |
| `verify_payment_auto(...)` | gateway path, never if human entered |
| `reject_payment()`, `reverse_payment()` | rejection / reversal |
| `request_payment_edit()`, `apply_payment_edit()` | correction (0033) |
| `submit_advance_payment()` | member advance (dual approval) |
| `apply_member_advance()` | apply advance to dues |
| `request_payment_reset()`, `apply_member_payment_reset()` | Sadar request → Khajanchi approval; never deletes silently |
| `payments_fund_sync()`, `payments_clear_advance()` | fund/advance consistency |

### 10.4 Donations & expenses

| Function | Purpose |
| --- | --- |
| `create_donation()` | insert + receipt |
| `verify_donation()`, `verify_donation_auto()` | maker-checker |
| `reject_donation()` | rejection |
| `approve_expense()`, `reject_expense()` | expense maker-checker |
| `guard_donation_insert/update()`, `guard_expense_insert/update()`, `guard_payment_insert/update()` | DB-level field guards |

### 10.5 Approvals, ledger, audit

| Function | Purpose |
| --- | --- |
| `decide_approval()` | **one** decision point for queue; delegates to correct money RPC |
| `ledger_hash()`, `ledger_append()`, `ledger_seal()`, `verify_ledger()` | hash chain |
| `audit_row()` | trigger audit logger; `tenant_id`/`id` ko `to_jsonb` se defensively read karta hai |
| `guard_*` functions | status/role/field guards |

### 10.6 Automation & messaging

| Function | Purpose |
| --- | --- |
| `run_daily_maintenance()` | expiry, invoices, reminders, notices, requeue, ledger verify |
| `expire_tenants()`, `generate_monthly_invoices()`, `queue_reminders()`, `publish_due_notices()` | nightly pieces |
| `queue_notice_broadcast()`, `broadcast_notice()` | notice fan-out |
| `queue_payment_receipt()` | receipt message |
| `claim_notifications()`, `requeue_notifications()`, `cancel_notification()`, `run_requeue()` | queue workers |
| `notify_member()`, `notify_payment_change()`, `notify_invoice_change()`, `notify_notice_change()` | in-app notifications |
| `mark_notification_read()`, `mark_all_notifications_read()` | read state |
| `digest()`, `pick_channel()`, `keepalive()` | helpers |

### 10.7 Complaints, support, registration

| Function | Purpose |
| --- | --- |
| `assign_complaint_code()`, `guard_complaint_update()` | complaint workflow |
| `send_support_message()`, `send_public_support_message()` | support inbox |
| `submit_registration_request(jsonb)` | public insert (validates name/address/sadar + 10-digit phone) |
| `list_registration_requests()` | super admin only |
| `decide_registration_request(id, status, note)` | approve/reject |
| `ensure_tenant_settings()` | auto-create settings on tenant insert |

---

## 11. Migrations 0001 → 0037

Migrations **ordered** hain aur live DB par already applied hain. Naya change **naya file**
`0038_...sql` banakar add karein; purani file edit na karein (live DB me already applied
hai).

| # | File | What it added / fixed |
| --- | --- | --- |
| 0001 | `schema.sql` | enums, core tables, updated_at triggers |
| 0002 | `rls.sql` | RLS policies + tenant isolation helpers |
| 0003 | `functions.sql` | member code, receipt no, ledger hash chain, maker-checker basics |
| 0004 | `automation.sql` | `tenant_settings`, `notification_queue`, `job_runs`, monthly invoices, reminders |
| 0005 | `workflows.sql` | unified approval workflow (`decide_approval`) |
| 0006 | `expense_reject.sql` | expense rejection flow |
| 0007 | `fee_change.sql` | fee change approval |
| 0008 | `complaint_workflow.sql` | complaint code generator + update guard |
| 0009 | `prayer_location.sql` | tenant location for prayer calculation |
| 0010 | `donations.sql` | donations + receipt |
| 0011 | `security_hardening.sql` | `integration_secrets`, guards, MFA helpers |
| 0012 | `platform_plans.sql` | SaaS plans |
| 0013 | `platform_invoices.sql` | platform billing |
| 0014 | `audit_coverage.sql` | audit triggers on more tables |
| 0015 | `tenant_status_enforcement.sql` | `active`/`trial`/`read_only`/`suspended` enforcement |
| 0016 | `restricted_fund_enforcement.sql` | zakat/sadqa ring-fencing |
| 0017 | `team_invite.sql` | invitations |
| 0018 | `daily_schedule.sql` | scheduled notification/digest support |
| 0019 | `pgcrypto_fix.sql` | extension/search_path fix |
| 0020 | `profile_edit.sql` | safe self profile edit + avatar |
| 0021 | `mandatory_mfa.sql` | aal2 for money decisions (later relaxed) |
| 0022 | `email_login_verification.sql` | email OTP on new device replaces hard TOTP gate |
| 0023 | `fee_cycle.sql` | `fee_start_period` + `invoice_due_day` |
| 0024 | `advance_and_backdated.sql` | member advance + backdated dues |
| 0025 | `separate_funds.sql` | ZAKAT / SADQA / GIFT funds |
| 0026 | `global_accounts.sql` | super admin all-accounts control |
| 0027 | `remove_member.sql` | safe member removal (archive if history) |
| 0028 | `tenant_profile_fix.sql` | tenant profile save fix |
| 0029 | `payment_reset.sql` | Sadar request → Khajanchi approval reset |
| 0030 | `outstanding_active_only.sql` | outstanding sirf active members ka |
| 0031 | `suspend_login_gate.sql` | suspended tenant login gate + `my_tenant_status()` |
| 0032 | `login_reason_support.sql` | `login_block_reason()` + support messages |
| 0033 | `notifications_payment_edit.sql` | `member_notifications`, triggers, payment edit flow |
| 0034 | `calculation_integrity.sql` | advance auto-apply, GEN fund sync, exact fund recompute, settled-date reporting |
| 0035 | `consistency_fixes.sql` | overdue/outstanding/report/ledger/dashboard consistency |
| 0036 | `qr_bank_registration.sql` | tenant QR/bank fields, `registration_requests`, RPCs, private bucket |
| 0037 | `payment_settings_rpc.sql` | scoped `save_payment_settings` |
| 0038 | `fix_dashboard_settled_at.sql` | `dashboard_snapshot` now uses `verified_at`; fixes `column "settled_at" does not exist` |
| 0039 | `restore_member.sql` | Sadar can restore an archived member back to active |
| 0040 | `member_pause_resume.sql` | Member pause/resume/archive/delete with dual approval (maker-checker) |
| 0041 | `import_raziya_manzil.sql` | One-off import of the old PHP app data for RMHC (37 members, receipts, dues, expenses, gifts) |
| 0042 | `rebuild_raziya_monthly.sql` | Rebuilds 12 months of dues (Dec 2025–Nov 2026) for every imported member; net due ₹23,000 |
| 0043 | `reclassify_raziya_gifts.sql` | Moves the 2 imported gifts (₹1,500) from General Fund to GIFT fund |

### Migration rules

1. **Never edit applied migrations.** Add a new numbered file.
2. Every migration idempotent ho: `if not exists`, `create or replace`, `drop policy if exists`.
3. Money math change karein to `0034`/`0035` ke comments padhein aur tests update karein.
4. RPC signature badlein to `repo.ts` + TypeScript types + callers update karein.
5. `revoke all` / `grant execute` properly likhein — public execute na chhodein.

---

## 12. Edge Functions

| Function | Trigger | Job |
| --- | --- | --- |
| `nightly` | 02:00 IST (cron) | expiry/grace, monthly invoices, reminders, notice fan-out, requeue, ledger verification. Idempotent |
| `send-queue` | every 5 min | drains `notification_queue`, renders template, sends via tenant provider, retries with backoff |
| `payment-webhook` | gateway POST | verifies signature, idempotent via `webhook_events`, auto-verifies only if no human entered, amount mismatch flagged |
| `admin-test` | panel button | harmless provider read-only test; secret never returned |
| `admin-create-user` | panel | creates login with service role **after** checking caller is sadar/secretary of same tenant or platform admin |

Shared helpers: `supabase/functions/_shared/` — `crypto.ts`, `db.ts`, `env.ts`, `http.ts`,
`providers.ts`. No npm deps (fast cold start).

---

## 13. Auth, session & security flow

### Login (live)

```
email + password
  → supabase.auth.signInWithPassword
  → loadSessionUser(uid)
      → profiles row (role, tenant, is_active)
      → my_tenant_status()
          suspended → throw exact message → signOut
      → read_only → allow read, DB guards block writes
  → new device? (localStorage anjuman.device.<uid> != "1")
      → role in MFA_ROLES → signInWithOtp(email)
      → user enters 6-digit code → verifyOtp
      → mark device trusted
  → optional TOTP if user enrolled a factor
  → AppShell
```

### Forgot password

`resetPasswordForEmail` → user email link/code → `verifyOtp` → set new password.
Custom SMTP: Hostinger `smtp.hostinger.com:465`, sender `noreply@bis24.in`,
template `{{ .Token }}`, 6 digits, 600s expiry.

### RLS scope — important nuance

`0002_rls.sql` ki generic policies **tenant-level** hain (`tenant_id = current_tenant_id()`),
har table par role-level nahi. Iska matlab:

- Cross-tenant access **poori tarah band** hai.
- Sensitive money fields guard triggers se lock hain (`guard_payment_*`,
  `guard_expense_*`, `guard_invoice_*`, `guard_member_write`).
- Lekin kuch tables par authenticated tenant user direct PostgREST insert kar sakta hai
  (e.g. pending payment/expense/invoice). Guard unhe `pending`/unpaid bana deta hai, isliye
  paisa approve nahi ho sakta — phir bhi nuisance rows ban sakti hain.
- **Agar harden karna ho** to naya migration me generic insert/update policies par
  `public.is_office_bearer()` add karein, aur member-specific tables ke liye alag policy
  rakhein. Isse pehle UI/flow test karein (member advance submission etc.).

### Security layers

| Layer | What it stops |
| --- | --- |
| Supabase Auth | invalid password/session |
| `profiles.is_active` | deactivated staff |
| `my_tenant_status()` | suspended tenant |
| RLS `tenant_id = current_tenant_id()` | cross-tenant reads/writes |
| Role checks inside RPC | privilege escalation |
| Maker-checker (`entered_by <> verified_by`) | self-approval |
| Hash chain | silent ledger edits |
| Audit triggers | untraceable changes |
| Scoped `save_payment_settings` RPC | khajanchi tenant-row RLS failure |

### Suspension

- DB: `current_tenant_id()` returns `NULL` for suspended tenant → zero rows visible.
- App: `loadSessionUser` throws exact message → login screen.
- Super Admin can **Reactivate** from `/platform/tenants/`; data intact rehta hai.
- Message must remain exactly:
  `Aapka Account Suspend kar diya gaya hai. Admin se contact karen.`

---

## 14. Roles & navigation matrix

`src/lib/nav.ts` se auto-generated. ✅ = visible.

| Page | super | sadar | khajanchi | secretary | auditor | collector | member |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Notifications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Approvals | — | ✅ | ✅ | — | ✅ | — | — |
| Members | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Households | — | ✅ | ✅ | ✅ | ✅ | — | — |
| ID Cards | ✅ | ✅ | — | ✅ | — | — | own |
| Namaz & Azan | — | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Notices | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Complaints | — | ✅ | ✅ | ✅ | ✅ | — | ✅ |
| Fee Plans | — | ✅ | — | ✅ | ✅ | — | — |
| Collections | — | ✅ | ✅ | — | ✅ | ✅ | — |
| Donations | — | ✅ | ✅ | — | ✅ | — | — |
| Expenses | — | ✅ | ✅ | — | ✅ | — | — |
| Ledger | — | ✅ | ✅ | — | ✅ | — | — |
| Reports | — | ✅ | ✅ | ✅ | ✅ | — | — |
| Contact Admin | — | ✅ | — | ✅ | — | — | — |
| My Profile | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Anjuman Profile | — | ✅ | — | ✅ | — | — | — |
| Payments settings | — | ✅ | ✅ | — | — | — | — |
| Alert Channels | — | ✅ | — | ✅ | — | — | — |
| Roles & Access | — | ✅ | — | ✅ | — | — | — |
| Platform pages | ✅ | — | — | — | — | — | — |

> **Note:** `collector` ko collections dikhte hain lekin approve nahi kar sakta.
> `auditor` oversight role hai — `verify_payment`, `verify_donation` aur
> `approve_expense` DB me allowed hain (lekin apni entry nahi). `secretary` ko approvals
> queue nav me nahi dikhti; payment edit request ke case me woh approver ban sakta hai.

---

## 15. Core workflows

### 15.1 Payment collection & verification (maker–checker)

1. **Collector / Sadar / Khajanchi** `/finance/collections/` par payment record karta hai
   (auditor bhi page dekh sakta hai aur verify kar sakta hai, par apni entry nahi).
   - `createPayment` → `payments` row `status='pending'`, `entered_by = current user`.
   - Receipt number **verify hone ke baad** milta hai (`next_receipt_no`).
2. Queue me approver ko dikhta hai.
3. Approver **doosra role** hona chahiye:
   - `verify_payment(id)` RPC role + tenant + `entered_by <> verified_by` check karta hai.
   - Dual-approval case me literal `'PENDING-SECOND-APPROVAL'` return hota hai.
4. Verify par:
   - `apply_verified_payment()` allocations banata hai, invoice status sync karta hai,
     ledger entry append karta hai, fund balance update karta hai.
   - `settled_at` / `verified_at` set hota hai (reporting isi date se hoti hai).
   - Receipt number assign hota hai.
   - Member ko notification + receipt queue.
5. Reject → `status='rejected'`, reason note, no ledger impact.
6. Reversal → `reverse_payment()` credit reversal ledger me, balance wapas.

**Golden rule:** verified payment amount = `sum(allocations) + unallocated_paise` (advance).

### 15.2 Donation (Zakat / Sadqa / Gift)

1. `/finance/donations/` par donation record karein (fund select).
2. `create_donation()` receipt no deta hai; `status='pending'`.
3. Doosra role (`sadar` / `khajanchi` / `auditor`) `verify_donation()` karta hai.
4. Verify par fund balance + ledger credit + receipt.
5. Zakat, Sadqa, Gift **alag funds** hain — ek me daala paisa doosre me mix nahi hota.
6. Restricted fund se expense `0016` guard block karta hai.

### 15.3 Expense

1. `/finance/expenses/` par expense (fund, category, vendor, bill).
2. `status='pending'`; bill attach karein (bina bill auditor ke liye flag).
3. `sadar` ya `auditor` `approve_expense()` karta hai (maker apni expense approve nahi kar sakta).
4. Approve par fund balance debit + ledger credit + audit.
5. Reject → `reject_expense()` reason ke saath.

### 15.4 Fee cycle, invoices, dues

- **Sadar** `/finance/fees/` par:
  - `fee_start_period` (`YYYY-MM`) — chanda kab se count hoga.
  - `invoice_due_day` (1–28) — har month ki due date.
  - Auto-generate invoices, auto-reminders.
- `generate_monthly_invoices()` idempotent hai; `AppShell` bhi office user ke login par
  current month self-heal karta hai (one attempt per browser per month).
- **Backdated dues:** `generate_member_dues(member, from, to)` — `joined_on` se pehle
  kabhi invoice nahi banega.
- **Member onboarding:** date range select → per-month dues auto-calculate → total show.
- Override: `fee_overrides` (sadar/secretary request → checker approval).
- Waiver: `request_waiver()` → approval → invoice `waived`.
- Outstanding = **active members only**, advance ke net ke baad (`0030` + `0034`).

### 15.5 Advance payment

- Member (ya office) advance de sakta hai → `submit_advance_payment()`.
- Admin ke alawa sab panels me advance allowed.
- Member-submitted advance `pending` rehta hai jab tak **Sadar AND Khajanchi dono**
  approve na karein (dual approval).
- Verify hone par `payments.unallocated_paise` me jama hota hai.
- Naya invoice banne par `invoices_apply_advance()` automatically apply karta hai.
- Advance ko manually clear karna ho to `payments_clear_advance()`.

### 15.6 Member onboarding

1. `/members/` → Add member.
2. Name, father, phone (10 digit), household, mohalla, type, join date, fee.
3. Optional date range → `generate_dues_range()` purane months ke dues + total.
4. `assign_member_code()` code + check digit deta hai.
5. Agar login chahiye → **Create member login** (`admin-create-user` Edge Function).
6. Member ko welcome notification.

### 15.7 Member removal

- **Sadar** (ya platform admin) remove kar sakta hai.
- `remove_member()` (0027):
  - Agar member ka koi financial history **nahi** hai → hard delete.
  - Agar history hai → **archive + login disable** (data preserve).
- Members page ka default filter **Active** hai, isliye archive hua member list se
  turant hat jata hai. Use dekhne ke liye status filter me **Inactive / archived**
  chunein.
- Archived member **Households**, outstanding, dues ageing aur dashboard ke
  defaulters se bhi nahi ginte — sirf receipts/ledger history me rehta hai.
- `restore_member()` (0039) archived member ko wapas **active** karta hai
  (Sadar / platform admin). Login dobara nahi khulta — uske liye **Create login**
  use karein; `admin-create-user` wahi auth account reuse karta hai.
- Archived member ke liye Collect / Create login / Reset payments buttons chhupe
  rehte hain, kyunki inactive member par naya paisa nahi lena chahiye.
- Payment reset alag process hai aur **Khajanchi approval** mandatory.

### 15.7b Member pause / resume / archive / delete (maker-checker)

**Problem:** Sadar akela member remove kar sakta tha — misuse ka risk. Member resign kare to uska history delete ho jaata tha (nuksan).

**Solution (0040):** Ab **har membership change ke liye dual approval** zaroori hai:

| Action | Status change | Dues | Approver (cross) |
|--------|---------------|------|------------------|
| **Pause** | active → `paused` | Auto due **band** | Sadar/Secretary request → **Khajanchi** approve  <br/>Khajanchi request → **Sadar/Secretary** approve |
| **Resume** | paused → `active` | Auto due **wapas chalu** | Same cross-approval |
| **Archive** | active/paused → `inactive` | Due band, history safe, login band | Same cross-approval |
| **Delete** | active/paused → row delete | Sirf agar **koi financial history na ho** | Same cross-approval |

**Key security rules:**
- **Khud ki request khud approve nahi hoti** (maker ≠ checker)
- Sadar/Secretary ↔ Khajanchi **cross-approval** mandatory
- Super admin bypass kar sakta hai
- `paused` member auto invoice generation se excluded (0004, 0024, 0035 already filter `m.status = 'active'`)
- `paused` member outstanding/dues reports se excluded (0030, 0038 already filter active)
- **History kabhi delete nahi hoti** — archive/delete sirf status change ya row removal hai; receipts, payments, ledger, audit trail intact rehte hain

**UI:** Member drawer me `Pause membership`, `Resume membership`, `Remove member` (archive/delete radio) buttons hain. Har action ke liye reason mandatory hai. Pending approval badge dikhta hai jab request bheji gayi ho.

**RPCs:**
- `request_member_pause(member, reason)` → approval create
- `request_member_resume(member, reason)` → approval create
- `request_member_archive(member, reason)` → approval create
- `request_member_delete(member, reason)` → approval create (fails fast agar finance history hai)
- `decide_approval(id, approve, note)` → calls `apply_member_pause/resume/archive/delete`

### 15.8 Payment correction & reset

**Correction (`payment_edit`):**

1. Member drawer → Edit payment → `request_payment_edit()`.
2. `approvals.entity_type='payment_edit'`.
3. Approver requester role se decide hota hai:
   - Khajanchi ne request kiya → Sadar/Secretary approve kare.
   - Sadar/Secretary ne kiya → Khajanchi approve kare.
4. `apply_payment_edit()` amount/allocations/ledger adjust karta hai.

**Reset (Sadar → Khajanchi):**

1. Sadar `request_payment_reset()`.
2. Khajanchi approve karta hai.
3. `apply_member_payment_reset()`:
   - payments `rejected`
   - allocations clear
   - invoices unpaid
   - matching **credit reversal** ledger me
4. Kuch silently delete nahi hota; sab audit trail me.

### 15.8b Raziya Manzil old-app data import (one-off, 0041)

Source: `u409071687_raziya_manzil.sql` (old PHP app). Target tenant: code `RMHC`.

- **37 members** imported (`notes='old-app:user:<id>'`), fee ₹100/month.
- **217 verified receipts** (₹25,100) with `OLD-<id>` receipt numbers.
- **0042 rebuilds the full hisab from 3 Dec 2025**: 37 members × 12 months
  (Dec 2025–Nov 2026) × ₹100 + ₹100 joining = **₹48,100 billed**.
- **Net outstanding ₹23,000** (gross open ₹23,200 − ₹200 Dec 2026 advance).
- Old app's ₹1,600 "due" was stale April auto-dues; 0042 replaces it.
- **3 expenses ₹2,477** + **2 gifts ₹1,500** (verified donations) imported.
  0043 moves the gifts to the dedicated `GIFT` fund, so the "Gift amount"
  card shows ₹1,500 (earlier it showed ₹0 while "All donations" showed ₹1,500).
- Fund balance after import: **₹24,123** (25,100 + 1,500 − 2,477) —
  General Fund ₹22,623 + Gift Fund ₹1,500.
- Ledger hash chain verified intact (`verify_ledger` → null).
- Old passwords are **not** imported (bcrypt not compatible with Supabase Auth);
  members need a fresh login.
- Idempotent: re-running 0041/0042 does not duplicate rows; 0042 rebuilds
  allocations from scratch.
- Orphan old user #38 had a ₹100 due but no member row → excluded.

**Dashboard card meanings (important):**
- **Total collection ₹25,100** = 217 all-time verified receipts.
- **Total outstanding ₹23,200** = invoice-based dues (Dec 2025–Nov 2026).
  Two members prepaid Dec 2026 (₹200), so the UI nets the advance credit and
  shows **₹23,000** — the two numbers differ by that ₹200 credit.
- **Collected this month ₹0** = no cash *received* in Nov 2026. The 2 Nov dues
  were prepaid on 3 Feb 2026, so they belong to February's collection.
- **Gift amount ₹1,500** after 0043; before that the gifts were in General Fund.
- **Dec 2026 onwards:** the daily maintenance job (02:00 IST, plus the GitHub
  fallback) calls `generate_monthly_invoices` for the current month. Every
  active member gets a ₹100 invoice (due on the 10th). Paused/archived members
  are skipped, and the `invoices_apply_advance` trigger automatically uses any
  advance already received. Re-runs are idempotent.

### 15.9 Approvals engine

- Ek hi queue: `/approvals/`.
- `decide_approval(id, decision, note)` sab kuch handle karta hai.
- `entity_type`: `payment`, `expense`, `waiver`, `member`, `fee_change`, `payment_edit`, `payment_reset`, `member_pause`, `member_resume`, `member_archive`, `member_delete`.
- `guard_approval_insert/update` self-decision block karte hain.
- UI me button hide karna kaafi nahi — DB dobara check karta hai.

### 15.10 Public anjuman registration

1. `/login/` → **Anjuman registration request** card.
2. Form: registered?, reg no (optional), anjuman name, address, district/state/pincode,
   total members, Sadar (name, 10-digit mobile, email, KYC), Khajanchi (same),
   anjuman proof (rasheed/letterhead), note.
3. Files → private bucket `registration-docs` via `uploadRegistrationDoc()`.
4. `submitRegistrationRequest()` → `submit_registration_request(jsonb)` RPC (anon allowed).
5. Success screen me reference ID.
6. Super Admin `/platform/registrations/`:
   - pending/approved counters
   - detail drawer + signed KYC/proof links
   - approve/reject + note (`decide_registration_request`)
7. **Approve karne se tenant account automatically nahi banta.** Super Admin
   `/platform/tenants/` se manually tenant + sadar/khajanchi logins banata hai.

### 15.11 Suspension

- Super Admin `/platform/tenants/` → Suspend.
- `tenants.status='suspended'`.
- `current_tenant_id()` → `NULL`; RLS zero rows.
- Login par exact message; existing session restore bhi fail hota hai.
- Reactivate → status `active`; data wapas.

### 15.12 Notifications

- **In-app:** `member_notifications` + `/notifications/`.
- **Outbound:** `notification_queue` → `send-queue` Edge Function → provider.
- Triggers:
  - payment insert/verify/reject → `notify_payment_change`
  - invoice insert/status change → `notify_invoice_change`
  - notice publish → `notify_notice_change`
- `notify_member(member_id, kind, title, body, meta)` manual bhi call kar sakte hain.
- Member sirf apni notifications dekhta hai (RLS).
- Read state: `mark_notification_read`, `mark_all_notifications_read`.

### 15.13 Complaints

- Member/office `/complaints/` par complaint raise karta hai (anonymous option).
- `assign_complaint_code()` tracking code deta hai.
- Status: `open → assigned → in_progress → resolved → closed`.
- `guard_complaint_update()` sirf authorized update allow karta hai.
- SLA hours default 72; high priority flag.

### 15.14 Notices

- `/notices/` → create (title, body, audience, pinned, expiry).
- `broadcast_notice()` → app + WhatsApp/SMS queue.
- Audience: `all`, `members`, `office_bearers`.
- Member ko notification bhi jata hai.

### 15.15 Namaz & Azan

- `/namaz/` — monthly timetable.
- Calculation `src/lib/prayer.ts` (method + tenant lat/lng).
- Manual override per day; `prayer_days.source` = `calculated` | `manual` | `excel`.
- `savePrayerDay(s)` upsert.

### 15.16 ID cards, print & share

- `/id-cards/`:
  - Sadar/Secretary/Super Admin: all members, bulk selection, 8-per-A4 pagination.
  - Member: **sirf apna** card.
- Card me: photo, name, code, father, mohalla, blood group, tenant, QR.
- QR → `/verify/?id=<code>` public page; sirf non-sensitive fields.
- Print: `printArea()` clones `.print-area` into `#print-root`; CSS `body.print-mode`
  baaki sab hide karta hai. **Sirf printable area print hota hai.**
- PNG: `downloadNodePng()` (html-to-image).
- WhatsApp: `shareNodeOnWhatsApp()` — Web Share API, fallback download.
- Bill/receipt bhi download + WhatsApp share.

### 15.17 Reports & exports

`/finance/reports/`:
- Date range + all-time.
- Cards: balance, collection, expenses, gift, sadqa, zakat, qarz, more.
- Clickable detail.
- **Excel:** `downloadCsv()`.
- **PDF:** `downloadPdfTable()` — real table, screenshot nahi.
- Month-wise reporting `settled_at` / `verified_at` / `approved_at` use karti hai,
  `created_at` nahi.
- Member-wise paid/pending/since details (admin ke alawa panels me).

### 15.18 Profile

`/profile/`:
- Photo upload (`avatars` bucket, `uploadAvatar`).
- Name, mobile (10-digit `PhoneInput`), email display.
- Login email change → platform admin se (security).
- Optional TOTP enrollment; mandatory nahi (email OTP already on new device).
- `saveMyProfile` → `update_my_profile()` RPC; `updateLocalUser` shell refresh.

---

## 16. Financial invariants — NEVER break these

Ye rules toot gaye to paisa galat dikhega. Koi bhi finance change karne se pehle ye padhein.

### 16.1 Invoice truth

```
invoice.paid_paise == sum(payment_allocations.amount_paise for that invoice)
invoice.status    == paid if paid_paise == amount_paise
                     partial if 0 < paid_paise < amount_paise
                     pending if paid_paise == 0
```

`invoices.paid_paise` cache hai; **source of truth allocations hain**.
`sync_invoice_status()` recompute karta hai.

### 16.2 Payment truth

```
verified payment amount == sum(allocations) + payments.unallocated_paise
```

`unallocated_paise` = member advance. Ise ignore karna = overpaid/underpaid bugs.

### 16.3 Cash balance

```
cash balance = verified payments
             + verified donations
             - approved expenses
```

Sirf **verified/approved** count karein. Pending/rejected kabhi nahi.

### 16.4 Fund balances

Fund balance **source documents se recompute** hota hai, `funds.balance_paise` par
blind trust nahi. `0034` ne GEN sync + exact recompute add kiya.

```
ZAKAT fund  = verified zakat donations  - approved zakat expenses
SADQA fund  = verified sadqa donations  - approved sadqa expenses
GIFT fund   = verified gift donations   - approved gift expenses
GEN fund    = general collections + general donations - general expenses
```

Fund balance **negative nahi** hona chahiye (`negative_funds=0` audit).

### 16.5 Outstanding

```
outstanding = active members ke unpaid invoice amounts
              - unallocated advance
```

- Inactive members count nahi (`0030`).
- Advance net off hota hai (`0034`).
- `joined_on` se pehle ka due kabhi nahi.

### 16.6 No duplicates / no missing

- `invoices` unique `(tenant_id, member_id, period)`.
- `payments.receipt_no` unique per tenant.
- `apply_verified_payment()` idempotent hona chahiye — same payment dobara verify na ho.
- `generate_monthly_invoices()` idempotent.
- Gateway events `webhook_events(provider, event_id)` unique.

### 16.7 Dates for reporting

| Report | Date column |
| --- | --- |
| Collections | `settled_at` (fallback `verified_at`) |
| Expenses | `approved_at` |
| Donations | `verified_at` |
| Invoices | `period` / `due_date` |

`created_at` sirf audit ke liye. Isse month-wise report galat ho jati hai.

### 16.8 Ledger

- Append-only; hash chain (`prev_hash` + payload → `hash`).
- Edit/delete mat karein. Correction = naya reversal entry.
- `verify_ledger()` chain check karta hai.
- `ledger_seals` last head store karta hai.

### 16.9 Maker–checker

- `entered_by <> verified_by` (payments).
- `approved_by <> entered_by` (expenses).
- `requested_by <> decided_by` (approvals).
- **Super Admin bhi apna kaam khud approve nahi kar sakta.**

### 16.10 Audit queries (live expected all zero)

```sql
-- invoice mismatch
select count(*) from invoices i
where i.paid_paise <> coalesce((
  select sum(a.amount_paise) from payment_allocations a
  join payments p on p.id = a.payment_id
  where a.invoice_id = i.id and p.status = 'verified'
), 0);

-- advance mismatch
select count(*) from payments p
where p.status = 'verified'
  and p.amount_paise <> coalesce((
    select sum(a.amount_paise) from payment_allocations a
    where a.payment_id = p.id
  ), 0) + coalesce(p.unallocated_paise, 0);

-- duplicate invoices
select count(*) from (
  select tenant_id, member_id, period
  from invoices group by 1,2,3 having count(*) > 1
) d;

-- negative funds
select count(*) from funds where balance_paise < 0;
```

---

## 17. Printing, PDF & WhatsApp share

| Need | Function | File |
| --- | --- | --- |
| Print only card/receipt | `printArea()` | `src/lib/utils.ts` |
| Print CSS isolation | `.print-area`, `body.print-mode`, `#print-root` | `src/app/globals.css` |
| Receipt 58mm/80mm | `ReceiptDrawer` | `src/components/receipt.tsx` |
| ID card PNG | `downloadNodePng()` | `src/lib/utils.ts` |
| WhatsApp share | `shareNodeOnWhatsApp()` | `src/lib/utils.ts` |
| CSV / Excel | `downloadCsv()` | `src/lib/export.ts` |
| Table PDF | `downloadPdfTable()` | `src/lib/export.ts` |
| Bulk ID cards | 8 per A4, `.id-sheet` | `src/app/(app)/id-cards/page.tsx` |

**Rules:**
- Print se pehle `ensurePrintRoot()` call hota hai.
- `@media print` ke bahar bhi `body.print-mode` rules hain, isliye browser print
  emulation ignore kare to bhi kaam karta hai.
- Member portal me sirf **apna** ID card dikhta hai — `id-cards/page.tsx` `isMember` hone
  par `myMember` filter karta hai. **Note:** `members` table ki RLS tenant-level hai, isliye
  direct API se doosre members read ho sakte hain. Hard privacy chahiye to member-self
  policy add karein (dekhein §13 / §25).
- Har panel me purane payment slips/receipts kisi bhi month ke re-download ho sakte hain.

---

## 18. Deployment, CI/CD & operations

### Deploy (manual)

```powershell
npm.cmd run build      # prebuild writes public/version.json
npm.cmd run deploy     # wrangler pages deploy out --project-name=anjuman --branch=main
```

### Deploy (automatic)

`.github/workflows/deploy.yml` on push to `main`:
1. `npm ci`
2. `npm run typecheck`
3. `npm run test:sql`
4. `npm run build`
5. Cloudflare Pages deploy

### Version watcher

- `scripts/write-version.mjs` build stamp `public/version.json` me likhta hai.
- `AppShell` → `VersionWatcher` har 60s me `/version.json` fetch karta hai.
- Stamp badla → tab ek baar reload (max once/minute).
- `_headers` me `version.json` `no-store` hai — cache issue na ho.

### Backups

- `.github/workflows/backup.yml` daily 02:30 IST.
- `pg_dump | gzip | gpg --symmetric` → GitHub Release `backup-archive`.
- Filename: `anjuman-YYYYMMDD-HHMM.sql.gz.gpg` (IST).
- Koi retention limit nahi; har file apni date carry karti hai.
- Secrets: `SUPABASE_DB_URL`, `BACKUP_PASSPHRASE`.
- Restore runbook: `BACKUP.md`.

### Keepalive

`.github/workflows/keepalive.yml` daily Supabase `keepalive()` call — free DB pause na ho.

### Maintenance

`.github/workflows/maintenance.yml` daily 01:15 IST SQL maintenance
(`run_daily_maintenance()`), backup se pehle.

### Applying a migration live

- **Preferred (no local setup):** GitHub → Actions → **Apply SQL migration** → Run workflow →
  migration file path. `.github/workflows/migrate.yml` `SUPABASE_DB_URL` secret se pooler
  connection banata hai aur `psql -v ON_ERROR_STOP=1 -f <file>` chalata hai.
  Migration file push karne par bhi automatically chalta hai.
- **Dashboard:** Supabase → SQL Editor → paste migration → run.
- **CLI:** `supabase db push` (linked project; login/token chahiye).
- **Management API:** `POST /v1/projects/<ref>/database/query` with a PAT — pichhla PAT
  invalid ho chuka hai, isliye ab `migrate.yml` preferred hai.
- Local `psql` install nahi hai. Direct host IPv6-only hai; GitHub runner pooler use karta hai.

---

## 19. Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` + Cloudflare build env | Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `.env.local` + Cloudflare build env | public anon key |
| `NEXT_PUBLIC_APP_URL` | `.env.local` | QR/verify links (default `https://anjuman.pages.dev`) |
| `NEXT_PUBLIC_DEMO_MODE` | `.env.local` | `true` = mock data; production me `false`/absent |
| `SUPABASE_DB_URL` | GitHub secret | backup + `migrate.yml` workflows |
| `BACKUP_PASSPHRASE` | GitHub secret | backup encryption |

**Never** in frontend: `service_role`, SMTP password, gateway secret, `BACKUP_PASSPHRASE`.

---

## 20. Demo mode & test data

- Demo mode active jab Supabase keys missing **ya** `NEXT_PUBLIC_DEMO_MODE=true`.
- Login screen role picker (no password).
- `mock.ts` data; sab kuch local, kuch save nahi hota.
- Demo mode me `AppShell` real RPCs skip karta hai.
- Production me demo mode **off** hona chahiye.

### Live test data (current)

- 3 members: Safa Hasan (`BHR-000001-1`, inactive), Tanjim Ansari (`BHR-000002-2`,
  active), Saddam Ansari (`BHR-000003-3`, active).
- Outstanding active-only ₹1200.
- Ek rejected/reset ₹500 payment, receipt `R-2026-01000`.
- Test tenant `RMHC` suspended.

---

## 21. Troubleshooting: symptom → file → fix

| Symptom | Likely file | What to check / fix |
| --- | --- | --- |
| Login ke baad blank / logout ho jata hai | `src/lib/auth.tsx`, `src/lib/session.ts` | `loadSessionUser` error, `profiles.is_active`, tenant status |
| Suspended account login ho raha hai | `0031_suspend_login_gate.sql`, `session.ts` | `my_tenant_status()`, `current_tenant_id()` NULL, exact message |
| "Aapka Account Suspend..." message nahi dikh raha | `auth.tsx` (sessionStorage `anjuman.auth.error`), `login/page.tsx` | message set/read ho raha hai? |
| Cross-tenant data dikh raha hai | `0002_rls.sql`, RPC `security definer` | RLS enabled? `tenant_id` filter? `current_tenant_id()` |
| Payment verify nahi ho raha | `0033`/`0034`, `repo.ts verifyPayment`, `collections/page.tsx` | same user ne enter kiya? role? dual approval literal? |
| Verify par `'PENDING-SECOND-APPROVAL'` | `verify_payment()` | ye normal hai — doosre approver ka wait |
| Receipt number nahi ban raha | `next_receipt_no()`, `receipt_sequences` | fiscal year row, permissions |
| Receipt total galat | `apply_verified_payment()`, `payment_allocations` | allocation sum + advance |
| Invoice paid galat | `sync_invoice_status()`, `invoices.paid_paise` | allocations se recompute |
| Dashboard: `column "settled_at" does not exist` | `0038_fix_dashboard_settled_at.sql` | `dashboard_snapshot` me `verified_at` use karein (column ka naam `settled_at` nahi hai) |
| Outstanding galat | `0030`/`0034`, `dashboard`, `reports` | inactive members? advance net? `joined_on`? |
| Fund balance galat / negative | `0034_calculation_integrity.sql`, `funds` | source documents se recompute; restricted fund |
| Zakat/Sadqa/Gift mix ho raha | `0025`, `0016`, donation fund select | fund code sahi? |
| Expense approve nahi ho raha | `approve_expense()`, `guard_expense_update` | maker-checker, role |
| Advance apply nahi ho raha | `invoices_apply_advance()`, `apply_member_advance()` | dual approval complete? |
| Member delete nahi ho raha | `remove_member()` (0027) | financial history? archive hoga; default Active filter me row hat jayegi |
| Payment reset nahi ho raha | `request_payment_reset()` / `apply_member_payment_reset()` | Khajanchi approval chahiye |
| Member pause/resume/archive/delete nahi ho raha | `0040_member_pause_resume.sql`, `decide_approval()` | cross-approval chahiye (Sadar↔Khajanchi); self-approval blocked; `member_status` me `paused` enum hai? |
| Member code duplicate/galat check digit | `assign_member_code()`, `utils.checkDigit` | serial/tenant code |
| Monthly dues nahi ban rahe | `generate_monthly_invoices()`, `AppShell` self-heal, nightly | `fee_start_period`, idempotency |
| Backdated dues `joined_on` se pehle ban rahe | `generate_member_dues()` (0024) | from date clamp |
| Due date galat | `tenant_settings.invoice_due_day` (1–28), `set_fee_cycle()` | range check |
| Fee override apply nahi | `request_fee_change()`, `approve_fee_override()` | approval pending? |
| Notification nahi aa rahi | `0033` triggers, `notify_member()`, `member_notifications` RLS | trigger exists? member_id mapping? |
| WhatsApp/SMS nahi ja raha | `notification_queue`, `send-queue`, `settings/notifications` | provider keys, `enabled`, retry/backoff |
| Email OTP nahi aa raha | Supabase SMTP settings, `auth.tsx` | Hostinger SMTP 465, sender, template `{{ .Token }}`, 600s |
| OTP verify fail | `auth.tsx verifyEmailOtp` | code expiry, same email, session |
| TOTP bar-bar maang raha | `MFA_ROLES`, `checkMfa` | factor verified? aal2? |
| Payment QR upload fail | `uploadPaymentQr()`, storage `avatars/qr/...`, `0036` policies | tenant id, file type, policy |
| QR save nahi ho raha | `save_payment_settings()` (0037), `settings/payments` | RPC grant, role |
| Bank details save nahi | `0036` columns, `savePaymentSettings` | type mapping in `toTenant` |
| Registration form submit nahi | `0036 submit_registration_request`, `registration-request-form.tsx` | 10-digit phone, required fields |
| Registration doc link nahi khul raha | `getRegistrationDocUrl()`, private bucket policy | signed URL, super admin |
| Toggle ON state galat | `src/components/ui.tsx` `Switch` | flex justify + `p-0.5` |
| State dropdown incomplete | `src/lib/states.ts` | sab isi list ko use karein |
| Print me poora page aa raha | `utils.printArea`, `globals.css` | `.print-area`, `body.print-mode` |
| ID card 1 page par 8 se zyada | `id-cards/page.tsx`, `.id-sheet` | pagination logic |
| Member ko doosre ka ID card dikh raha | `listMembers` + RLS | member role scoping |
| Excel export galat | `src/lib/export.ts`, report page | date filter + settled date |
| PDF screenshot jaisa | `downloadPdfTable` | real table use karein |
| Sidebar me page nahi dikh raha | `src/lib/nav.ts` | role array me add karein |
| Direct URL par page khulta hai lekin data nahi | RLS | expected; role/tenant check |
| Mobile par purana version | `VersionWatcher`, `version.json` | build stamp, no-store |
| Build fail `colSpan` | `components/ui.tsx` `Td` | `Td` colSpan accept nahi karta |
| PowerShell `npm` error | — | `npm.cmd` |
| Git command not found | — | GitHub Desktop bundled git path |
| Management API `Invalid access token` | — | naya PAT generate karein |
| Supabase DB connect timeout | — | direct host IPv6; pooler use karein |

---

## 22. "Change this" → touch these files

| I want to… | Files |
| --- | --- |
| Naya page add karna | `src/app/(app)/<route>/page.tsx` + `src/lib/nav.ts` |
| Naya sidebar item | `src/lib/nav.ts` |
| Naya DB table/column | new `supabase/migrations/0038_...sql` + `src/lib/types.ts` + `src/lib/repo.ts` |
| Naya RPC | migration + `repo.ts` wrapper + caller page |
| Naya role/permission | `types.ts`, `nav.ts`, migration guard/RLS |
| Payment logic | `0034`/`0035` padhein, `repo.ts`, `finance/collections` |
| Fee/invoice logic | `repo.ts` (`generateInvoices`, `generateDuesRange`), `finance/fees` |
| Dashboard card | `(app)/dashboard/page.tsx`, `finance-overview.tsx`, `charts.tsx` |
| Report/export | `finance/reports/page.tsx`, `lib/export.ts` |
| Print layout | `globals.css`, `utils.printArea`, relevant page `.print-area` |
| ID card design | `id-cards/page.tsx`, `receipt.tsx` (receipt) |
| Receipt design | `components/receipt.tsx` |
| Branding | `components/brand.tsx`, login page footer |
| Theme colours | `src/app/globals.css`, Tailwind classes |
| Login/OTP | `src/lib/auth.tsx`, `app/login/page.tsx` |
| Suspension | `0031`, `session.ts`, `platform/tenants` |
| Registration request | `registration-request-form.tsx`, `0036`, `platform/registrations` |
| QR/bank settings | `settings/payments/page.tsx`, `0036`, `0037` |
| Notifications | `0033`, `notifications/page.tsx`, `AppShell` |
| Namaz calculation | `lib/prayer.ts`, `namaz/page.tsx` |
| States list | `lib/states.ts` |
| Mock/demo data | `lib/mock.ts` |
| Deploy config | `next.config.ts`, `.github/workflows/deploy.yml`, `public/_headers` |
| Backups | `.github/workflows/backup.yml`, `BACKUP.md` |

---

## 23. Known pitfalls

1. **`Td` does not accept `colSpan`.** Use native `<td colSpan>` or extend the type.
2. **`verify_payment` returns the literal string `'PENDING-SECOND-APPROVAL'`.**
   Isko error na samjhein; UI ko "second approval pending" dikhana chahiye.
3. **`audit_row()` must read `tenant_id`/`id` defensively** via `to_jsonb(new)`.
   Direct `new.tenant_id` kuch tables par fail karta hai.
4. **`is_trusted_context()` is true for `postgres` / `supabase_admin` / `service_role`.**
   Isliye SECURITY DEFINER RPCs guarded tables update kar sakte hain. Iska misuse =
   security hole.
5. **Ledger rows must never be rewritten.** Hash chain tootegi. Correction = reversal entry.
6. **Calculations source tables se karein**, ledger rows se nahi (historical donation
   credit convention alag hai).
7. **`payments.paid_paise` / `invoices.paid_paise` cache hain.** Allocations source hain.
8. **Reporting `created_at` se na karein.** `settled_at` / `verified_at` / `approved_at`.
9. **Service role key frontend me nahi.** Sirf Edge Functions.
10. **Demo mode production me off.** Warna real data nahi dikhega.
11. **Purani migration edit na karein.** Naya numbered file.
12. **RLS policy `drop policy if exists` ke bina dobara create nahi hoti.**
13. **Storage bucket policies** — `avatars` public, `registration-docs` private.
14. **Mobile numbers exactly 10 digits** — `PhoneInput` + DB check + RPC validation.
15. **Suspended tenant par `current_tenant_id()` NULL** — code ko NULL-safe rakhein.
16. **`AppShell` direct URL role guard nahi karta.** Sensitive page me role check rakhein.
17. **PowerShell** — `npm.cmd`, aur git PATH me nahi.
18. **`push` non-zero exit** print karta hai lekin push succeed ho sakta hai — verify karein.
19. **Supabase free DB pause** ho sakta hai — keepalive workflow.
20. **Next static export** — server actions / API routes nahi. Sab client-side + Supabase.
21. **`.env.local` gitignored hai** — naye developer ko keys alag se leni hongi.
22. **`NEXT_PUBLIC_*` browser me visible hota hai** — secret na daalein.
23. **`toTenant` mapping** — naya DB column add karein to `email`, `address`, `logoUrl`,
    `themeColor`, QR/bank fields mapping update karein, warna UI me undefined.
24. **Receipt fiscal year** — `receipt_sequences` per fiscal year; reset nahi karein.
25. **`8 per A4` ID sheet** — `.id-sheet` page break CSS se control hota hai.
26. **Member advance** `unallocated_paise` me hai, `payments.amount_paise` me nahi.

---

## 24. Bug-fix checklist

Koi bhi bug fix karne se pehle:

- [ ] Bug **kis layer** ka hai? UI / repo / RPC / RLS / trigger / cron?
- [ ] Reproduce: demo mode ya live? kaun sa role? kaun sa tenant?
- [ ] Console/network error? Supabase error code?
- [ ] DB me actual row check karein (SQL Editor).
- [ ] Finance bug? [§16](#16-financial-invariants--never-break-these) invariants verify karein.
- [ ] Fix ke baad audit queries (16.10) dobara chalayein — sab zero.
- [ ] Typecheck: `npm.cmd run typecheck`.
- [ ] SQL tests: `npm.cmd run test:sql` (agar migration change).
- [ ] Build: `npm.cmd run build`.
- [ ] Mobile par test: login, state dropdown, toggle, print, share.
- [ ] Dono approver roles se test: maker-checker tootta nahi.
- [ ] Suspended tenant se test: zero rows + exact message.
- [ ] Commit message me kya/why likhein; migration ka number mention karein.
- [ ] Deploy ke baad `version.json` match karein; hard refresh.
- [ ] Live audit queries clean.

### Definition of done

1. Bug reproduce nahi hota.
2. Koi naya audit mismatch nahi.
3. Cross-tenant leak nahi.
4. Maker-checker intact.
5. Print/share/mobile intact.
6. Typecheck + build pass.
7. Doc update (agar behaviour badla).

---

## 25. Known gaps / next steps

| Item | Status | Notes |
| --- | --- | --- |
| Email delivery to real users | ⚠️ unconfirmed | Hostinger SMTP configured; actual inbox delivery user ne confirm nahi kiya |
| Real impersonation | ⚠️ partial | Abhi sirf localStorage tenant id cosmetic; DB-level impersonation nahi |
| Supabase Management API PAT | ❌ invalid | `migrate.yml` (GitHub Actions + `SUPABASE_DB_URL`) use karein |
| Platform-managed tenant creation from registration | manual | Approval ke baad Super Admin manually tenant banata hai |
| TOTP | optional | Email OTP new-device default; TOTP extra lock |
| `collector` approval rights | none | By design: collect only |
| `auditor` role | verify/approve only | Can verify payments/donations + approve expenses; not a full read-only role |
| Role-level RLS on generic tables | ⚠️ tenant-level only | `0002` generic policies tenant-scoped; guard triggers protect money fields. Member `members` reads bhi tenant-level hain (UI own card filter karta hai). See §13 nuance |
| Secretary in approvals queue | ⚠️ nav mismatch | DB allows secretary for fee/waiver/payment_edit decisions, but `/approvals/` nav `sadar/khajanchi/auditor` only |

---

## Appendix A — Full table list (`public`)

```
approvals                 audit_log              complaints
donations                 expenses               fee_overrides
fee_plans                 funds                  integration_secrets
integrations              invitations            invoices
job_runs                  ledger_entries         ledger_seals
member_notifications      members                notices
notification_queue        payment_allocations    payments
platform_invoices         platform_plans         prayer_days
profiles                  receipt_sequences      registration_requests
support_messages          tenant_settings        tenants
webhook_events
```

---

## Appendix B — Full RPC list (`public`)

```
apply_member_advance              apply_member_payment_reset
apply_payment_edit                apply_verified_payment
approve_expense                   approve_fee_override
assign_complaint_code             assign_member_code
audit_row                         broadcast_notice
cancel_notification               claim_notifications
create_donation                   current_profile
current_role                      current_tenant_id
dashboard_snapshot                decide_approval
decide_registration_request       digest
ensure_tenant_settings            expire_tenants
generate_dues_range               generate_member_dues
generate_monthly_invoices         guard_approval_insert
guard_approval_update             guard_complaint_update
guard_donation_insert             guard_donation_update
guard_expense_insert              guard_expense_update
guard_fee_override_insert         guard_fee_override_update
guard_fund_insert                 guard_fund_update
guard_integration_update          guard_invoice_insert
guard_invoice_update              guard_member_write
guard_payment_insert              guard_payment_update
guard_profile_update              guard_sensitive_mfa
guard_tenant_status               guard_tenant_update
invoices_apply_advance            is_office_bearer
is_service_role                   is_super_admin
is_trusted_context                jwt_aal
jwt_role                          keepalive
ledger_append                     ledger_hash
ledger_seal                       list_all_accounts
list_registration_requests        login_block_reason
mark_all_notifications_read       mark_notification_read
mfa_ok                            my_tenant_status
my_work_queue                     next_donation_receipt_no
next_receipt_no                   notify_invoice_change
notify_member                     notify_notice_change
notify_payment_change             only_digits
payments_clear_advance            payments_fund_sync
pick_channel                      publish_due_notices
queue_notice_broadcast            queue_payment_receipt
queue_reminders                   reject_donation
reject_expense                    reject_payment
remove_member                     request_fee_change
request_member_archive            request_member_delete
request_member_pause              request_member_resume
restore_member
request_payment_edit              request_payment_reset
request_waiver                    requeue_notifications
reverse_payment                   run_daily_maintenance
run_requeue                       save_integration_secret
save_payment_settings             send_public_support_message
send_support_message              set_account_active
set_account_role                  set_fee_cycle
set_member_prefix                 submit_advance_payment
submit_registration_request       sync_invoice_status
touch_updated_at                  update_member_details
update_my_profile                 verify_donation
verify_donation_auto              verify_ledger
verify_payment                    verify_payment_auto
```

---

## Appendix C — Glossary (Hinglish)

| Word | Meaning |
| --- | --- |
| **Anjuman** | Village/community committee |
| **Sadar** | President |
| **Khajanchi** | Treasurer (paisa rakhta hai) |
| **Sachiv / Secretary** | Secretary |
| **Chanda** | Monthly subscription/contribution |
| **Rasheed** | Receipt |
| **Zakat** | Obligatory charity fund |
| **Sadqa** | Voluntary charity fund |
| **Gift** | General gift/donation fund |
| **Qarz** | Loan/udhaar |
| **Dues** | Baki chanda |
| **Advance** | Pehle jama kiya paisa, aage ke dues me adjust |
| **Maker–checker** | Enter karne wala approve nahi kar sakta |
| **Ledger** | Hisab ki permanent book (hash-chained) |
| **Tenant** | Ek anjuman ka isolated account |
| **RLS** | Row Level Security — DB-level tenant lock |
| **RPC** | DB function jo browser se call hota hai |

---

## Quick contact / ownership

| Area | Owner |
| --- | --- |
| Product & requirements | Safa Web Solution |
| Frontend / Next.js | Developer |
| Database / Supabase | Developer |
| Hosting | Cloudflare Pages (`anjuman`) |

**Branding line (har panel + login):**
`Made By : Safa Web Solution` · `Made in India` · emerald theme · red heart · tiranga colours.

---

*End of handbook. Koi bhi naya feature merge karne se pehle is file ka relevant section
update karein — future developer ka time bachega aur gadbad ka dar kam hoga.*
