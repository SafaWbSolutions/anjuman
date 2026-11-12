-- ═══════════════════════════════════════════════════════════════
-- 0034 · Calculation integrity: advances, fund ledger, outstanding
--
-- Fixes found in the financial audit:
--   1. Member advances (money paid ahead of dues) were recorded but
--      never used for future months. They now auto-apply the moment
--      a new invoice is created.
--   2. Member fees were never credited to the General Fund, so the
--      cash balance on dashboards/reports ignored most collections.
--   3. A reset/reversal left `unallocated_paise` on rejected rows,
--      which could show a phantom advance.
--   4. Outstanding dues now net off any available advance and keep
--      counting only active members.
--   5. A payment correction now stores its leftover as advance too.
-- ═══════════════════════════════════════════════════════════════

-- ── A. Make sure every tenant has a General Fund ────────────────
insert into public.funds (tenant_id, code, name, restricted)
select t.id, 'GEN', 'General Fund', false
  from public.tenants t
on conflict (tenant_id, code) do nothing;

-- ── B. Recompute every fund balance from source documents ──────
-- Idempotent: safe even if the migration is applied twice. GEN also
-- holds member collections; the other funds hold their donations.
update public.funds f
   set balance_paise = greatest(
         0,
         coalesce((
           select sum(d.amount_paise)
             from public.donations d
            where d.tenant_id = f.tenant_id
              and d.fund_id = f.id
              and d.status = 'verified'
         ), 0)
         + case when f.code = 'GEN' then coalesce((
             select sum(p.amount_paise)
               from public.payments p
              where p.tenant_id = f.tenant_id
                and p.status = 'verified'
           ), 0) else 0 end
         - coalesce((
             select sum(e.amount_paise)
               from public.expenses e
              where e.tenant_id = f.tenant_id
                and e.fund_id = f.id
                and e.status = 'approved'
           ), 0)
       );

-- ── C. Repair derived columns from source data ─────────────────
update public.payments p
   set unallocated_paise = greatest(
         0,
         p.amount_paise - coalesce((
           select sum(a.amount_paise)
             from public.payment_allocations a
            where a.payment_id = p.id
         ), 0)
       )
 where p.status = 'verified';

update public.payments
   set unallocated_paise = 0
 where status <> 'verified' and unallocated_paise <> 0;

-- ── D. Keep the General Fund in step with payment status ───────
create or replace function public.payments_fund_sync()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'verified' then
      update public.funds
         set balance_paise = balance_paise + new.amount_paise
       where tenant_id = new.tenant_id and code = 'GEN';
    end if;
    return new;
  end if;

  if new.status = 'verified' and old.status is distinct from 'verified' then
    update public.funds
       set balance_paise = balance_paise + new.amount_paise
     where tenant_id = new.tenant_id and code = 'GEN';
  elsif new.status <> 'verified' and old.status = 'verified' then
    update public.funds
       set balance_paise = greatest(0, balance_paise - old.amount_paise)
     where tenant_id = old.tenant_id and code = 'GEN';
  elsif new.status = 'verified' and old.status = 'verified'
        and new.amount_paise is distinct from old.amount_paise then
    update public.funds
       set balance_paise = greatest(
             0, balance_paise + (new.amount_paise - old.amount_paise)
           )
     where tenant_id = new.tenant_id and code = 'GEN';
  end if;

  return new;
end $$;

drop trigger if exists payments_fund_sync on public.payments;
create trigger payments_fund_sync
  after insert or update of status, amount_paise
  on public.payments
  for each row execute function public.payments_fund_sync();

-- A rejected/reset payment can never carry an advance.
create or replace function public.payments_clear_advance()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'verified' then
    new.unallocated_paise := 0;
  end if;
  return new;
end $$;

drop trigger if exists payments_clear_advance on public.payments;
create trigger payments_clear_advance
  before update of status on public.payments
  for each row execute function public.payments_clear_advance();

-- ── E. Apply a member's advance to unpaid invoices ─────────────
create or replace function public.apply_member_advance(p_member uuid)
returns bigint
language plpgsql security definer set search_path = public
as $$
declare
  p       record;
  inv     record;
  v_left  bigint;
  v_due   bigint;
  v_take  bigint;
  v_total bigint := 0;
begin
  for p in
    select id, unallocated_paise
      from public.payments
     where member_id = p_member
       and status = 'verified'
       and unallocated_paise > 0
     order by created_at asc
     for update
  loop
    v_left := p.unallocated_paise;

    for inv in
      select * from public.invoices
       where member_id = p_member
         and status in ('pending','partial')
       order by period asc
       for update
    loop
      exit when v_left <= 0;
      v_due := inv.amount_paise - inv.paid_paise;
      continue when v_due <= 0;

      v_take := least(v_due, v_left);
      update public.invoices
         set paid_paise = paid_paise + v_take
       where id = inv.id;

      insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
      values (p.id, inv.id, v_take)
      on conflict (payment_id, invoice_id) do update
        set amount_paise = public.payment_allocations.amount_paise
                         + excluded.amount_paise;

      v_left  := v_left - v_take;
      v_total := v_total + v_take;
    end loop;

    if v_left <> p.unallocated_paise then
      update public.payments
         set unallocated_paise = v_left
       where id = p.id;
    end if;
  end loop;

  return v_total;
end $$;

revoke all on function public.apply_member_advance(uuid) from public, anon;
grant execute on function public.apply_member_advance(uuid) to authenticated, service_role;

create or replace function public.invoices_apply_advance()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.apply_member_advance(new.member_id);
  return new;
end $$;

drop trigger if exists invoices_apply_advance on public.invoices;
create trigger invoices_apply_advance
  after insert on public.invoices
  for each row execute function public.invoices_apply_advance();

-- Apply whatever advance already exists to the invoices we have now.
select public.apply_member_advance(m.id)
  from public.members m
 where exists (
   select 1 from public.payments p
    where p.member_id = m.id and p.status = 'verified' and p.unallocated_paise > 0
 );

-- ── F. Payment correction keeps its leftover as advance ────────
create or replace function public.apply_payment_edit(
  p_payment   uuid,
  p_amount    bigint,
  p_method    text,
  p_reference text,
  p_note      text,
  p_by        uuid
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  p        public.payments;
  v_alloc  record;
  v_inv    record;
  v_left   bigint;
  v_delta  bigint;
  v_acct   text;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount 0 se bada hona chahiye';
  end if;

  v_delta := p_amount - p.amount_paise;
  v_acct  := case when p.method = 'cash' then 'Cash' else 'Bank' end;

  if p.status = 'verified' and v_delta <> 0 then
    if v_delta > 0 then
      insert into public.ledger_entries
        (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
         ref_type, ref_no, created_by)
      values
        (p.tenant_id, current_date, v_acct,
         'Payment correction (+) · ' || coalesce(p.receipt_no, p.id::text),
         v_delta, 0, 'payment_correction', p.receipt_no, p_by);
    else
      insert into public.ledger_entries
        (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
         ref_type, ref_no, created_by)
      values
        (p.tenant_id, current_date, v_acct,
         'Payment correction (−) · ' || coalesce(p.receipt_no, p.id::text),
         0, -v_delta, 'payment_correction', p.receipt_no, p_by);
    end if;
  end if;

  v_left := 0;

  if p.status = 'verified' then
    for v_alloc in
      select * from public.payment_allocations where payment_id = p.id
    loop
      update public.invoices
         set paid_paise = greatest(0, paid_paise - v_alloc.amount_paise)
       where id = v_alloc.invoice_id;
    end loop;
    delete from public.payment_allocations where payment_id = p.id;

    v_left := p_amount;
    for v_inv in
      select * from public.invoices
       where tenant_id = p.tenant_id
         and member_id = p.member_id
         and status in ('pending','partial')
       order by period asc
       for update
    loop
      exit when v_left <= 0;
      declare
        v_due  bigint := v_inv.amount_paise - v_inv.paid_paise;
        v_take bigint := least(v_due, v_left);
      begin
        if v_take > 0 then
          update public.invoices
             set paid_paise = paid_paise + v_take
           where id = v_inv.id;
          insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
          values (p.id, v_inv.id, v_take);
          v_left := v_left - v_take;
        end if;
      end;
    end loop;
  end if;

  update public.payments
     set amount_paise      = p_amount,
         method            = p_method,
         reference         = nullif(btrim(coalesce(p_reference, '')), ''),
         note              = coalesce(nullif(btrim(coalesce(p_note, '')), ''),
                                      note)
                               || ' · corrected (maker-checker)',
         unallocated_paise = case when p.status = 'verified'
                                  then v_left else 0 end,
         verified_by       = coalesce(verified_by, p_by)
   where id = p.id;

  return 'Payment corrected · ₹'
    || to_char(p.amount_paise / 100.0, 'FM999999990.00')
    || ' → ₹' || to_char(p_amount / 100.0, 'FM999999990.00');
end $$;

revoke all on function public.apply_payment_edit(uuid, bigint, text, text, text, uuid)
  from public, anon;
grant execute on function public.apply_payment_edit(uuid, bigint, text, text, text, uuid)
  to service_role;

-- ── G. Dashboard: advance-aware outstanding ────────────────────
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
    and to_char(coalesce(settled_at, created_at) at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month;

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
