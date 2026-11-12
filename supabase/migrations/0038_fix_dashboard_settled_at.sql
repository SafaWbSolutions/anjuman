-- ═══════════════════════════════════════════════════════════════
-- 0038 · Fix dashboard_snapshot: payments.settled_at does not exist
--
-- 0034 introduced `coalesce(settled_at, created_at)` inside the
-- dashboard_snapshot() PL/pgSQL body. The live `payments` table has
-- no `settled_at` column (the real settlement timestamp is
-- `verified_at`), so the function failed at runtime with:
--
--   column "settled_at" does not exist
--
-- This migration recreates the same function using the column that
-- actually exists. No data is changed and no column is added.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.dashboard_snapshot(p_tenant uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant      uuid := coalesce(p_tenant, public.current_tenant_id());
  v_month       text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  v_collected   bigint := 0;
  v_outstanding bigint := 0;
  v_pending_pay int := 0;
  v_pending_exp int := 0;
  v_high        int := 0;
  v_unallocated bigint := 0;
  v_broken      bigint;
begin
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;

  if coalesce(public.is_service_role()
              or public.is_super_admin()
              or (public.current_tenant_id() = v_tenant and public.is_office_bearer()), false) is not true then
    raise exception 'Not allowed to read this dashboard';
  end if;

  select coalesce(sum(amount_paise), 0) into v_collected
  from public.payments
  where tenant_id = v_tenant
    and status = 'verified'
    -- `payments` has verified_at, not settled_at.
    and to_char(coalesce(verified_at, created_at) at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month;

  -- Due per member, minus any verified advance that is still unused.
  select coalesce(sum(greatest(0, due - adv)), 0) into v_outstanding
  from (
    select i.member_id,
           sum(i.amount_paise - i.paid_paise) as due,
           coalesce((
             select sum(p.unallocated_paise)
               from public.payments p
              where p.member_id = i.member_id
                and p.status = 'verified'
           ), 0) as adv
      from public.invoices i
      join public.members m on m.id = i.member_id
     where i.tenant_id = v_tenant
       and i.status in ('pending','partial')
       and m.status = 'active'
     group by i.member_id
  ) x;

  select count(*) into v_pending_pay
  from public.payments where tenant_id = v_tenant and status = 'pending';

  select count(*) into v_pending_exp
  from public.expenses where tenant_id = v_tenant and status = 'pending';

  select count(*) into v_high
  from public.complaints
  where tenant_id = v_tenant
    and priority = 'high'
    and status not in ('resolved','closed');

  select coalesce(sum(unallocated_paise), 0) into v_unallocated
  from public.payments
  where tenant_id = v_tenant
    and status = 'verified'
    and unallocated_paise > 0;

  v_broken := public.verify_ledger(v_tenant);

  return jsonb_build_object(
    'tenant_id', v_tenant,
    'period', v_month,
    'collected_paise', v_collected,
    'outstanding_paise', v_outstanding,
    'pending_payments', v_pending_pay,
    'pending_expenses', v_pending_exp,
    'high_priority_complaints', v_high,
    'unallocated_paise', v_unallocated,
    'ledger_ok', v_broken is null,
    'ledger_broken_at_seq', v_broken,
    'generated_at', now()
  );
end $$;

revoke all on function public.dashboard_snapshot(uuid) from public;
grant execute on function public.dashboard_snapshot(uuid) to authenticated, service_role;
