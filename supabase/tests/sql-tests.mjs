// ═══════════════════════════════════════════════════════════════
// SQL test suite — runs the real migrations inside PGlite (Postgres
// compiled to WebAssembly), then exercises the money paths as real
// authenticated users.
//
// It is not a syntax check. It proves:
//   · tenant isolation (RLS) across two committees
//   · a browser can never create a verified payment / paid invoice
//   · the maker cannot approve or verify their own entry
//   · direct money edits are refused by the guard triggers
//   · a tenant cannot extend its own subscription
//   · invoices, reminders and receipts are idempotent
//   · reversals restore dues and keep a contra ledger entry
//   · the ledger hash chain still verifies afterwards
//   · a user with no tenant profile (null role) is refused
//
// Run with:  npm run test:sql
//
// PGlite is a dev dependency only. Nothing here reaches the browser
// bundle or production.
// ═══════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

const files = [
  "supabase/migrations/0001_schema.sql",
  "supabase/migrations/0002_rls.sql",
  "supabase/migrations/0003_functions.sql",
  "supabase/migrations/0004_automation.sql",
  "supabase/migrations/0005_workflows.sql",
  "supabase/migrations/0006_expense_reject.sql",
  "supabase/migrations/0007_fee_change.sql",
  "supabase/migrations/0008_complaint_workflow.sql",
  "supabase/migrations/0009_prayer_location.sql",
  "supabase/migrations/0010_donations.sql",
  "supabase/migrations/0011_security_hardening.sql",
  "supabase/seed.sql",
];

const db = new PGlite({ extensions: { pgcrypto, pg_trgm } });

const bootstrap = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  create or replace function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$;

  create schema if not exists storage;
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text,
    name text,
    owner uuid
  );
  create or replace function storage.foldername(p_name text) returns text[]
  language sql immutable as $$ select string_to_array(p_name, '/') $$;
`;

try {
  await db.exec(bootstrap);
  console.log("bootstrap ok");
} catch (error) {
  console.error("bootstrap failed:", error.message);
  process.exit(1);
}

for (const file of files) {
  const sql = readFileSync(file, "utf8");
  try {
    await db.exec(sql);
    console.log(`OK   ${file}`);
  } catch (error) {
    console.error(`FAIL ${file}`);
    console.error(error.message);
    console.error("position:", error.position, "detail:", error.detail, "hint:", error.hint);
    if (error.position) {
      const pos = Number(error.position);
      const before = sql.slice(0, pos);
      const line = before.split("\n").length;
      console.error(`around line ${line}`);
      console.error(sql.split("\n").slice(Math.max(0, line - 4), line + 3).join("\n"));
    }
    process.exit(1);
  }
}

const counts = await db.query(`
  select
    (select count(*) from public.tenants) as tenants,
    (select count(*) from public.members) as members,
    (select count(*) from public.ledger_entries) as ledger,
    (select count(*) from public.tenant_settings) as settings
`);
console.log("rows:", counts.rows[0]);

const member = await db.query("select code, fee_paise from public.members order by serial_no limit 2");
console.log("members:", member.rows);

const ledger = await db.query("select seq, ref_type, hash is not null as hashed from public.ledger_entries");
console.log("ledger:", ledger.rows);

// ═══════════════════════════════════════════════════════════════
// Behaviour tests (RLS, guards, money flow)
// ═══════════════════════════════════════════════════════════════

const BHR = "11111111-1111-4111-8111-111111111111";
const TST = "99999999-9999-4999-8999-999999999999";
const U_SADAR = "aaaaaaaa-0000-4000-8000-000000000001";
const U_KHAJ = "aaaaaaaa-0000-4000-8000-000000000002";
const U_MEMBER = "aaaaaaaa-0000-4000-8000-000000000003";
const U_OTHER = "aaaaaaaa-0000-4000-8000-000000000004";
const U_SEC = "aaaaaaaa-0000-4000-8000-000000000005";

const failures = [];
function check(label, condition, extra = "") {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures.push(label);
    console.log(`FAIL ${label} ${extra}`);
  }
}

await db.exec(`
  insert into auth.users (id, email) values
    ($$${U_SADAR}$$, 'sadar@test.in'),
    ($$${U_KHAJ}$$, 'khajanchi@test.in'),
    ($$${U_MEMBER}$$, 'member@test.in'),
    ($$${U_OTHER}$$, 'other@test.in'),
    ($$${U_SEC}$$, 'secretary@test.in')
  on conflict do nothing;

  insert into public.tenants (id, code, name, village, district, state, status)
  values ($$${TST}$$, 'TST', 'Test Committee', 'Test', 'Test', 'UP', 'active')
  on conflict do nothing;

  insert into public.members (tenant_id, name, phone, member_type, fee_paise)
  values ($$${TST}$$, 'Other Member', '+91 9700000001', 'member', 10000);

  insert into public.profiles (id, tenant_id, full_name, phone, role, is_active)
  values
    ($$${U_SADAR}$$, $$${BHR}$$, 'Sadar Sahab', '+91 9800000011', 'sadar', true),
    ($$${U_KHAJ}$$, $$${BHR}$$, 'Khajanchi Sahab', '+91 9800000012', 'khajanchi', true),
    ($$${U_MEMBER}$$, $$${BHR}$$, 'Muhammad Idris', '+91 9800000001', 'member', true),
    ($$${U_OTHER}$$, $$${TST}$$, 'Other Sadar', '+91 9700000011', 'sadar', true),
    ($$${U_SEC}$$, $$${BHR}$$, 'Secretary Sahab', '+91 9800000013', 'secretary', true)
  on conflict (id) do nothing;

  update public.profiles
    set member_id = (select id from public.members where tenant_id = $$${BHR}$$ and name = 'Muhammad Idris')
    where id = $$${U_MEMBER}$$;

  insert into public.integrations (tenant_id, type, provider, enabled, status)
  values ($$${BHR}$$, 'whatsapp', 'meta', true, 'connected');
`);

await db.exec(`
  grant usage on schema public, auth, storage to authenticated;
  grant select on all tables in schema public to authenticated;
  grant insert, update, delete on all tables in schema public to authenticated;
  revoke insert, update, delete on public.ledger_entries, public.ledger_seals,
    public.receipt_sequences, public.payment_allocations from authenticated;
  revoke all on public.integration_secrets from authenticated;
`);

async function asUser(userId, role, sql) {
  await db.exec(`
    select set_config('request.jwt.claim.sub', $$${userId}$$, false);
    select set_config('request.jwt.claim.role', $$${role}$$, false);
    set role authenticated;
  `);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

async function asService(sql) {
  await db.exec(`
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', 'service_role', false);
    set role postgres;
  `);
  return db.query(sql);
}

const memberRow = await db.query(`select id from public.members where tenant_id = $$${BHR}$$ and name = 'Muhammad Idris'`);
const MEMBER = memberRow.rows[0].id;

// 1. Invoice generation is idempotent.
const gen1 = await asUser(U_SADAR, "authenticated", `select public.generate_monthly_invoices($$${BHR}$$, '2026-11') as r`);
const gen2 = await asUser(U_SADAR, "authenticated", `select public.generate_monthly_invoices($$${BHR}$$, '2026-11') as r`);
check("invoice run 1 creates 1", Number(gen1.rows[0].r.created) === 1, JSON.stringify(gen1.rows[0].r));
check("invoice run 2 creates 0", Number(gen2.rows[0].r.created) === 0, JSON.stringify(gen2.rows[0].r));

// 2. Browser insert can never arrive verified.
const dbg = await asUser(U_SADAR, "authenticated", `
  select current_setting('request.jwt.claim.sub', true) as guc_sub,
         current_setting('request.jwt.claim.role', true) as guc_role,
         auth.uid() as uid,
         (select count(*)::int from public.profiles where id = auth.uid()) as profile_rows,
         public.current_tenant_id() as tenant,
         public.current_role()::text as role,
         public.current_role()::text = any ('{sadar,secretary,khajanchi,collector}'::text[]) as role_ok,
         '${BHR}'::uuid = public.current_tenant_id() as tenant_ok
`);
console.log("debug:", dbg.rows[0]);
const policyDef = await db.query(`
  select polname, pg_get_expr(polqual, polrelid) as using_expr,
         pg_get_expr(polwithcheck, polrelid) as check_expr
  from pg_policy where polrelid = 'public.payments'::regclass
`);
console.log("payment policies:", policyDef.rows);
const pay = await asUser(U_SADAR, "authenticated", `
  insert into public.payments
    (tenant_id, member_id, amount_paise, method, status, receipt_no, verified_by)
  values ($$${BHR}$$, $$${MEMBER}$$, 30000, 'upi', 'verified', 'FAKE-1', $$${U_SADAR}$$)
  returning id, status, receipt_no, entered_by, verified_by
`);
const PAYMENT = pay.rows[0].id;
check("browser payment forced pending", pay.rows[0].status === "pending");
check("browser payment has no receipt", pay.rows[0].receipt_no === null);
check("browser payment has no verifier", pay.rows[0].verified_by === null);
check("browser payment records maker", pay.rows[0].entered_by === U_SADAR);

// 3. Maker cannot verify their own entry.
let selfVerifyError = "";
try {
  await asUser(U_SADAR, "authenticated", `select public.verify_payment($$${PAYMENT}$$)`);
} catch (error) {
  selfVerifyError = error.message;
}
check("maker cannot self-verify", selfVerifyError.includes("Maker cannot verify"), selfVerifyError);

// 4. Another office bearer can verify.
const verified = await asUser(U_KHAJ, "authenticated", `select public.verify_payment($$${PAYMENT}$$) as receipt`);
check("khajanchi can verify", String(verified.rows[0].receipt).startsWith("R-"), JSON.stringify(verified.rows[0]));

const afterVerify = await db.query(`
  select p.status, p.receipt_no, p.unallocated_paise,
         i.paid_paise, i.status as invoice_status,
         (select count(*) from public.payment_allocations a where a.payment_id = p.id) as allocations,
         (select count(*) from public.ledger_entries l where l.ref_type = 'payment') as ledger_rows
  from public.payments p
  join public.invoices i on i.member_id = p.member_id and i.period = '2026-11'
  where p.id = $$${PAYMENT}$$
`);
const av = afterVerify.rows[0];
check("payment verified", av.status === "verified");
check("invoice part-paid", Number(av.paid_paise) === 30000 && av.invoice_status === "partial", JSON.stringify(av));
check("allocation written", Number(av.allocations) === 1);
check("ledger row written", Number(av.ledger_rows) === 1);

// 5. Direct money edits are blocked by RLS + guard.
await asUser(U_SADAR, "authenticated", `update public.payments set amount_paise = 1 where id = $$${PAYMENT}$$`);
const amountAfter = await db.query(`select amount_paise from public.payments where id = $$${PAYMENT}$$`);
check("payment amount immutable", Number(amountAfter.rows[0].amount_paise) === 30000);

let tenantGuard = "";
try {
  await asUser(U_SADAR, "authenticated", `update public.tenants set expires_at = '2099-01-01' where id = $$${BHR}$$`);
} catch (error) {
  tenantGuard = error.message;
}
check("tenant cannot extend own plan", tenantGuard.includes("platform admin"), tenantGuard);

// 6. A browser invoice cannot start paid.
const fakeInvoice = await asUser(U_SADAR, "authenticated", `
  insert into public.invoices (tenant_id, member_id, period, amount_paise, paid_paise, status, due_date)
  values ($$${BHR}$$, $$${MEMBER}$$, '2026-12', 50000, 50000, 'paid', '2026-12-10')
  returning paid_paise, status
`);
check("fake paid invoice forced unpaid", Number(fakeInvoice.rows[0].paid_paise) === 0 && fakeInvoice.rows[0].status === "pending");

// 7. Reminder queue only targets the tenant's own members.
const reminders = await asUser(U_SADAR, "authenticated", `select public.queue_reminders($$${BHR}$$, '2026-11', true) as r`);
check("one reminder queued", Number(reminders.rows[0].r.created) === 1, JSON.stringify(reminders.rows[0].r));
const queued = await db.query(`select channel, recipient, status from public.notification_queue order by created_at limit 1`);
check("reminder goes on whatsapp", queued.rows[0]?.channel === "whatsapp", JSON.stringify(queued.rows[0]));

// 8. Cross-tenant isolation.
const otherMembers = await asUser(U_OTHER, "authenticated", `select count(*)::int as n from public.members`);
const otherPayments = await asUser(U_OTHER, "authenticated", `select count(*)::int as n from public.payments`);
const otherTenants = await asUser(U_OTHER, "authenticated", `select count(*)::int as n from public.tenants`);
check("other tenant sees only own members", otherMembers.rows[0].n === 1, JSON.stringify(otherMembers.rows[0]));
check("other tenant sees no payments", otherPayments.rows[0].n === 0, JSON.stringify(otherPayments.rows[0]));
check("other tenant sees only own tenant row", otherTenants.rows[0].n === 1, JSON.stringify(otherTenants.rows[0]));

// 9. A member sees only their own dues.
const ownInvoices = await asUser(U_MEMBER, "authenticated", `select count(*)::int as n from public.invoices`);
const ownPayments = await asUser(U_MEMBER, "authenticated", `select count(*)::int as n from public.payments`);
check("member sees only own invoices", ownInvoices.rows[0].n === 2, JSON.stringify(ownInvoices.rows[0]));
check("member sees only own payments", ownPayments.rows[0].n === 1, JSON.stringify(ownPayments.rows[0]));

// 10. Reversal keeps history and restores dues.
await asUser(U_SADAR, "authenticated", `select public.reverse_payment($$${PAYMENT}$$, 'test reversal')`);
const afterReverse = await db.query(`
  select p.status, i.paid_paise,
         (select count(*) from public.ledger_entries where ref_type = 'reversal') as reversals,
         (select count(*) from public.payment_allocations where payment_id = p.id) as allocations
  from public.payments p
  join public.invoices i on i.member_id = p.member_id and i.period = '2026-11'
  where p.id = $$${PAYMENT}$$
`);
const rev = afterReverse.rows[0];
check("payment rejected after reversal", rev.status === "rejected");
check("dues restored after reversal", Number(rev.paid_paise) === 0, JSON.stringify(rev));
check("reversal leaves contra entry", Number(rev.reversals) === 1);
check("allocations cleared", Number(rev.allocations) === 0);

const chain = await db.query(`select public.verify_ledger($$${BHR}$$) as broken`);
check("ledger chain intact", chain.rows[0].broken === null, JSON.stringify(chain.rows[0]));

// 11. Auto-verify is service-only and gateway-only.
const gateway = await asService(`
  insert into public.payments
    (tenant_id, member_id, amount_paise, method, reference, status, entered_by)
  values ($$${BHR}$$, $$${MEMBER}$$, 20000, 'gateway', 'order_test_1', 'pending', null)
  returning id
`);
const GATEWAY = gateway.rows[0].id;
const auto = await asService(`select public.verify_payment_auto($$${GATEWAY}$$) as receipt`);
check("gateway payment auto-verified", String(auto.rows[0].receipt).startsWith("R-"), JSON.stringify(auto.rows[0]));

let memberAuto = "";
try {
  await asUser(U_SADAR, "authenticated", `select public.verify_payment_auto($$${GATEWAY}$$)`);
} catch (error) {
  memberAuto = error.message;
}
check("browser cannot call auto-verify", /server-only|permission denied/.test(memberAuto), memberAuto);

// 12. Dashboard snapshot.
const snapshot = await asUser(U_SADAR, "authenticated", `select public.dashboard_snapshot($$${BHR}$$) as s`);
check("dashboard ledger ok", snapshot.rows[0].s.ledger_ok === true, JSON.stringify(snapshot.rows[0].s));

// 13. Integration keys are write-protected for members.
let memberIntegration = "";
try {
  await asUser(U_MEMBER, "authenticated", `
    insert into public.integrations (tenant_id, type, provider, enabled)
    values ($$${BHR}$$, 'sms', 'msg91', true)
  `);
} catch (error) {
  memberIntegration = error.message;
}
check("member cannot add an integration", memberIntegration.includes("row-level security"), memberIntegration);

// 14. Fee override approval.
await db.exec(`
  insert into public.fee_overrides (tenant_id, member_id, amount_paise, reason)
  values ($$${BHR}$$, $$${MEMBER}$$, 30000, 'widow concession')
  on conflict (member_id) do nothing;
`);
const override = await db.query(`select id, approved_by from public.fee_overrides where member_id = $$${MEMBER}$$`);
const OVERRIDE = override.rows[0].id;
check("override starts unapproved", override.rows[0].approved_by === null);
await asUser(U_SADAR, "authenticated", `select public.approve_fee_override($$${OVERRIDE}$$)`);
const approved = await db.query(`select approved_by from public.fee_overrides where id = $$${OVERRIDE}$$`);
check("sadar can approve override", approved.rows[0].approved_by === U_SADAR);

// 14b. Changing an approved fee goes through the request RPC.
const feeReq = await asUser(U_KHAJ, "authenticated", `
  select public.request_fee_change($$${MEMBER}$$, 25000, 'hardship review') as id
`);
const FEE_APPROVAL = feeReq.rows[0].id;
const feeReset = await db.query(`select approved_by, amount_paise from public.fee_overrides where id = $$${OVERRIDE}$$`);
check("fee change reopens the override", feeReset.rows[0].approved_by === null, JSON.stringify(feeReset.rows[0]));
check("fee change stores the new amount", Number(feeReset.rows[0].amount_paise) === 25000, String(feeReset.rows[0].amount_paise));

let selfFee = "";
try {
  await asUser(U_KHAJ, "authenticated", `select public.decide_approval($$${FEE_APPROVAL}$$, true, 'self')`);
} catch (error) {
  selfFee = error.message;
}
check("maker cannot decide their own fee change", selfFee.includes("Maker cannot decide"), selfFee);

await asUser(U_SEC, "authenticated", `select public.decide_approval($$${FEE_APPROVAL}$$, true, 'ok')`);
const feeApproved = await db.query(`select approved_by, amount_paise from public.fee_overrides where id = $$${OVERRIDE}$$`);
check("second bearer approves the new fee", feeApproved.rows[0].approved_by === U_SEC, JSON.stringify(feeApproved.rows[0]));

let lockedFee = "";
try {
  await asUser(U_SADAR, "authenticated", `update public.fee_overrides set amount_paise = 1 where id = $$${OVERRIDE}$$`);
} catch (error) {
  lockedFee = error.message;
}
check("an approved fee override is locked", lockedFee.includes("locked"), lockedFee);

// 15. Queue worker primitives.
const claimed = await asService(`select * from public.claim_notifications(10)`);
check("service can claim queued messages", claimed.rows.length >= 1, `rows=${claimed.rows.length}`);

// 15b. Waiver request + approval workflow.
const waive = await asUser(U_SADAR, "authenticated", `
  select public.request_waiver($$${MEMBER}$$, array['2026-11']::text[], 'widow concession') as id
`);
const WAIVER = waive.rows[0].id;
const waiverRow = await db.query(`
  select status, meta, requested_by from public.approvals where id = $$${WAIVER}$$
`);
check("waiver stores its months", waiverRow.rows[0].meta.periods.includes("2026-11"), JSON.stringify(waiverRow.rows[0].meta));

let selfDecide = "";
try {
  await asUser(U_SADAR, "authenticated", `select public.decide_approval($$${WAIVER}$$, true, 'self')`);
} catch (error) {
  selfDecide = error.message;
}
check("maker cannot decide own waiver", selfDecide.includes("Maker cannot decide"), selfDecide);

const decided = await asUser(U_SEC, "authenticated", `select public.decide_approval($$${WAIVER}$$, true, 'approved by secretary') as r`);
check("another bearer can approve waiver", decided.rows[0].r.status === "approved", JSON.stringify(decided.rows[0].r));

const waived = await db.query(`
  select paid_paise, status, waived_by from public.invoices
  where member_id = $$${MEMBER}$$ and period = '2026-11'
`);
check("waiver marks the month waived", waived.rows[0]?.status === "waived", JSON.stringify(waived.rows[0]));

let directDecision = "";
try {
  await asUser(U_SADAR, "authenticated", `
    update public.approvals set status = 'approved', decided_by = $$${U_SADAR}$$ where id = $$${WAIVER}$$
  `);
} catch (error) {
  directDecision = error.message;
}
check("approvals cannot be edited directly", /workflow|locked/.test(directDecision), directDecision);

const queue = await asUser(U_SADAR, "authenticated", `select public.my_work_queue(10) as q`);
check("work queue counts pending work", Number(queue.rows[0].q.pending_payments) >= 0 && Array.isArray(queue.rows[0].q.items), JSON.stringify(queue.rows[0].q).slice(0, 160));

// 15c. An expense can be rejected without touching the fund.
const fundRow = await db.query(`select id, balance_paise from public.funds where tenant_id = $$${BHR}$$ order by code limit 1`);
const FUND = fundRow.rows[0].id;
const fundBefore = fundRow.rows[0].balance_paise;

const expIns = await asUser(U_SADAR, "authenticated", `
  insert into public.expenses (tenant_id, fund_id, category, amount_paise, vendor)
  values ($$${BHR}$$, $$${FUND}$$, 'Repair', 120000, 'Carpenter Sahab')
  returning id, status, entered_by
`);
const EXPENSE = expIns.rows[0].id;
check("browser expense starts pending", expIns.rows[0].status === "pending", JSON.stringify(expIns.rows[0]));

let selfReject = "";
try {
  await asUser(U_SADAR, "authenticated", `select public.reject_expense($$${EXPENSE}$$, 'self')`);
} catch (error) {
  selfReject = error.message;
}
check("maker cannot reject own expense", selfReject.includes("Maker cannot reject"), selfReject);

const ledgerBefore = await db.query(`select count(*)::int as n from public.ledger_entries where tenant_id = $$${BHR}$$`);
await asUser(U_SEC, "authenticated", `select public.reject_expense($$${EXPENSE}$$, 'bill photo unreadable')`);

const expAfter = await db.query(`select status, note, approved_by from public.expenses where id = $$${EXPENSE}$$`);
check("another bearer can reject an expense", expAfter.rows[0].status === "rejected", JSON.stringify(expAfter.rows[0]));
check("rejection keeps the reason", expAfter.rows[0].note === "bill photo unreadable", expAfter.rows[0].note);

const fundAfter = await db.query(`select balance_paise from public.funds where id = $$${FUND}$$`);
const ledgerAfter = await db.query(`select count(*)::int as n from public.ledger_entries where tenant_id = $$${BHR}$$`);
check("rejection leaves the fund untouched", Number(fundAfter.rows[0].balance_paise) === Number(fundBefore), `${fundBefore} -> ${fundAfter.rows[0].balance_paise}`);
check("rejection writes no ledger entry", ledgerAfter.rows[0].n === ledgerBefore.rows[0].n, `${ledgerBefore.rows[0].n} -> ${ledgerAfter.rows[0].n}`);

// 15d. A complaint gets its own tracking code and only office can triage it.
const complaintIns = await asUser(U_MEMBER, "authenticated", `
  insert into public.complaints (tenant_id, category, subject, body, anonymous)
  values ($$${BHR}$$, 'Finance', 'Receipt missing', 'I paid in October but got no receipt.', false)
  returning id, tracking_code, status
`);
const COMPLAINT = complaintIns.rows[0].id;
check(
  "member complaint gets a tracking code",
  /^CMP-[0-9A-F]{6}$/.test(complaintIns.rows[0].tracking_code),
  complaintIns.rows[0].tracking_code
);
check("new complaint starts open", complaintIns.rows[0].status === "open");

await asUser(U_MEMBER, "authenticated", `
  update public.complaints set status = 'resolved' where id = $$${COMPLAINT}$$
`);
const stillOpen = await db.query(`select status from public.complaints where id = $$${COMPLAINT}$$`);
check("member cannot resolve someone else's complaint", stillOpen.rows[0].status === "open", stillOpen.rows[0].status);

await asUser(U_SADAR, "authenticated", `
  update public.complaints set status = 'resolved' where id = $$${COMPLAINT}$$
`);
const resolved = await db.query(`select status, resolved_at from public.complaints where id = $$${COMPLAINT}$$`);
check("office bearer can resolve a complaint", resolved.rows[0].status === "resolved", resolved.rows[0].status);
check("resolution time is stamped", resolved.rows[0].resolved_at !== null, String(resolved.rows[0].resolved_at));

// 15e. Prayer timetable: coordinates are office-only, days persist.
await asUser(U_SADAR, "authenticated", `
  update public.tenants set latitude = 26.07, longitude = 83.19 where id = $$${BHR}$$
`);
const geo = await db.query(`select latitude, longitude, timezone from public.tenants where id = $$${BHR}$$`);
check("sadar can set masjid coordinates", Number(geo.rows[0].latitude) === 26.07, String(geo.rows[0].latitude));
check("tenant keeps a timezone", geo.rows[0].timezone === "Asia/Kolkata", geo.rows[0].timezone);

await asUser(U_MEMBER, "authenticated", `
  update public.tenants set latitude = 0 where id = $$${BHR}$$
`);
const geoMember = await db.query(`select latitude from public.tenants where id = $$${BHR}$$`);
check("member cannot move the masjid", Number(geoMember.rows[0].latitude) === 26.07, String(geoMember.rows[0].latitude));

await asUser(U_SADAR, "authenticated", `
  insert into public.prayer_days
    (tenant_id, date, hijri, fajr, zuhr, asr, maghrib, isha, jumuah, source)
  values
    ($$${BHR}$$, '2026-11-13', 'Jumada al-Awwal 2, 1448',
     '05:02', '11:58', '15:10', '17:22', '18:40', '12:20', 'manual')
  on conflict (tenant_id, date) do update
    set fajr = excluded.fajr, source = excluded.source
`);
const prayer = await db.query(`
  select fajr, source from public.prayer_days
  where tenant_id = $$${BHR}$$ and date = '2026-11-13'
`);
check("office bearer can save a prayer day", prayer.rows[0]?.source === "manual", JSON.stringify(prayer.rows[0]));

// 16. Null role / null tenant must never bypass a permission check.
const pending = await asService(`
  insert into public.payments (tenant_id, member_id, amount_paise, method, status)
  values ($$${BHR}$$, $$${MEMBER}$$, 5000, 'cash', 'pending')
  returning id
`);
const PENDING = pending.rows[0].id;

async function asNoProfile(role, sql) {
  await db.exec(`
    select set_config('request.jwt.claim.sub', '', false);
    select set_config('request.jwt.claim.role', $$${role}$$, false);
    set role ${role};
  `);
  try {
    return await db.query(sql);
  } finally {
    await db.exec("reset role");
  }
}

let nullRoleVerify = "";
try {
  await asNoProfile("authenticated", `select public.verify_payment($$${PENDING}$$)`);
} catch (error) {
  nullRoleVerify = error.message;
}
check("tenant-less user cannot verify payments", nullRoleVerify.includes("Not allowed"), nullRoleVerify);

let nullRoleDashboard = "";
try {
  await asNoProfile("authenticated", `select public.dashboard_snapshot(null)`);
} catch (error) {
  nullRoleDashboard = error.message;
}
check("tenant-less user cannot read dashboard", nullRoleDashboard.length > 0, nullRoleDashboard);

let tenantClaim = "";
try {
  await asUser(U_SADAR, "authenticated", `select * from public.claim_notifications(5)`);
} catch (error) {
  tenantClaim = error.message;
}
check("browser cannot claim queue messages", /service|permission denied/i.test(tenantClaim), tenantClaim);

let anonVerify = "";
try {
  await asNoProfile("anon", `select public.verify_payment($$${PENDING}$$)`);
} catch (error) {
  anonVerify = error.message;
}
check("anonymous cannot verify payments", /permission denied|Not allowed/.test(anonVerify), anonVerify);

// ═══════════════════════════════════════════════════════════════
// 17. Security hardening (0011)
// ═══════════════════════════════════════════════════════════════

// A member may not become a super admin.
let escalate = "";
try {
  await asUser(U_MEMBER, "authenticated",
    `update public.profiles set role = 'super_admin' where id = auth.uid()`);
} catch (error) {
  escalate = error.message;
}
check("member cannot escalate own role", escalate.length > 0, escalate);
const memRole = await db.query(`select role, is_active from public.profiles where id = $$${U_MEMBER}$$`);
check("member role unchanged", memRole.rows[0].role === "member", JSON.stringify(memRole.rows[0]));

// ...and may not quietly deactivate themselves either.
let deactivate = "";
try {
  await asUser(U_MEMBER, "authenticated",
    `update public.profiles set is_active = false where id = auth.uid()`);
} catch (error) {
  deactivate = error.message;
}
check("member cannot deactivate own account", deactivate.length > 0, deactivate);

// Self-service on the harmless fields still works.
const rename = await asUser(U_MEMBER, "authenticated",
  `update public.profiles set full_name = 'Idris Updated' where id = auth.uid() returning full_name`);
check("member can still edit own name", rename.rows[0]?.full_name === "Idris Updated",
  JSON.stringify(rename.rows[0]));

// A browser insert cannot arrive as a verified donation.
// (FUND is the same BHR fund used by the expense test above.)
const fakeDonation = await asUser(U_SADAR, "authenticated", `
  insert into public.donations
    (tenant_id, fund_id, donor_name, amount_paise, method, status, receipt_no, verified_by)
  values ($$${BHR}$$, $$${FUND}$$, 'Fake Donor', 100000, 'cash', 'verified', 'D-FAKE-1', $$${U_KHAJ}$$)
  returning id, status, receipt_no, verified_by, entered_by
`);
check("browser donation forced pending", fakeDonation.rows[0].status === "pending",
  JSON.stringify(fakeDonation.rows[0]));
check("browser donation has no receipt", fakeDonation.rows[0].receipt_no === null,
  JSON.stringify(fakeDonation.rows[0]));
check("browser donation has no verifier", fakeDonation.rows[0].verified_by === null,
  JSON.stringify(fakeDonation.rows[0]));
check("browser donation records maker", fakeDonation.rows[0].entered_by === U_SADAR,
  JSON.stringify(fakeDonation.rows[0]));

// The real donation flow: record → another bearer verifies → fund + ledger.
const created = await asUser(U_SADAR, "authenticated",
  `select public.create_donation($$${FUND}$$, 'Haji Test', 500000, 'upi') as id`);
const DON = created.rows[0].id;

let selfVerifyDon = "";
try {
  await asUser(U_SADAR, "authenticated", `select public.verify_donation($$${DON}$$)`);
} catch (error) {
  selfVerifyDon = error.message;
}
check("maker cannot verify own donation", /Maker/.test(selfVerifyDon), selfVerifyDon);

const donFundBefore = await db.query(`select balance_paise from public.funds where id = $$${FUND}$$`);
const donationReceipt = await asUser(U_KHAJ, "authenticated",
  `select public.verify_donation($$${DON}$$) as r`);
const DON_RECEIPT = String(donationReceipt.rows[0].r);
check("khajanchi can verify a donation", /^D-\d{4}-\d{5}$/.test(DON_RECEIPT), donationReceipt.rows[0].r);
const donFundAfter = await db.query(`select balance_paise from public.funds where id = $$${FUND}$$`);
check("donation credits the fund",
  Number(donFundAfter.rows[0].balance_paise) - Number(donFundBefore.rows[0].balance_paise) === 500000,
  JSON.stringify({ before: donFundBefore.rows[0], after: donFundAfter.rows[0] }));
const donationLedger = await db.query(
  `select count(*)::int as n from public.ledger_entries where ref_type = 'donation' and ref_no = $$${DON_RECEIPT}$$`);
check("donation writes a ledger entry", donationLedger.rows[0].n === 1, JSON.stringify(donationLedger.rows[0]));
check("donation ledger chain intact",
  (await db.query(`select public.verify_ledger($$${BHR}$$) as broken`)).rows[0].broken === null);

// A recorded donation is immutable.
let editDonation = "";
try {
  await asUser(U_KHAJ, "authenticated",
    `update public.donations set amount_paise = 900000 where id = $$${DON}$$`);
} catch (error) {
  editDonation = error.message;
}
check("verified donation amount is locked", editDonation.length > 0, editDonation);

// Internal sequence helpers are off-limits to anonymous callers.
let anonReceipt = "";
try {
  await asNoProfile("anon", `select public.next_receipt_no($$${BHR}$$)`);
} catch (error) {
  anonReceipt = error.message;
}
check("anonymous cannot mint a receipt number", /permission denied/i.test(anonReceipt), anonReceipt);

let anonLedger = "";
try {
  await asNoProfile("anon", `select public.verify_ledger($$${BHR}$$)`);
} catch (error) {
  anonLedger = error.message;
}
check("anonymous cannot probe the ledger", /permission denied/i.test(anonLedger), anonLedger);

// Office bearers can still mint one internally.
const minted = await asUser(U_SADAR, "authenticated",
  `select public.next_receipt_no($$${BHR}$$) as r`);
check("office can still mint a receipt number", /^R-\d{4}-\d{5}$/.test(String(minted.rows[0].r)),
  minted.rows[0].r);

// Notice broadcast works for the office and is refused for a member.
const noticeRow = await asUser(U_SADAR, "authenticated", `
  insert into public.notices (tenant_id, title, body, audience)
  values ($$${BHR}$$, 'Hardening Notice', 'Test body', 'all')
  returning id`);
const NOTICE = noticeRow.rows[0].id;
let bcastErr = "";
try {
  await asUser(U_SADAR, "authenticated", `select public.broadcast_notice($$${NOTICE}$$)`);
} catch (error) {
  bcastErr = error.message;
}
check("office bearer can broadcast a notice", bcastErr.length === 0, bcastErr);

let memberBcast = "";
try {
  await asUser(U_MEMBER, "authenticated", `select public.broadcast_notice($$${NOTICE}$$)`);
} catch (error) {
  memberBcast = error.message;
}
check("member cannot broadcast a notice", memberBcast.length > 0, memberBcast);

console.log("\n" + (failures.length === 0 ? "ALL BEHAVIOUR TESTS PASSED" : `FAILURES: ${failures.join(", ")}`));
if (failures.length) process.exit(1);
