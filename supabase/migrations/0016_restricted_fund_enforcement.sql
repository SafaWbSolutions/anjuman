-- ═══════════════════════════════════════════════════════════════
-- 0016 · Restricted-fund enforcement
--
-- Ensures expenses charged to restricted funds (Imam Salary,
-- Masjid Maintenance, Janaza, etc.) carry a documented reason.
-- Super admins and trusted contexts bypass this.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.guard_expense_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.status      := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    new.entered_by  := coalesce(new.entered_by, auth.uid());

    -- Restricted funds require a documented reason
    if new.fund_id is not null then
      declare
        v_restricted boolean := false;
      begin
        select restricted into v_restricted
          from public.funds
          where id = new.fund_id;

        if v_restricted and (new.note is null or trim(new.note) = '') then
          raise exception 'Restricted fund expenses require a reason (note)';
        end if;
      end;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists expenses_guard_insert on public.expenses;
create trigger expenses_guard_insert
  before insert on public.expenses
  for each row execute function public.guard_expense_insert();
