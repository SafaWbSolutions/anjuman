-- ═══════════════════════════════════════════════════════════════
-- 0041 · One-off import: Raziya Manzil old PHP app
--
-- Source: u409071687_raziya_manzil.sql (other project)
-- Target: tenant code RMHC / name "Raziya Manzil..."
--
-- What is imported
--   • 37 members (admins excluded)
--   • 232 monthly invoices built from old monthly_dues
--     plus every month that has a verified payment
--   • 217 verified receipts (₹25100.00)
--   • 3 approved expenses (₹2477.00)
--   • 2 gifts/donations (₹1500.00)
--
-- Rules
--   • Idempotent: members carry notes 'old-app:user:<id>'; invoices use
--     the natural key (tenant, member, period); receipts use OLD-<id>.
--   • Phone numbers are kept exactly as the old app had them. Two are
--     UAE numbers (+971...), so the "10 digit" rule is relaxed for them.
--   • Old passwords are NOT imported (bcrypt hashes cannot be used by
--     Supabase Auth). Members keep their data but need a fresh login.
--   • Old monthly_dues statuses were stale (many "due" rows already had
--     a payment). Allocation therefore follows the verified payments,
--     not the stale status flags.
-- ═══════════════════════════════════════════════════════════════

-- Resolve the tenant once for the whole script.
drop table if exists pg_temp._rz_tenant;
create temp table _rz_tenant (id uuid);
insert into _rz_tenant (id)
select id from public.tenants
 where code = 'RMHC' or name ilike '%Raziya Manzil%'
 order by (code = 'RMHC') desc, created_at asc
 limit 1;

do $$
begin
  if not exists (select 1 from _rz_tenant) then
    raise notice 'Raziya Manzil tenant not found — import skipped';
  end if;
end $$;

-- The General Fund must exist before the receipts land, otherwise the
-- fund balance would not move.
insert into public.funds (tenant_id, code, name, restricted, balance_paise)
select t.id, 'GEN', 'General Fund', false, 0
  from _rz_tenant t
 where not exists (
   select 1 from public.funds f
    where f.tenant_id = t.id and f.code = 'GEN'
 );

-- ── 0. Safety fix: enum-safe notification text ─────────────────
-- `upper(payment_method)` fails on a plain enum in some Postgres
-- builds. Cast to text so the import (and normal payments) can never
-- trip on the notification trigger.
create or replace function public.notify_payment_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_amount text := to_char(new.amount_paise / 100.0, 'FM999999990.00');
  v_old    text := to_char(old.amount_paise / 100.0, 'FM999999990.00');
  v_method text := upper(new.method::text);
begin
  if tg_op = 'INSERT' then
    perform public.notify_member(
      new.member_id, 'payment',
      'Payment ₹' || v_amount || ' entry hui',
      'Aapki ₹' || v_amount || ' payment '
        || case when new.status = 'verified' then 'verify ho gayi' else 'approval ke liye pending hai' end
        || ' · ' || v_method
        || coalesce(' · ' || nullif(new.reference, ''), ''),
      jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                         'status', new.status));
  elsif tg_op = 'UPDATE' then
    if new.status = 'verified' and old.status is distinct from 'verified' then
      perform public.notify_member(
        new.member_id, 'payment',
        'Payment ₹' || v_amount || ' verified',
        'Receipt ' || coalesce(new.receipt_no, '—')
          || ' · ' || v_method,
        jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                           'status', new.status, 'receipt_no', new.receipt_no));
    elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
      perform public.notify_member(
        new.member_id, 'payment',
        'Payment ₹' || v_amount || ' reject / reset hui',
        coalesce(nullif(new.note, ''), 'Office ne is entry ko reject kiya'),
        jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                           'status', new.status));
    elsif new.status = 'pending' and old.status = 'rejected' then
      perform public.notify_member(
        new.member_id, 'payment',
        'Payment ₹' || v_amount || ' dobara pending',
        'Office ne entry update ki hai — approval baaki hai',
        jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                           'status', new.status));
    end if;

    if new.amount_paise is distinct from old.amount_paise then
      perform public.notify_member(
        new.member_id, 'approval',
        'Payment amount badla: ₹' || v_old || ' → ₹' || v_amount,
        'Receipt ' || coalesce(new.receipt_no, '—')
          || ' · approved correction ke baad hi final maana jayega',
        jsonb_build_object('payment_id', new.id,
                           'old_amount_paise', old.amount_paise,
                           'amount_paise', new.amount_paise));
    end if;
  end if;
  return new;
end $$;

-- ── A. Members ──────────────────────────────────────────────────
insert into public.members
  (tenant_id, name, father_name, phone, email, household, mohalla,
   member_type, status, fee_paise, joined_on, notes)
select t.id,
       v.name,
       coalesce(nullif(v.father_name, 'NULL'), ''),
       coalesce(nullif(v.phone, 'NULL'), ''),
       nullif(v.email, 'NULL'),
       '', '',
       'member'::member_type,
       'active'::member_status,
       10000,
       v.joined_on::date,
       'old-app:user:' || v.old_id
  from _rz_tenant t
  cross join (values
    (7, 'Tanvir Hasan', 'Asif Ansari', '9867092904', null, '2026-03-18'),
    (8, 'Tahir Hasan', 'Asif Ansari', '7250414080', 'tahirkhan0026@gmail.com', '2026-03-18'),
    (9, 'Tanjim ansari', 'Jakir ansari', '6200104011', null, '2026-03-19'),
    (10, 'Mohammad Shahid Ansari', 'Md hasim', '9004845101', null, '2026-03-19'),
    (11, 'Mohd Zahid Ali', 'Abdul Gafur', '9431533621', null, '2026-04-02'),
    (12, 'Umar Ansari', 'Shahban Ansari', '9650853935', null, '2026-04-02'),
    (13, 'Md Sanul Ansari', 'Shahban Ansari', '8603871745', null, '2026-04-02'),
    (14, 'Abdul Samad Ansari', 'Hasim Ansari', '7738541604', null, '2026-04-02'),
    (15, 'Md Tabrez Hasan', 'Asif Ansari', '7646079279', null, '2026-04-02'),
    (16, 'Md Waris Ansari', 'Yunus Ansari', '8850961352', null, '2026-04-02'),
    (17, 'Md Anwar Ansari', 'Ayub Ansari', '7304676837', null, '2026-04-02'),
    (18, 'Rijwanullah Tabish', 'Mohd Zahid Ali', '7070390786', null, '2026-04-02'),
    (19, 'Md Sabid', 'Md Islam', '9076140554', null, '2026-04-02'),
    (20, 'Md Manowar Ansari', 'Abdul Majid', '6299572106', null, '2026-04-02'),
    (21, 'Tauheed Ansari', 'Monowar Ansari', '9856456558', null, '2026-04-02'),
    (22, 'Sanuwwar Ansari', 'Manowar Ansari', '+971545141530', null, '2026-04-02'),
    (23, 'Faruk Ansari', 'Shahban Ansari', '8757592158', null, '2026-04-02'),
    (24, 'Md Shaukat abdul Gafur Ansari', 'Abdul Gafur', '9930986819', null, '2026-04-02'),
    (25, 'Md Nisar', 'Md Idris', '6205921152', null, '2026-04-02'),
    (26, 'Sanul Shaukat Ansari (Mumbai)', 'Shaukat Ansari', '8369927384', null, '2026-04-02'),
    (27, 'Shakil Ansari', 'Sajid Ansari', '9304965270', null, '2026-04-02'),
    (28, 'Md Irfan Ansari', 'Musaffar Ansari', '8969208167', null, '2026-04-02'),
    (29, 'Sohail Ansari', 'Mokarram Ansari', '7900073293', null, '2026-04-02'),
    (30, 'Musaffar Ansari', 'Abdul Majid', '9865655456', null, '2026-04-02'),
    (31, 'Aslam Ansari', 'Ayub Ansari', '9093619881', null, '2026-04-02'),
    (32, 'Md Zakir', 'Shahban Ansari', '8452918815', null, '2026-04-02'),
    (33, 'Md Saklen', 'Yunus Ansari', '8928617845', null, '2026-04-02'),
    (34, 'Mujahir Ansari', 'Abdul Majid', '8809476129', null, '2026-04-02'),
    (35, 'Taufik Ansari', 'Yunus Ansari', '8928483857', null, '2026-04-02'),
    (36, 'Ayyub Ansari (Guddu)', 'Shahban Ansari', '9122747348', null, '2026-04-02'),
    (37, 'Arif Ansari', 'Shahban Ansari', '9702509491', null, '2026-04-02'),
    (39, 'Jubair Ansari', 'Md Ali', '8828060091', null, '2026-04-02'),
    (40, 'Md Saddam', 'Md Kalam', '8271863242', null, '2026-04-02'),
    (41, 'Akbar Ansari', 'Ayub Ansari', '6006801371', null, '2026-04-02'),
    (43, 'Javed (Saudi)', 'Islam Ansari', '+971542190179', null, '2026-04-11'),
    (44, 'Aftab Ansari (Sonu)', 'Yunus Ansari', '9699794906', null, '2026-04-13'),
    (45, 'Md Samid (Harkatwa)', null, '9890173782', null, '2026-06-13')
  ) as v(old_id, name, father_name, phone, email, joined_on)
 where not exists (
   select 1 from public.members m
    where m.tenant_id = t.id
      and m.notes = 'old-app:user:' || v.old_id
 );

-- ── B. Invoices (old dues + payment months) ────────────────────
insert into public.invoices
  (tenant_id, member_id, period, amount_paise, paid_paise, due_date)
select t.id,
       m.id,
       v.period,
       v.amount_paise,
       0,
       (v.period || '-10')::date
  from _rz_tenant t
  join public.members m
    on m.tenant_id = t.id
   and m.notes like 'old-app:user:%'
  join (values
    (7, '2025-12', 20000),
    (7, '2026-01', 10000),
    (7, '2026-02', 10000),
    (7, '2026-03', 10000),
    (7, '2026-04', 10000),
    (8, '2025-12', 20000),
    (8, '2026-01', 10000),
    (8, '2026-02', 10000),
    (8, '2026-03', 10000),
    (8, '2026-04', 10000),
    (8, '2026-05', 10000),
    (8, '2026-06', 10000),
    (9, '2025-12', 20000),
    (9, '2026-01', 10000),
    (9, '2026-03', 10000),
    (9, '2026-04', 10000),
    (10, '2025-12', 20000),
    (10, '2026-01', 10000),
    (10, '2026-02', 10000),
    (10, '2026-03', 10000),
    (10, '2026-04', 10000),
    (10, '2026-05', 10000),
    (10, '2026-06', 10000),
    (10, '2026-07', 10000),
    (10, '2026-08', 10000),
    (10, '2026-09', 10000),
    (10, '2026-10', 10000),
    (10, '2026-11', 10000),
    (10, '2026-12', 10000),
    (11, '2025-12', 20000),
    (11, '2026-01', 10000),
    (11, '2026-02', 10000),
    (11, '2026-03', 10000),
    (11, '2026-04', 10000),
    (11, '2026-05', 10000),
    (11, '2026-06', 10000),
    (11, '2026-07', 10000),
    (11, '2026-08', 10000),
    (11, '2026-09', 10000),
    (12, '2025-12', 20000),
    (12, '2026-04', 10000),
    (13, '2025-12', 20000),
    (13, '2026-01', 10000),
    (13, '2026-02', 10000),
    (13, '2026-03', 10000),
    (13, '2026-04', 10000),
    (13, '2026-05', 10000),
    (13, '2026-06', 10000),
    (13, '2026-07', 10000),
    (13, '2026-08', 10000),
    (14, '2025-12', 20000),
    (14, '2026-01', 10000),
    (14, '2026-02', 10000),
    (14, '2026-03', 10000),
    (14, '2026-04', 10000),
    (14, '2026-05', 10000),
    (14, '2026-06', 10000),
    (14, '2026-07', 10000),
    (14, '2026-08', 10000),
    (14, '2026-09', 10000),
    (14, '2026-10', 10000),
    (14, '2026-11', 10000),
    (14, '2026-12', 10000),
    (15, '2025-12', 20000),
    (15, '2026-01', 10000),
    (15, '2026-02', 10000),
    (15, '2026-03', 10000),
    (15, '2026-04', 10000),
    (15, '2026-05', 10000),
    (15, '2026-06', 10000),
    (15, '2026-07', 10000),
    (15, '2026-08', 10000),
    (15, '2026-09', 10000),
    (16, '2025-12', 20000),
    (16, '2026-01', 10000),
    (16, '2026-02', 10000),
    (16, '2026-03', 10000),
    (16, '2026-04', 10000),
    (17, '2025-12', 20000),
    (17, '2026-01', 10000),
    (17, '2026-02', 10000),
    (17, '2026-03', 10000),
    (17, '2026-04', 10000),
    (17, '2026-05', 10000),
    (17, '2026-06', 10000),
    (17, '2026-07', 10000),
    (17, '2026-08', 10000),
    (18, '2025-12', 20000),
    (18, '2026-01', 10000),
    (18, '2026-02', 10000),
    (18, '2026-03', 10000),
    (18, '2026-04', 10000),
    (18, '2026-05', 10000),
    (18, '2026-06', 10000),
    (18, '2026-07', 10000),
    (18, '2026-08', 10000),
    (18, '2026-09', 10000),
    (19, '2025-12', 20000),
    (19, '2026-01', 10000),
    (19, '2026-04', 10000),
    (20, '2025-12', 20000),
    (20, '2026-01', 10000),
    (20, '2026-02', 10000),
    (20, '2026-03', 10000),
    (20, '2026-04', 10000),
    (20, '2026-05', 10000),
    (20, '2026-06', 10000),
    (20, '2026-07', 10000),
    (20, '2026-08', 10000),
    (21, '2025-12', 20000),
    (21, '2026-01', 10000),
    (21, '2026-03', 10000),
    (21, '2026-04', 10000),
    (21, '2026-05', 10000),
    (21, '2026-06', 10000),
    (21, '2026-07', 10000),
    (21, '2026-08', 10000),
    (22, '2025-12', 20000),
    (22, '2026-01', 10000),
    (22, '2026-02', 10000),
    (22, '2026-03', 10000),
    (22, '2026-04', 10000),
    (22, '2026-05', 10000),
    (22, '2026-06', 10000),
    (22, '2026-07', 10000),
    (22, '2026-08', 10000),
    (23, '2025-12', 20000),
    (23, '2026-01', 10000),
    (23, '2026-02', 10000),
    (23, '2026-03', 10000),
    (23, '2026-04', 10000),
    (24, '2025-12', 20000),
    (24, '2026-01', 10000),
    (24, '2026-02', 10000),
    (24, '2026-03', 10000),
    (24, '2026-04', 10000),
    (24, '2026-05', 10000),
    (24, '2026-06', 10000),
    (24, '2026-07', 10000),
    (24, '2026-08', 10000),
    (25, '2025-12', 20000),
    (25, '2026-04', 10000),
    (26, '2025-12', 20000),
    (26, '2026-01', 10000),
    (26, '2026-02', 10000),
    (26, '2026-03', 10000),
    (26, '2026-04', 10000),
    (26, '2026-05', 10000),
    (26, '2026-06', 10000),
    (26, '2026-07', 10000),
    (26, '2026-08', 10000),
    (27, '2025-12', 20000),
    (27, '2026-01', 10000),
    (27, '2026-02', 10000),
    (27, '2026-03', 10000),
    (27, '2026-04', 10000),
    (28, '2025-12', 20000),
    (28, '2026-04', 10000),
    (29, '2025-12', 20000),
    (29, '2026-01', 10000),
    (29, '2026-02', 10000),
    (29, '2026-03', 10000),
    (29, '2026-04', 10000),
    (29, '2026-05', 10000),
    (29, '2026-06', 10000),
    (29, '2026-07', 10000),
    (29, '2026-08', 10000),
    (30, '2025-12', 20000),
    (30, '2026-04', 10000),
    (31, '2025-12', 20000),
    (31, '2026-01', 10000),
    (31, '2026-02', 10000),
    (31, '2026-03', 10000),
    (31, '2026-04', 10000),
    (31, '2026-05', 10000),
    (31, '2026-06', 10000),
    (31, '2026-07', 10000),
    (31, '2026-08', 10000),
    (32, '2025-12', 20000),
    (32, '2026-04', 10000),
    (33, '2025-12', 20000),
    (33, '2026-04', 10000),
    (34, '2025-12', 20000),
    (34, '2026-01', 10000),
    (34, '2026-02', 10000),
    (34, '2026-03', 10000),
    (34, '2026-04', 10000),
    (34, '2026-05', 10000),
    (34, '2026-06', 10000),
    (35, '2025-12', 20000),
    (35, '2026-01', 10000),
    (35, '2026-02', 10000),
    (35, '2026-03', 10000),
    (35, '2026-04', 10000),
    (35, '2026-07', 10000),
    (36, '2025-12', 20000),
    (36, '2026-04', 10000),
    (37, '2025-12', 20000),
    (37, '2026-01', 10000),
    (37, '2026-02', 10000),
    (37, '2026-03', 10000),
    (37, '2026-04', 10000),
    (37, '2026-05', 10000),
    (37, '2026-06', 10000),
    (39, '2025-12', 10000),
    (39, '2026-01', 10000),
    (39, '2026-04', 10000),
    (40, '2026-04', 10000),
    (41, '2025-12', 20000),
    (41, '2026-01', 10000),
    (41, '2026-02', 10000),
    (41, '2026-03', 10000),
    (41, '2026-04', 10000),
    (41, '2026-05', 10000),
    (41, '2026-06', 10000),
    (41, '2026-07', 10000),
    (41, '2026-08', 10000),
    (43, '2025-12', 20000),
    (43, '2026-01', 10000),
    (43, '2026-02', 10000),
    (43, '2026-03', 10000),
    (43, '2026-04', 10000),
    (43, '2026-05', 10000),
    (43, '2026-06', 10000),
    (43, '2026-07', 10000),
    (43, '2026-08', 10000),
    (43, '2026-09', 10000),
    (43, '2026-10', 10000),
    (45, '2025-12', 20000),
    (45, '2026-01', 10000),
    (45, '2026-02', 10000),
    (45, '2026-03', 10000)
  ) as v(old_id, period, amount_paise)
    on v.old_id = replace(m.notes, 'old-app:user:', '')::int
on conflict (tenant_id, member_id, period) do nothing;

-- ── C. Verified receipts ───────────────────────────────────────
insert into public.payments
  (tenant_id, member_id, amount_paise, method, reference, status,
   receipt_no, period_from, period_to, entered_by, verified_by,
   verified_at, note, created_at, unallocated_paise)
select t.id,
       m.id,
       v.amount_paise,
       v.method::payment_method,
       null,
       'verified'::payment_status,
       'OLD-' || v.old_id,
       v.period,
       v.period,
       null, null,
       v.created_at::timestamptz,
       v.note,
       v.created_at::timestamptz,
       0
  from _rz_tenant t
  join public.members m
    on m.tenant_id = t.id
   and m.notes like 'old-app:user:%'
  join (values
    (10, 11, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:38:54'),
    (11, 7, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:39:28'),
    (12, 12, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:39:54'),
    (13, 13, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:44:24'),
    (14, 14, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:44:58'),
    (15, 8, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:45:19'),
    (16, 15, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:45:39'),
    (17, 9, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:46:01'),
    (18, 16, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:46:32'),
    (19, 17, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:46:55'),
    (20, 18, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:49:07'),
    (21, 19, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:49:53'),
    (22, 20, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:50:23'),
    (23, 21, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:50:49'),
    (24, 22, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:51:09'),
    (25, 23, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:51:39'),
    (26, 24, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:52:17'),
    (27, 25, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:52:53'),
    (28, 26, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:53:17'),
    (29, 27, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:53:45'),
    (30, 10, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:54:16'),
    (31, 28, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:54:36'),
    (32, 29, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:55:01'),
    (33, 30, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:55:36'),
    (34, 31, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:55:52'),
    (35, 32, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:56:20'),
    (36, 33, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:56:45'),
    (37, 34, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:57:10'),
    (38, 35, 20000, 'upi', 'Imported · December Mahine ka Joining fee aur Maintenance Fee', '2025-12', '2025-12-04 12:57:27'),
    (39, 36, 20000, 'upi', 'Imported · December mahine ka Joining Fee Aur Maintenance fee', '2025-12', '2025-12-04 12:57:52'),
    (40, 11, 10000, 'upi', 'Imported · Maintenance fee of January 2026', '2026-01', '2026-01-17 23:43:41'),
    (41, 11, 10000, 'upi', 'Imported · Maintenance fee of February 2026', '2026-02', '2026-01-17 23:44:25'),
    (42, 11, 10000, 'cash', 'Imported · Maintenance fee of March 2026', '2026-03', '2026-03-07 23:45:02'),
    (44, 11, 10000, 'cash', 'Imported · Maintenance fee of April 2026', '2026-04', '2026-03-07 23:45:28'),
    (45, 8, 10000, 'cash', 'Imported · Maintenance fee of January 2026', '2026-01', '2026-01-01 23:57:55'),
    (46, 8, 10000, 'cash', 'Imported · Maintenance fee of February 2026 self paid', '2026-02', '2026-02-01 23:58:21'),
    (48, 8, 10000, 'cash', 'Imported · Maintenance fee of April 2026 Self Paid', '2026-04', '2026-04-01 23:59:15'),
    (50, 7, 10000, 'cash', 'Imported · Payment', '2026-01', '2026-01-02 00:07:03'),
    (51, 13, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-01 09:08:04'),
    (52, 14, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-12-31 09:09:04'),
    (53, 15, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:09:37'),
    (54, 9, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-02 09:10:31'),
    (55, 16, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-20 09:11:03'),
    (56, 17, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-02-01 09:11:22'),
    (57, 18, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:11:52'),
    (58, 19, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-01 09:12:15'),
    (59, 20, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:12:43'),
    (60, 21, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:13:04'),
    (61, 22, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:13:26'),
    (62, 23, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-03 09:13:47'),
    (63, 24, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:14:15'),
    (64, 26, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:14:38'),
    (65, 27, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-02 09:15:01'),
    (66, 10, 10000, 'upi', 'Imported · Payment', '2026-01', '2025-12-31 09:16:04'),
    (67, 29, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-02 09:16:28'),
    (68, 31, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-02 09:16:49'),
    (69, 39, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-01-20 09:17:14'),
    (70, 14, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-03 09:30:28'),
    (71, 14, 10000, 'upi', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-03', '2026-02-03 09:31:49'),
    (72, 14, 10000, 'cash', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-04', '2026-02-03 09:32:01'),
    (73, 14, 10000, 'upi', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-05', '2026-02-03 09:32:11'),
    (75, 14, 10000, 'upi', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-06', '2026-02-03 09:32:33'),
    (76, 14, 10000, 'cash', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-07', '2026-02-03 09:32:46'),
    (77, 14, 10000, 'cash', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-08', '2026-02-03 09:32:56'),
    (78, 14, 10000, 'cash', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-09', '2026-02-03 09:33:12'),
    (79, 14, 10000, 'upi', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-10', '2026-02-03 09:33:24'),
    (80, 14, 10000, 'upi', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-11', '2026-02-03 09:33:37'),
    (81, 14, 10000, 'upi', 'Imported · February Mahine me hi 1200 poore ek saal ka jama kiya gaya', '2026-12', '2026-02-03 09:33:48'),
    (82, 18, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-05 09:39:27'),
    (83, 20, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-01 09:39:54'),
    (84, 21, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-02-01 09:40:10'),
    (85, 22, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-01 09:40:31'),
    (86, 10, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-03 09:41:37'),
    (87, 10, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-02-03 09:41:46'),
    (88, 10, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-03 09:41:56'),
    (90, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-05', '2026-02-03 09:42:52'),
    (92, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-06', '2026-02-03 09:43:12'),
    (93, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-07', '2026-02-03 09:43:25'),
    (94, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-08', '2026-02-03 09:43:36'),
    (95, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-09', '2026-02-03 09:43:47'),
    (96, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-10', '2026-02-03 09:44:05'),
    (97, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-11', '2026-02-03 09:44:18'),
    (98, 10, 10000, 'upi', 'Imported · february 2026 se january 2027 tak advance paid', '2026-12', '2026-02-03 09:44:30'),
    (99, 29, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-02 09:46:40'),
    (100, 31, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-02-03 09:47:01'),
    (102, 18, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-07 09:48:12'),
    (103, 20, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-04 09:49:38'),
    (104, 21, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-04 09:53:38'),
    (105, 22, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-04 09:53:55'),
    (106, 24, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-04 09:54:38'),
    (107, 26, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-04 09:55:04'),
    (109, 15, 10000, 'upi', 'Imported · Phone pe se paid', '2026-03', '2026-04-04 20:44:58'),
    (110, 24, 10000, 'upi', 'Imported · Phone pe business me jama', '2026-02', '2026-01-16 21:58:32'),
    (111, 24, 10000, 'upi', 'Imported · Phone pe business me jama', '2026-04', '2026-04-03 22:00:17'),
    (112, 26, 10000, 'upi', 'Imported · Phone pe business se jama', '2026-02', '2026-01-16 22:00:59'),
    (115, 8, 10000, 'upi', 'Imported · 30262622', '2026-03', '2026-04-09 21:22:20'),
    (116, 29, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-03-03 10:30:17'),
    (117, 29, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-10 10:30:35'),
    (118, 16, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-04 10:36:10'),
    (119, 16, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-04-10 10:36:24'),
    (120, 20, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-07 10:37:04'),
    (121, 22, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-07 10:37:34'),
    (122, 21, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-07 10:37:51'),
    (123, 18, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-04 10:38:17'),
    (124, 41, 20000, 'upi', 'Imported · Payment', '2025-12', '2026-04-09 10:39:11'),
    (125, 41, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-04-09 10:39:40'),
    (126, 41, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-09 10:40:05'),
    (127, 41, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-04-09 10:40:19'),
    (128, 41, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-09 10:40:30'),
    (129, 41, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-04-09 10:41:01'),
    (130, 41, 10000, 'upi', 'Imported · Payment', '2026-06', '2026-04-09 10:41:39'),
    (131, 41, 10000, 'upi', 'Imported · Payment', '2026-07', '2026-04-09 10:41:52'),
    (132, 41, 10000, 'upi', 'Imported · Payment', '2026-08', '2026-04-09 10:42:03'),
    (133, 26, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-04 10:55:28'),
    (135, 15, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-10 18:05:37'),
    (136, 39, 10000, 'upi', 'Imported · 10-04-2026 ko 100 payment diya jo december me entry hua', '2025-12', '2026-04-10 18:23:20'),
    (137, 34, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-04-10 19:48:45'),
    (138, 34, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-10 19:50:15'),
    (139, 34, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-04-10 19:50:33'),
    (140, 43, 20000, 'cash', 'Imported · 100+100 (2Bar me diya h)', '2025-12', '2026-04-17 13:36:16'),
    (141, 13, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-11 17:45:37'),
    (142, 13, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-04-11 17:45:51'),
    (143, 23, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-12 21:34:54'),
    (144, 23, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-04-12 21:35:06'),
    (145, 23, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-12 21:35:15'),
    (146, 43, 10000, 'cash', 'Imported · Tanveer ko diya', '2026-01', '2026-04-13 22:25:37'),
    (147, 43, 10000, 'upi', 'Imported · Abid Diya', '2026-02', '2026-04-13 22:34:53'),
    (148, 43, 10000, 'upi', 'Imported · Abid Diya', '2026-03', '2026-04-13 22:35:10'),
    (149, 43, 10000, 'upi', 'Imported · Abid diya', '2026-04', '2026-04-13 22:35:22'),
    (150, 27, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-04-16 12:16:30'),
    (151, 27, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-04-16 12:16:41'),
    (152, 27, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-04-16 12:16:59'),
    (153, 35, 10000, 'upi', 'Imported · Phone pe business QR code me jama', '2026-01', '2026-04-22 20:41:16'),
    (154, 35, 10000, 'upi', 'Imported · Phone pe business QR code me jama', '2026-02', '2026-04-22 20:41:43'),
    (155, 18, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-03 21:42:50'),
    (156, 29, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-04 13:00:33'),
    (157, 20, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-05 20:28:35'),
    (158, 22, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-05 20:28:55'),
    (159, 21, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-05 20:29:12'),
    (160, 24, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-05 21:24:13'),
    (161, 26, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-05 21:24:27'),
    (162, 11, 10000, 'upi', 'Imported · 446633951481', '2026-05', '2026-05-10 17:24:27'),
    (163, 11, 10000, 'upi', 'Imported · 446633951481', '2026-06', '2026-05-10 17:26:09'),
    (164, 43, 10000, 'cash', 'Imported · Islam fufa laa kar diye', '2026-05', '2026-05-17 10:12:48'),
    (165, 37, 20000, 'upi', 'Imported · Payment', '2025-12', '2026-05-28 19:42:14'),
    (170, 37, 10000, 'upi', 'Imported · Payment', '2026-01', '2026-05-28 19:51:08'),
    (171, 37, 10000, 'upi', 'Imported · Payment', '2026-02', '2026-05-28 19:51:18'),
    (172, 37, 10000, 'upi', 'Imported · Payment', '2026-03', '2026-05-28 19:51:28'),
    (173, 37, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-05-28 19:52:53'),
    (174, 37, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-28 19:53:13'),
    (175, 37, 10000, 'upi', 'Imported · Payment', '2026-06', '2026-05-28 19:54:09'),
    (176, 15, 10000, 'upi', 'Imported · Payment', '2026-04', '2026-05-28 22:41:25'),
    (177, 15, 10000, 'upi', 'Imported · Payment', '2026-05', '2026-05-28 22:41:57'),
    (178, 29, 10000, 'upi', 'Imported · Payment', '2026-06', '2026-06-03 13:41:11'),
    (179, 18, 10000, 'upi', 'Imported · Payment', '2026-06', '2026-06-03 13:48:15'),
    (180, 15, 10000, 'upi', 'Imported · Payment', '2026-06', '2026-06-03 13:51:02'),
    (181, 8, 10000, 'cash', 'Imported · Payment', '2026-05', '2026-06-07 01:28:12'),
    (185, 8, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-08 10:45:14'),
    (186, 43, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-16 11:06:27'),
    (187, 24, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-18 17:45:55'),
    (188, 26, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-18 17:46:28'),
    (190, 11, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-06-18 19:38:48'),
    (191, 20, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-18 19:44:10'),
    (192, 22, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-18 19:46:41'),
    (193, 21, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-06-18 19:47:53'),
    (194, 24, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-07-30 12:17:59'),
    (195, 26, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-07-30 12:18:24'),
    (196, 18, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-07-30 12:46:21'),
    (197, 15, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-07-30 12:49:11'),
    (199, 35, 10000, 'cash', 'Imported · Payment', '2026-03', '2026-07-30 13:11:24'),
    (200, 22, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-02 20:14:03'),
    (201, 22, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-02 20:14:26'),
    (202, 21, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-02 20:14:56'),
    (203, 21, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-02 20:15:08'),
    (204, 20, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-02 20:15:41'),
    (205, 20, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-02 20:15:58'),
    (206, 31, 10000, 'cash', 'Imported · Payment', '2026-03', '2026-08-02 20:22:14'),
    (207, 31, 10000, 'cash', 'Imported · Payment', '2026-04', '2026-08-02 20:22:30'),
    (208, 31, 10000, 'cash', 'Imported · Payment', '2026-05', '2026-08-02 20:22:41'),
    (209, 31, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-08-02 20:22:49'),
    (210, 31, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-02 20:23:00'),
    (211, 17, 10000, 'cash', 'Imported · Payment', '2026-02', '2026-08-02 20:23:28'),
    (212, 17, 10000, 'cash', 'Imported · Payment', '2026-03', '2026-08-02 20:23:38'),
    (213, 17, 10000, 'cash', 'Imported · Payment', '2026-04', '2026-08-02 20:23:50'),
    (214, 17, 10000, 'cash', 'Imported · Payment', '2026-05', '2026-08-02 20:24:00'),
    (215, 17, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-08-02 20:24:14'),
    (216, 17, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-02 20:24:25'),
    (217, 11, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-02 23:11:03'),
    (218, 29, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-06 23:11:56'),
    (219, 29, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-06 23:12:10'),
    (220, 43, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-09 09:47:54'),
    (221, 43, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-09 09:48:21'),
    (222, 26, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-15 21:54:12'),
    (223, 24, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-15 21:54:47'),
    (224, 18, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-18 08:27:33'),
    (225, 15, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-18 08:35:03'),
    (226, 31, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-18 11:38:46'),
    (227, 17, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-18 11:39:58'),
    (228, 13, 10000, 'cash', 'Imported · Payment', '2026-04', '2026-08-18 11:41:42'),
    (229, 13, 10000, 'cash', 'Imported · Payment', '2026-05', '2026-08-18 11:41:54'),
    (230, 13, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-08-18 11:42:03'),
    (231, 13, 10000, 'cash', 'Imported · Payment', '2026-07', '2026-08-18 11:42:10'),
    (232, 13, 10000, 'cash', 'Imported · Payment', '2026-08', '2026-08-18 11:42:18'),
    (233, 34, 10000, 'cash', 'Imported · Payment', '2026-04', '2026-08-27 21:12:46'),
    (234, 34, 10000, 'cash', 'Imported · Payment', '2026-05', '2026-08-27 21:12:56'),
    (235, 34, 10000, 'cash', 'Imported · Payment', '2026-06', '2026-08-27 21:13:02'),
    (236, 18, 10000, 'cash', 'Imported · Payment', '2026-09', '2026-09-04 07:51:31'),
    (237, 43, 10000, 'cash', 'Imported · Payment', '2026-09', '2026-09-04 07:56:38'),
    (238, 7, 10000, 'cash', 'Imported · Payment', '2026-02', '2026-09-04 08:00:18'),
    (239, 7, 10000, 'cash', 'Imported · Payment', '2026-03', '2026-09-04 08:05:57'),
    (240, 45, 20000, 'cash', 'Imported · Payment', '2025-12', '2026-09-06 10:11:31'),
    (242, 45, 10000, 'cash', 'Imported · Payment', '2026-01', '2026-09-06 10:13:45'),
    (243, 45, 10000, 'cash', 'Imported · Payment', '2026-02', '2026-09-06 10:13:56'),
    (244, 45, 10000, 'cash', 'Imported · Payment', '2026-03', '2026-09-06 10:14:04'),
    (245, 15, 10000, 'cash', 'Imported · Payment', '2026-09', '2026-09-06 21:42:34'),
    (246, 11, 10000, 'cash', 'Imported · Payment', '2026-09', '2026-09-06 21:42:42'),
    (247, 43, 10000, 'cash', 'Imported · Payment', '2026-10', '2026-10-09 22:37:04')
  ) as v(old_id, old_user_id, amount_paise, method, note, period, created_at)
    on v.old_user_id = replace(m.notes, 'old-app:user:', '')::int
 where not exists (
   select 1 from public.payments p
    where p.tenant_id = t.id and p.receipt_no = 'OLD-' || v.old_id
 );

-- ── D. Ledger entries for the imported receipts ────────────────
insert into public.ledger_entries
  (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
   ref_type, ref_no, created_by)
select p.tenant_id,
       p.created_at::date,
       case when p.method = 'cash' then 'Cash' else 'Bank' end,
       'Imported old-app receipt · ' || m.name,
       p.amount_paise, 0,
       'import', p.receipt_no, null
  from public.payments p
  join public.members m on m.id = p.member_id
  join _rz_tenant t on t.id = p.tenant_id
 where p.receipt_no like 'OLD-%'
   and not exists (
     select 1 from public.ledger_entries l
      where l.tenant_id = p.tenant_id
        and l.ref_type = 'import'
        and l.ref_no = p.receipt_no
   )
 order by p.created_at, p.receipt_no;

-- ── E. Allocate receipts to invoices (period first, then oldest) ─
do $$
declare
  p      record;
  r      record;
  v_inv  uuid;
  v_due  bigint;
  v_take bigint;
  v_left bigint;
begin
  for p in
    select pay.id, pay.tenant_id, pay.member_id, pay.amount_paise, pay.period_from
      from public.payments pay
      join _rz_tenant t on t.id = pay.tenant_id
     where pay.receipt_no like 'OLD-%'
       and not exists (
         select 1 from public.payment_allocations a where a.payment_id = pay.id
       )
     order by pay.created_at, pay.receipt_no
  loop
    v_left := p.amount_paise;

    -- Prefer the invoice of the same month.
    v_inv := null;
    select i.id into v_inv
      from public.invoices i
     where i.tenant_id = p.tenant_id
       and i.member_id = p.member_id
       and i.period = p.period_from
       and i.status in ('pending', 'partial')
     limit 1;

    if v_inv is not null then
      select amount_paise - paid_paise into v_due
        from public.invoices where id = v_inv for update;
      v_take := least(v_due, v_left);
      if v_take > 0 then
        update public.invoices set paid_paise = paid_paise + v_take where id = v_inv;
        insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
        values (p.id, v_inv, v_take)
        on conflict (payment_id, invoice_id) do update
          set amount_paise = public.payment_allocations.amount_paise + excluded.amount_paise;
        v_left := v_left - v_take;
      end if;
    end if;

    -- Any remainder goes to the oldest open dues (advance).
    for r in
      select i.id, i.amount_paise - i.paid_paise as due
        from public.invoices i
       where i.tenant_id = p.tenant_id
         and i.member_id = p.member_id
         and i.status in ('pending', 'partial')
         and i.amount_paise > i.paid_paise
       order by i.period
       for update
    loop
      exit when v_left <= 0;
      v_take := least(r.due, v_left);
      if v_take > 0 then
        update public.invoices set paid_paise = paid_paise + v_take where id = r.id;
        insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
        values (p.id, r.id, v_take)
        on conflict (payment_id, invoice_id) do update
          set amount_paise = public.payment_allocations.amount_paise + excluded.amount_paise;
        v_left := v_left - v_take;
      end if;
    end loop;

    update public.payments set unallocated_paise = v_left where id = p.id;
  end loop;
end $$;

-- ── F. Expenses + fund movement + ledger ───────────────────────
insert into public.expenses
  (tenant_id, fund_id, category, amount_paise, vendor, status,
   entered_by, approved_by, approved_at, note, created_at)
select t.id,
       f.id,
       v.category,
       v.amount_paise,
       'Old app import',
       'approved'::expense_status,
       null, null,
       v.created_at::timestamptz,
       'old-app:expense:' || v.old_id || ' · ' || v.note,
       v.created_at::timestamptz
  from _rz_tenant t
  join public.funds f on f.tenant_id = t.id and f.code = 'GEN'
  cross join (values
    (2, 'Electricity', 62000, '20 watt ka bulb 4 pcs', '2025-12-15 10:12:22'),
    (3, 'Electricity', 59700, 'Register, pen, holder,switch,tap etc', '2025-12-15 10:14:14'),
    (4, 'Maintenance Staff', 126000, 'Naali saaf karne me kharch hua', '2026-03-24 10:15:07')
  ) as v(old_id, category, amount_paise, note, created_at)
 where not exists (
   select 1 from public.expenses e
    where e.tenant_id = t.id
      and e.note like 'old-app:expense:' || v.old_id || ' · %'
 );

do $$
declare
  e record;
  v_name text;
begin
  for e in
    select ex.id, ex.tenant_id, ex.fund_id, ex.amount_paise, ex.note,
           ex.category, ex.created_at
      from public.expenses ex
      join _rz_tenant t on t.id = ex.tenant_id
     where ex.note like 'old-app:expense:%'
       and not exists (
         select 1 from public.ledger_entries l
          where l.tenant_id = ex.tenant_id
            and l.ref_type = 'import_expense'
            and l.ref_no = 'OLD-EXP-' || split_part(split_part(ex.note, ':', 3), ' ', 1)
       )
     order by ex.created_at
  loop
    select name into v_name from public.funds where id = e.fund_id;

    update public.funds
       set balance_paise = greatest(0, balance_paise - e.amount_paise)
     where id = e.fund_id;

    insert into public.ledger_entries
      (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
       ref_type, ref_no, created_by)
    values
      (e.tenant_id, e.created_at::date, v_name,
       'Imported expense · ' || e.category,
       0, e.amount_paise,
       'import_expense', 'OLD-EXP-' || split_part(split_part(e.note, ':', 3), ' ', 1), null);
  end loop;
end $$;

-- ── G. Gifts (old app gifts → verified donations) ─────────────
insert into public.donations
  (tenant_id, fund_id, donor_name, member_id, amount_paise, method,
   reference, status, receipt_no, anonymous, note,
   entered_by, verified_by, verified_at, created_at)
select t.id,
       f.id,
       m.name,
       m.id,
       v.amount_paise,
       'cash'::donation_method,
       null,
       'verified'::payment_status,
       'OLD-GIFT-' || v.old_id,
       false,
       v.note,
       null, null,
       v.created_at::timestamptz,
       v.created_at::timestamptz
  from _rz_tenant t
  cross join (values
    (3, 29, 50000, 'CCTV · Sohail CCTV Ke liye Gift Diya tha', '2026-02-03 10:48:11'),
    (5, 41, 100000, 'Main Gate banwane ke liye', '2026-08-02 20:17:40')
  ) as v(old_id, old_user_id, amount_paise, note, created_at)
  join public.members m
    on m.tenant_id = t.id
   and m.notes = 'old-app:user:' || v.old_user_id
  join public.funds f on f.tenant_id = t.id and f.code = 'GEN'
 where not exists (
   select 1 from public.donations d
    where d.tenant_id = t.id
      and d.receipt_no = 'OLD-GIFT-' || v.old_id
 );

do $$
declare
  d record;
  v_name text;
begin
  for d in
    select dn.id, dn.tenant_id, dn.fund_id, dn.amount_paise, dn.receipt_no,
           dn.donor_name, dn.note, dn.created_at
      from public.donations dn
      join _rz_tenant t on t.id = dn.tenant_id
     where dn.receipt_no like 'OLD-GIFT-%'
       and not exists (
         select 1 from public.ledger_entries l
          where l.tenant_id = dn.tenant_id
            and l.ref_type = 'import_donation'
            and l.ref_no = dn.receipt_no
       )
     order by dn.created_at
  loop
    select name into v_name from public.funds where id = d.fund_id;

    update public.funds
       set balance_paise = balance_paise + d.amount_paise
     where id = d.fund_id;

    insert into public.ledger_entries
      (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
       ref_type, ref_no, created_by)
    values
      (d.tenant_id, d.created_at::date, v_name,
       'Imported donation · ' || d.donor_name || ' · ' || coalesce(d.note, 'Gift'),
       0, d.amount_paise,
       'import_donation', d.receipt_no, null);
  end loop;
end $$;

-- ── H. Remove the notification flood from historical receipts ──
-- The payments trigger creates one inbox row per verified receipt. For
-- an import that would be 217 old notifications, so drop just those.
delete from public.member_notifications n
 using public.payments p
 where n.meta ->> 'payment_id' = p.id::text
   and p.receipt_no like 'OLD-%';

-- ── I. Summary (visible in the workflow log) ───────────────────
select
  t.id as tenant_id,
  (select count(*) from public.members m
    where m.tenant_id = t.id and m.notes like 'old-app:user:%') as imported_members,
  (select count(*) from public.invoices i
     join public.members m on m.id = i.member_id
    where i.tenant_id = t.id and m.notes like 'old-app:user:%'
      and i.status in ('pending','partial')) as open_invoices,
  (select coalesce(sum(amount_paise),0) from public.payments p
    where p.tenant_id = t.id and p.receipt_no like 'OLD-%') as paid_paise,
  (select coalesce(sum(i.amount_paise - i.paid_paise),0) from public.invoices i
     join public.members m on m.id = i.member_id
    where i.tenant_id = t.id and m.notes like 'old-app:user:%'
      and i.status in ('pending','partial')) as due_paise,
  (select coalesce(sum(unallocated_paise),0) from public.payments p
    where p.tenant_id = t.id and p.receipt_no like 'OLD-%') as advance_paise,
  (select coalesce(sum(amount_paise),0) from public.donations d
    where d.tenant_id = t.id and d.receipt_no like 'OLD-GIFT-%') as gift_paise,
  (select coalesce(sum(amount_paise),0) from public.expenses e
    where e.tenant_id = t.id and e.note like 'old-app:expense:%') as expense_paise,
  (select coalesce(sum(balance_paise),0) from public.funds f
    where f.tenant_id = t.id) as fund_balance_paise
from _rz_tenant t;
