-- ═══════════════════════════════════════════════════════════════
-- 0042 · Rebuild Raziya Manzil monthly hisab from 3 Dec 2025
--
-- The first import (0041) kept the old app's incomplete dues: only
-- months that had a payment or a monthly_dues row were invoiced.
-- That left 14 members with a stale April cheque and understated
-- everyone else's arrears.
--
-- Rule confirmed by the office:
--   • all 37 members are active
--   • billing starts Dec 2025 (the society's first month)
--   • monthly maintenance = ₹100
--   • one-time joining fee = ₹100, merged into the Dec invoice (₹200)
--   • current month = Nov 2026, so 12 months are due
--
-- Expected: 37 × (200 + 11×100) = ₹48,100
-- Receipts: ₹25,100 (₹200 of it is Dec 2026 advance)
-- Open: ₹23,200 gross, ₹200 advance → net ₹23,000
--
-- Safe to re-run: invoices use the natural key and allocations are
-- rebuilt from scratch for the imported receipts only.
-- ═══════════════════════════════════════════════════════════════

drop table if exists pg_temp._rz2_tenant;
create temp table _rz2_tenant (id uuid);
insert into _rz2_tenant (id)
select id from public.tenants
 where code = 'RMHC' or name ilike '%Raziya Manzil%'
 order by (code = 'RMHC') desc, created_at asc
 limit 1;

do $$
begin
  if not exists (select 1 from _rz2_tenant) then
    raise notice 'Raziya Manzil tenant not found — rebuild skipped';
  end if;
end $$;

-- ── A. One invoice for every month Dec 2025 → Nov 2026 ─────────
insert into public.invoices
  (tenant_id, member_id, period, amount_paise, paid_paise, due_date)
select t.id,
       m.id,
       p.period,
       case when p.period = '2025-12' then 20000 else 10000 end,
       0,
       (p.period || '-10')::date
  from _rz2_tenant t
  join public.members m
    on m.tenant_id = t.id
   and m.notes like 'old-app:user:%'
  cross join (
    select to_char(d, 'YYYY-MM') as period
      from generate_series('2025-12-01'::date, '2026-11-01'::date, '1 month') d
  ) p
on conflict (tenant_id, member_id, period) do nothing;

-- Normalise amounts on rows that already existed.
update public.invoices i
   set amount_paise = case when i.period = '2025-12' then 20000 else 10000 end
  from _rz2_tenant t
  join public.members m
    on m.tenant_id = t.id
   and m.notes like 'old-app:user:%'
 where i.tenant_id = t.id
   and i.member_id = m.id
   and i.period between '2025-12' and '2026-11';

-- ── B. Clear the old allocations and future invoices ───────────
delete from public.payment_allocations a
 using public.payments p, _rz2_tenant t
 where a.payment_id = p.id
   and p.tenant_id = t.id
   and p.receipt_no like 'OLD-%';

delete from public.invoices i
 using _rz2_tenant t, public.members m
 where i.tenant_id = t.id
   and i.member_id = m.id
   and m.notes like 'old-app:user:%'
   and i.period > '2026-11';

-- Reset the 12 billed months; the allocation loop rebuilds them.
update public.invoices i
   set paid_paise = 0,
       status = 'pending',
       waived_reason = null,
       waived_by = null
  from _rz2_tenant t
  join public.members m
    on m.tenant_id = t.id
   and m.notes like 'old-app:user:%'
 where i.tenant_id = t.id
   and i.member_id = m.id
   and i.period between '2025-12' and '2026-11';

update public.payments p
   set unallocated_paise = 0
  from _rz2_tenant t
 where p.tenant_id = t.id
   and p.receipt_no like 'OLD-%';

-- ── C. Rebuild allocations oldest-first ────────────────────────
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
      join _rz2_tenant t on t.id = pay.tenant_id
     where pay.receipt_no like 'OLD-%'
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

    -- Remainder (advance / lump sum) goes to the oldest open months.
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

-- ── D. Summary ─────────────────────────────────────────────────
select
  t.id as tenant_id,
  (select count(*) from public.members m
    where m.tenant_id = t.id and m.notes like 'old-app:user:%') as members,
  (select coalesce(sum(i.amount_paise), 0) from public.invoices i
     join public.members m on m.id = i.member_id
    where i.tenant_id = t.id
      and m.notes like 'old-app:user:%'
      and i.period between '2025-12' and '2026-11') as billed_paise,
  (select coalesce(sum(i.paid_paise), 0) from public.invoices i
     join public.members m on m.id = i.member_id
    where i.tenant_id = t.id
      and m.notes like 'old-app:user:%'
      and i.period between '2025-12' and '2026-11') as allocated_paise,
  (select coalesce(sum(i.amount_paise - i.paid_paise), 0) from public.invoices i
     join public.members m on m.id = i.member_id
    where i.tenant_id = t.id
      and m.notes like 'old-app:user:%'
      and i.status in ('pending','partial')) as open_paise,
  (select coalesce(sum(unallocated_paise), 0) from public.payments p
    where p.tenant_id = t.id and p.receipt_no like 'OLD-%') as advance_paise
from _rz2_tenant t;
