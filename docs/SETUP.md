# Setup guide — Hinglish, step by step

Ye guide **non-technical** user ke liye likhi gayi hai. Har step copy-paste se ho jayega.
Kuch bhi install karne ki zaroorat nahi — sirf browser chahiye.

Total time: **~25 minute**. Kharcha: **₹0**.

---

## 0. Pehle ye samajh lo

App do tarah se chalti hai:

| Mode | Kab | Kya hota hai |
| --- | --- | --- |
| **Demo mode** | Jab Supabase keys nahi hoti | Sample data, sab kuch dekh sakte ho, kuch save nahi hota |
| **Live mode** | Jab Supabase keys daal do | Asli data, asli login, asli receipt |

Abhi demo mode me sab kuch chal raha hai. Neeche live karne ka tarika hai.

---

## 1. Supabase project banao (free)

1. [supabase.com](https://supabase.com) kholo → **Start your project** → GitHub se sign in.
2. **New project** → naam: `anjuman` → region: **Mumbai (ap-south-1)** → database password
   kahin note kar lo → **Create**.
3. 2 minute wait karo jab tak project ready ho.

### Keys copy karo

Left menu → **Project Settings** → **API**:

- `Project URL` → ye `NEXT_PUBLIC_SUPABASE_URL` hai
- `anon public` key → ye `NEXT_PUBLIC_SUPABASE_ANON_KEY` hai

> ⚠️ `service_role` key **kabhi** kisi ko na do aur app me na daalo. Sirf `anon` key.

---

## 2. Database banao

Left menu → **SQL Editor** → **New query**.

Teen files ek-ek karke chalao (order zaroori hai):

1. `supabase/migrations/0001_schema.sql` → paste → **Run**
2. `supabase/migrations/0002_rls.sql` → paste → **Run**
3. `supabase/migrations/0003_functions.sql` → paste → **Run**

Sab green dikhe to ho gaya. Error aaye to poora error message copy karke rakh lo.

### Demo data (optional)

`supabase/seed.sql` chalao — ek test anjuman (Bharauli) ban jayegi.

---

## 3. Login system

Left menu → **Authentication** → **Providers**:

- **Email** → ON rakho (password login ke liye)
- **Phone** → ON karo sirf tab jab OTP chahiye ho (SMS ka kharcha lagega)

### Pehla sadar banao

1. **Authentication** → **Users** → **Add user** → email + password.
2. **Table Editor** → `profiles` → **Insert row**:
   - `id` = jo user banaya uska UUID
   - `tenant_id` = `tenants` table se apni anjuman ka id
   - `full_name` = naam
   - `role` = `sadar`
   - `is_active` = true

Bas — ab us email/password se app me login hoga.

---

## 4. App ko Cloudflare par chadhao (free)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create**
   → **Pages** → **Connect to Git**.
2. GitHub repo `anjuman` select karo.
3. Build settings:
   - Framework preset: **Next.js (Static HTML Export)**
   - Build command: `npm run build`
   - Build output directory: `out`
4. **Environment variables** (Production) me daalo:

```
NEXT_PUBLIC_SUPABASE_URL        = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   = eyJhbGciOi...
NEXT_PUBLIC_APP_URL             = https://anjuman.pages.dev
NEXT_PUBLIC_DEMO_MODE           = false
```

5. **Save and Deploy** → 2 minute me live.

Har `git push` par automatic deploy ho jayega.

---

## 5. GitHub Actions ke secrets (deploy + backup)

Repo → **Settings** → **Secrets and variables** → **Actions**.

### Secrets

| Secret | Kahan se |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create (Pages:Edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard URL me `dash.cloudflare.com/<account-id>` |
| `SUPABASE_DB_URL` | Supabase → Settings → Database → Connection string (URI) |
| `R2_ACCESS_KEY_ID` | R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | wahi token banate waqt |
| `R2_ENDPOINT` | `https://<account-id>.r2.cloudflarestorage.com` |
| `R2_BUCKET` | e.g. `anjuman-backups` |

### Variables

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_DEMO_MODE`, `CLOUDFLARE_PAGES_PROJECT`.

Backup roz **raat 2:30 IST** par khud chalega aur R2 me file daal dega.

---

## 6. Pehli baar kya karna hai (checklist)

- [ ] Sadar login karke **Settings → Anjuman Profile** bharo
- [ ] **Settings → Payments** → apna UPI ID daalo (Mode A)
- [ ] **Finance → Fee plans** → monthly chanda amount set karo
- [ ] **Members** → members add karo (ID automatic banega)
- [ ] **ID Cards** → 8 select karke print karo
- [ ] **Namaz** → apne masjid ka timetable check karo, zaroorat ho to override
- [ ] Khajanchi aur collector ko invite karo (**Settings → Roles**)

---

## 7. Paise kaise aayenge (Mode A / B)

### Mode A — apna UPI (0% fees)

Members apne phone se seedha anjuman ke UPI par paise bhejte hain. Khajanchi
statement se reference match karke **Collections → Verify** karta hai. Receipt
turant ban jati hai.

### Mode B — apna gateway (Razorpay / Cashfree / PhonePe)

1. Gateway account kholo (anjuman ke naam par, PAN + bank chahiye).
2. **Settings → Payments → Mode B** → Key ID + secret paste karo.
3. **Test connection** → green aaye to **Enable**.

Paisa seedha anjuman ke bank account me aayega (T+2). Platform kabhi paisa
nahi rakhta.

---

## 8. Roz-marra ka kaam (5 minute)

| Kaam | Kahan |
| --- | --- |
| Aaj ka collection dekhna | Dashboard |
| Payment verify karna | Finance → Collections → Pending |
| Receipt print karna | Collections → Receipt → Print |
| Expense approve karna | Approvals |
| Member ka dues dekhna | Members → naam search |
| ID card banana | ID Cards |

Baaki sab automatic hai: invoice, reminder, reconciliation, backup.

---

## Common problems

**App blank dikh raha hai**
Browser console kholo (F12). Zyadatar `NEXT_PUBLIC_SUPABASE_URL` galat hota hai.
Cloudflare me environment variable ke baad **redeploy** karna zaroori hai.

**Login ke baad "no tenant"**
`profiles` table me us user ka `tenant_id` set nahi hai. Step 3 dobara dekho.

**Receipt number repeat ho raha hai**
`receipt_sequences` table check karo — `(tenant_id, fiscal_year)` ka ek hi row hona chahiye.

**Print me receipt kata hua aa raha hai**
Printer settings me paper size **58mm** ya **80mm** select karo, margin **None**.

---

## Kya cheez kahan hai (quick map)

```
Dashboard       → aaj ka hisaab, sirf jo dhyan chahiye
Members         → member ID, profile, dues, payments
ID Cards        → bulk print + QR
Finance         → chanda, donation, kharcha, ledger, report
Approvals       → doosre vyakti ki permission
Settings        → profile, payment keys, notifications, roles
Platform        → sirf Super Admin (saari anjumanein)
```

Koi step atke to screenshot bhej dena — main usi hisaab se guide update kar dunga.
