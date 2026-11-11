-- ═══════════════════════════════════════════════════════════════
-- 0015 · Tenant read_only / suspended enforcement
--
-- Blocks all writes (INSERT/UPDATE/DELETE) to tenant-scoped tables
-- when a tenant is suspended or read_only. Super admins bypass this.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.guard_tenant_status()
returns trigger
language plpgsql
as $$
declare
  v_status text;
begin
  -- Super admins bypass all tenant restrictions
  if public.is_super_admin() then
    return new;
  end if;

  -- Get the tenant status for the row being modified
  select t.status into v_status
    from public.tenants t
    where t.id = coalesce(new.tenant_id, old.tenant_id);

  if v_status = 'suspended' then
    raise exception 'This anjuman is suspended. No changes allowed until reactivated by the platform admin.';
  end if;

  if v_status = 'read_only' then
    raise exception 'This anjuman is in read-only mode. No changes allowed until the subscription is renewed.';
  end if;

  return coalesce(new, old);
end $$;

-- Apply to all tenant-scoped write tables
drop trigger if exists guard_tenant_status_payments on public.payments;
create trigger guard_tenant_status_payments before insert or update or delete on public.payments
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_expenses on public.expenses;
create trigger guard_tenant_status_expenses before insert or update or delete on public.expenses
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_donations on public.donations;
create trigger guard_tenant_status_donations before insert or update or delete on public.donations
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_invoices on public.invoices;
create trigger guard_tenant_status_invoices before insert or update or delete on public.invoices
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_members on public.members;
create trigger guard_tenant_status_members before insert or update or delete on public.members
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_fee_plans on public.fee_plans;
create trigger guard_tenant_status_fee_plans before insert or update or delete on public.fee_plans
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_fee_overrides on public.fee_overrides;
create trigger guard_tenant_status_fee_overrides before insert or update or delete on public.fee_overrides
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_funds on public.funds;
create trigger guard_tenant_status_funds before insert or update or delete on public.funds
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_notices on public.notices;
create trigger guard_tenant_status_notices before insert or update or delete on public.notices
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_complaints on public.complaints;
create trigger guard_tenant_status_complaints before insert or update or delete on public.complaints
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_prayer_days on public.prayer_days;
create trigger guard_tenant_status_prayer_days before insert or update or delete on public.prayer_days
  for each row execute function public.guard_tenant_status();

drop trigger if exists guard_tenant_status_ledger on public.ledger_entries;
create trigger guard_tenant_status_ledger before insert or update or delete on public.ledger_entries
  for each row execute function public.guard_tenant_status();
