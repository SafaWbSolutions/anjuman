-- ═══════════════════════════════════════════════════════════════
-- 0003 · Functions & triggers
-- Member IDs, receipt numbers, ledger hash chain, maker–checker.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pg_trgm;

-- ── Member ID: BHR-000123-7 ─────────────────────────────────────
create or replace function public.assign_member_code()
returns trigger
language plpgsql
as $$
declare
  v_code   text;
  v_serial int;
  v_body   text;
  v_digits text;
  v_sum    int := 0;
  v_chk    int := 0;
  i        int;
begin
  if new.code is not null and new.code <> '' then
    return new;
  end if;

  select upper(code) into v_code from public.tenants where id = new.tenant_id;
  if v_code is null then
    raise exception 'Tenant % not found', new.tenant_id;
  end if;

  -- Serialise allocation per tenant so two inserts cannot take the
  -- same serial number.
  perform pg_advisory_xact_lock(hashtext('member:' || new.tenant_id::text));

  select coalesce(max(serial_no), 0) + 1 into v_serial
  from public.members where tenant_id = new.tenant_id;

  v_body := v_code || '-' || lpad(v_serial::text, 6, '0');
  v_digits := regexp_replace(v_body, '[^0-9]', '', 'g');

  for i in 1..length(v_digits) loop
    v_sum := v_sum + (substr(v_digits, i, 1)::int) * (case when (i - 1) % 2 = 0 then 3 else 1 end);
  end loop;
  v_chk := v_sum % 10;

  new.serial_no := v_serial;
  new.code := v_body || '-' || v_chk::text;
  return new;
end $$;

drop trigger if exists members_assign_code on public.members;
create trigger members_assign_code
  before insert on public.members
  for each row execute function public.assign_member_code();

-- ── Receipt numbers: R-2026-01042 ───────────────────────────────
create or replace function public.next_receipt_no(p_tenant uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_fy   text;
  v_no   int;
begin
  v_fy := case
    when extract(month from now()) >= 4
      then extract(year from now())::text
    else (extract(year from now()) - 1)::text
  end;

  insert into public.receipt_sequences (tenant_id, fiscal_year, last_no)
  values (p_tenant, v_fy, 1000)
  on conflict (tenant_id, fiscal_year)
  do update set last_no = public.receipt_sequences.last_no + 1
  returning last_no into v_no;

  return 'R-' || v_fy || '-' || lpad(v_no::text, 5, '0');
end $$;

-- ── Ledger chain ────────────────────────────────────────────────
alter table public.ledger_entries add column if not exists seq bigserial;
create unique index if not exists ledger_seq_idx on public.ledger_entries (tenant_id, seq);

create or replace function public.ledger_hash(
  p_tenant uuid, p_prev text, p_date date, p_account text,
  p_narration text, p_debit bigint, p_credit bigint,
  p_ref_type text, p_ref_no text
) returns text
language sql immutable
as $$
  select encode(digest(
    coalesce(p_prev, '') || '|' ||
    p_tenant::text || '|' ||
    coalesce(p_date::text, '') || '|' ||
    coalesce(p_account, '') || '|' ||
    coalesce(p_narration, '') || '|' ||
    coalesce(p_debit, 0)::text || '|' ||
    coalesce(p_credit, 0)::text || '|' ||
    coalesce(p_ref_type, '') || '|' ||
    coalesce(p_ref_no, ''),
    'sha256'
  ), 'hex');
$$;

create or replace function public.ledger_append()
returns trigger
language plpgsql
as $$
declare
  v_prev text;
begin
  -- One writer per tenant keeps prev_hash deterministic.
  perform pg_advisory_xact_lock(hashtext('ledger:' || new.tenant_id::text));

  select hash into v_prev
  from public.ledger_entries
  where tenant_id = new.tenant_id
  order by seq desc
  limit 1;

  new.prev_hash := coalesce(v_prev, '0x' || repeat('0', 64));
  new.hash := public.ledger_hash(
    new.tenant_id, new.prev_hash, new.entry_date, new.account,
    new.narration, new.debit_paise, new.credit_paise,
    new.ref_type, new.ref_no
  );
  return new;
end $$;

drop trigger if exists ledger_append_trigger on public.ledger_entries;
create trigger ledger_append_trigger
  before insert on public.ledger_entries
  for each row execute function public.ledger_append();

-- Sealing the head hash after every insert makes truncation detectable.
create or replace function public.ledger_seal()
returns trigger
language plpgsql
as $$
begin
  insert into public.ledger_seals (tenant_id, head_hash, entry_count, sealed_at)
  values (new.tenant_id, new.hash, 1, now())
  on conflict (tenant_id) do update
    set head_hash = excluded.head_hash,
        entry_count = public.ledger_seals.entry_count + 1,
        sealed_at = now();
  return new;
end $$;

drop trigger if exists ledger_seal_trigger on public.ledger_entries;
create trigger ledger_seal_trigger
  after insert on public.ledger_entries
  for each row execute function public.ledger_seal();

-- Full verification: returns the first broken seq, or null when intact.
create or replace function public.verify_ledger(p_tenant uuid)
returns bigint
language plpgsql
stable
security definer set search_path = public
as $$
declare
  r      record;
  v_prev text := '0x' || repeat('0', 64);
  v_calc text;
begin
  for r in
    select * from public.ledger_entries
    where tenant_id = p_tenant
    order by seq asc
  loop
    if r.prev_hash <> v_prev then
      return r.seq;
    end if;

    v_calc := public.ledger_hash(
      r.tenant_id, v_prev, r.entry_date, r.account, r.narration,
      r.debit_paise, r.credit_paise, r.ref_type, r.ref_no
    );
    if v_calc <> r.hash then
      return r.seq;
    end if;
    v_prev := r.hash;
  end loop;
  return null;
end $$;

-- ── Invoice status follows payments ─────────────────────────────
create or replace function public.sync_invoice_status()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'waived' then
    return new;
  end if;
  new.status := case
    when new.paid_paise >= new.amount_paise then 'paid'::invoice_status
    when new.paid_paise > 0 then 'partial'::invoice_status
    else 'pending'::invoice_status
  end;
  return new;
end $$;

drop trigger if exists invoices_sync_status on public.invoices;
create trigger invoices_sync_status
  before insert or update of paid_paise, amount_paise on public.invoices
  for each row execute function public.sync_invoice_status();

-- ═══════════════════════════════════════════════════════════════
-- RPC · verify_payment
-- Called by sadar / khajanchi / auditor. The recorder can never
-- verify their own entry (enforced below and by a table check).
-- ═══════════════════════════════════════════════════════════════
create or replace function public.verify_payment(p_payment_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  p        public.payments;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
  v_alloc  record;
  v_receipt text;
  v_left   bigint;
begin
  if v_role not in ('sadar','khajanchi','auditor') then
    raise exception 'Not allowed to verify payments';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id <> v_tenant then raise exception 'Wrong tenant'; end if;
  if p.status <> 'pending' then raise exception 'Payment already %, not pending', p.status; end if;
  if p.entered_by = auth.uid() then
    raise exception 'Maker cannot verify their own entry';
  end if;

  v_receipt := public.next_receipt_no(p.tenant_id);
  v_left := p.amount_paise;

  -- Oldest unpaid invoices first.
  for v_alloc in
    select * from public.invoices
    where tenant_id = p.tenant_id
      and member_id = p.member_id
      and status in ('pending','partial')
    order by period asc
    for update
  loop
    exit when v_left <= 0;
    declare
      v_due  bigint := v_alloc.amount_paise - v_alloc.paid_paise;
      v_take bigint := least(v_due, v_left);
    begin
      update public.invoices
        set paid_paise = paid_paise + v_take
        where id = v_alloc.id;
      insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
      values (p.id, v_alloc.id, v_take);
      v_left := v_left - v_take;
    end;
  end loop;

  update public.payments
    set status = 'verified',
        receipt_no = v_receipt,
        verified_by = auth.uid(),
        verified_at = now()
    where id = p.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (p.tenant_id, current_date, 'Cash',
     'Chanda received · ' || coalesce(p.reference, ''),
     p.amount_paise, 0, 'payment', v_receipt, auth.uid());

  return v_receipt;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- RPC · approve_expense
-- Debits the chosen fund, refuses to let a restricted fund go
-- negative, and writes the ledger row in the same transaction.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.approve_expense(p_expense_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  e        public.expenses;
  f        public.funds;
  v_role   app_role := public.current_role();
begin
  if v_role not in ('sadar','auditor') then
    raise exception 'Only the sadar or auditor can approve expenses';
  end if;

  select * into e from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if e.tenant_id <> public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if e.status <> 'pending' then raise exception 'Expense is not pending'; end if;
  if e.entered_by = auth.uid() then raise exception 'Maker cannot approve their own expense'; end if;

  select * into f from public.funds where id = e.fund_id for update;
  if f.balance_paise < e.amount_paise then
    raise exception 'Insufficient balance in fund %', f.name;
  end if;

  update public.funds
    set balance_paise = balance_paise - e.amount_paise
    where id = f.id;

  update public.expenses
    set status = 'approved', approved_by = auth.uid(), approved_at = now()
    where id = e.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (e.tenant_id, current_date, f.name,
     e.category || ' — ' || e.vendor,
     0, e.amount_paise, 'expense', 'EXP-' || left(e.id::text, 8), auth.uid());
end $$;

-- ═══════════════════════════════════════════════════════════════
-- RPC · waive_dues
-- Creates a pending approval; nothing changes until it is approved.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.request_waiver(
  p_member uuid, p_periods text[], p_reason text
) returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_total  bigint := 0;
  v_id     uuid;
begin
  if public.current_role() not in ('sadar','secretary') then
    raise exception 'Not allowed to request waivers';
  end if;

  select coalesce(sum(amount_paise - paid_paise), 0) into v_total
  from public.invoices
  where tenant_id = v_tenant
    and member_id = p_member
    and period = any(p_periods)
    and status in ('pending','partial');

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps)
  values
    (v_tenant, 'waiver', p_member,
     'Waive dues — ' || (v_total / 100)::text,
     p_reason, v_total, auth.uid(), 1, 2)
  returning id into v_id;

  return v_id;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- Audit triggers on sensitive tables
-- ═══════════════════════════════════════════════════════════════
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, meta)
  values (
    coalesce(new.tenant_id, old.tenant_id),
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    jsonb_build_object('status', coalesce(to_jsonb(new) ->> 'status', to_jsonb(old) ->> 'status'))
  );
  return coalesce(new, old);
end $$;

drop trigger if exists audit_payments on public.payments;
create trigger audit_payments after insert or update or delete on public.payments
  for each row execute function public.audit_row();

drop trigger if exists audit_expenses on public.expenses;
create trigger audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.audit_row();

drop trigger if exists audit_approvals on public.approvals;
create trigger audit_approvals after insert or update on public.approvals
  for each row execute function public.audit_row();

drop trigger if exists audit_ledger on public.ledger_entries;
create trigger audit_ledger after insert on public.ledger_entries
  for each row execute function public.audit_row();
