-- ═══════════════════════════════════════════════════════════════
-- 0030 · Outstanding dues only for active members
-- A removed / deactivated member's unpaid invoices stay in the books
-- for audit but must not inflate the live outstanding figure or
-- reminder lists. Same rule everywhere (dashboard, analysis cards).
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
    and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month;

  select coalesce(sum(i.amount_paise - i.paid_paise), 0) into v_outstanding
  from public.invoices i
  join public.members m on m.id = i.member_id
  where i.tenant_id = v_tenant
    and i.status in ('pending','partial')
    and m.status = 'active';

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
  where tenant_id = v_tenant and unallocated_paise > 0;

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
