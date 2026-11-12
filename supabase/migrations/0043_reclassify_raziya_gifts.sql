-- ═══════════════════════════════════════════════════════════════
-- 0043 · Put imported old-app gifts into the Gift fund
--
-- 0041 imported the two old-app gifts into the General Fund, which
-- made the dashboard card "Gift amount" show ₹0 while "All donations"
-- showed ₹1,500. The app already has a GIFT fund (0025); move the two
-- donations there and reclassify the fund balances.
--
-- The ledger is append-only, so the original credit in General Fund is
-- not edited. Instead a debit (General) + credit (Gift) pair is added,
-- keeping the hash chain valid.
-- ═══════════════════════════════════════════════════════════════

drop table if exists pg_temp._rz3_tenant;
create temp table _rz3_tenant (id uuid);
insert into _rz3_tenant (id)
select id from public.tenants
 where code = 'RMHC' or name ilike '%Raziya Manzil%'
 order by (code = 'RMHC') desc, created_at asc
 limit 1;

do $$
declare
  r        record;
  v_gen    uuid;
  v_gift   uuid;
  v_gen_name text;
  v_gift_name text;
begin
  for r in
    select d.id, d.tenant_id, d.amount_paise, d.receipt_no
      from public.donations d
      join public.funds f on f.id = d.fund_id
      join _rz3_tenant t on t.id = d.tenant_id
     where d.receipt_no like 'OLD-GIFT-%'
       and f.code = 'GEN'
  loop
    select id, name into v_gen, v_gen_name
      from public.funds where tenant_id = r.tenant_id and code = 'GEN';

    select id, name into v_gift, v_gift_name
      from public.funds where tenant_id = r.tenant_id and code = 'GIFT';

    if v_gift is null then
      insert into public.funds (tenant_id, code, name, restricted, balance_paise)
      values (r.tenant_id, 'GIFT', 'Gift / Donation Fund', false, 0)
      returning id into v_gift;
      v_gift_name := 'Gift / Donation Fund';
    end if;

    -- Move the donation row itself.
    update public.donations set fund_id = v_gift where id = r.id;

    -- Move the balance.
    update public.funds
       set balance_paise = greatest(0, balance_paise - r.amount_paise)
     where id = v_gen;
    update public.funds
       set balance_paise = balance_paise + r.amount_paise
     where id = v_gift;

    -- Append-only reclassification: debit General, credit Gift.
    insert into public.ledger_entries
      (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
       ref_type, ref_no, created_by)
    values
      (r.tenant_id, current_date, v_gen_name,
       'Reclassify imported gift to Gift Fund · ' || r.receipt_no,
       r.amount_paise, 0, 'import_reclass', r.receipt_no, null);

    insert into public.ledger_entries
      (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
       ref_type, ref_no, created_by)
    values
      (r.tenant_id, current_date, v_gift_name,
       'Reclassify imported gift to Gift Fund · ' || r.receipt_no,
       0, r.amount_paise, 'import_reclass', r.receipt_no, null);
  end loop;
end $$;

select
  t.id as tenant_id,
  (select coalesce(sum(balance_paise), 0) from public.funds f
    where f.tenant_id = t.id) as total_funds,
  (select balance_paise from public.funds f
    where f.tenant_id = t.id and f.code = 'GEN') as general_fund,
  (select balance_paise from public.funds f
    where f.tenant_id = t.id and f.code = 'GIFT') as gift_fund,
  (select coalesce(sum(amount_paise), 0) from public.donations d
    join public.funds f on f.id = d.fund_id
   where d.tenant_id = t.id and d.receipt_no like 'OLD-GIFT-%'
     and f.code = 'GIFT') as gift_donations
from _rz3_tenant t;
