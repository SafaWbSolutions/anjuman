-- ═══════════════════════════════════════════════════════════════
-- 0010 · Donations (Zakat / Sadaqah / Project Funds)
--
-- Donations are distinct from member chanda:
--   • Can come from members OR non-members (anonymous)
--   • Must be tagged to a FUND (restricted vs unrestricted)
--   • Zakat is a restricted fund — can only be spent on eligible heads
--   • Every donation gets a numbered receipt (D-YYYY-NNNN)
--   • Maker–checker: recorder ≠ verifier
--   • Ledger entry written on verification
--
-- Depends on: 0001 (funds, members), 0003 (verify_payment pattern),
--             0004 (guards, receipt sequences), 0005 (approvals).
-- ════════════════════════════════════════════════════════════════

-- ── Donation method enum ──────────────────────────────────────────
do $$ begin
  create type donation_method as enum ('cash', 'upi', 'gateway', 'cheque');
exception when duplicate_object then null; end $$;

-- ── Donations table ───────────────────────────────────────────────
create table if not exists public.donations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  fund_id        uuid not null references public.funds(id) on delete restrict,
  donor_name     text not null,
  member_id      uuid references public.members(id) on delete set null,
  amount_paise   bigint not null check (amount_paise > 0),
  method         donation_method not null,
  reference      text,
  status         payment_status not null default 'pending',
  receipt_no     text,
  anonymous      boolean not null default false,
  note           text,
  entered_by     uuid references public.profiles(id),
  verified_by    uuid references public.profiles(id),
  verified_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (verified_by is null or verified_by <> entered_by)
);

create unique index if not exists donations_receipt_unique
  on public.donations (tenant_id, receipt_no) where receipt_no is not null;

create index if not exists donations_tenant_created_idx
  on public.donations (tenant_id, created_at desc);

create index if not exists donations_fund_idx
  on public.donations (fund_id);

-- ── Receipt sequence for donations (separate from chanda receipts) ──
-- Format: D-YYYY-NNNN (fiscal year starting April)
create or replace function public.next_donation_receipt_no(p_tenant uuid)
returns text
language plpgsql security definer set search_path = public
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
  values (p_tenant, 'D-' || v_fy, 1000)
  on conflict (tenant_id, fiscal_year)
  do update set last_no = public.receipt_sequences.last_no + 1
  returning last_no into v_no;

  return 'D-' || v_fy || '-' || lpad(v_no::text, 5, '0');
end $$;

-- ── RLS Policies ──────────────────────────────────────────────────
alter table public.donations enable row level security;

-- Tenant-scoped read
drop policy if exists donations_tenant_read on public.donations;
create policy donations_tenant_read on public.donations
  for select using (
    tenant_id = public.current_tenant_id()
    or public.is_super_admin()
  );

-- Office bearers can insert (entered_by auto-set by RPC)
drop policy if exists donations_office_insert on public.donations;
create policy donations_office_insert on public.donations
  for insert with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector')
  );

-- Only verifier roles can update status to verified (via RPC)
drop policy if exists donations_office_update on public.donations;
create policy donations_office_update on public.donations
  for update using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','khajanchi','auditor'))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','khajanchi','auditor'))
  );

-- ── Guard: only trusted context can set verified status directly ──
create or replace function public.guard_donation_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  -- Browser can only create pending; verification goes through RPC
  if new.status is distinct from old.status then
    raise exception 'Use verify_donation / reject_donation RPC to change status';
  end if;
  if new.receipt_no is distinct from old.receipt_no then
    raise exception 'Receipt number is assigned by verification RPC';
  end if;
  if new.verified_by is distinct from old.verified_by then
    raise exception 'Verifier is assigned by verification RPC';
  end if;
  if new.verified_at is distinct from old.verified_at then
    raise exception 'Verified timestamp is assigned by verification RPC';
  end if;

  return new;
end $$;

drop trigger if exists donations_guard_update on public.donations;
create trigger donations_guard_update
  before update on public.donations
  for each row execute function public.guard_donation_update();

-- ── RPC · create_donation ─────────────────────────────────────────
-- Browser calls this to record a donation (always starts pending)
create or replace function public.create_donation(
  p_fund_id     uuid,
  p_donor_name  text,
  p_amount_paise bigint,
  p_method      donation_method,
  p_member_id   uuid default null,
  p_reference   text default null,
  p_anonymous   boolean default false,
  p_note        text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
  v_fund   public.funds;
  v_id     uuid;
begin
  if coalesce(v_role in ('sadar','secretary','khajanchi','auditor','collector'), false) is not true then
    raise exception 'Not allowed to record donations';
  end if;
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if p_amount_paise is null or p_amount_paise <= 0 then
    raise exception 'Donation amount must be positive';
  end if;
  if coalesce(btrim(p_donor_name), '') = '' then
    raise exception 'Donor name is required';
  end if;

  -- Validate fund belongs to this tenant
  select * into v_fund from public.funds where id = p_fund_id for share;
  if not found then
    raise exception 'Fund not found';
  end if;
  if v_fund.tenant_id is distinct from v_tenant then
    raise exception 'Fund belongs to different tenant';
  end if;

  -- If member_id provided, validate it belongs to this tenant
  if p_member_id is not null then
    if not exists (
      select 1 from public.members
      where id = p_member_id and tenant_id = v_tenant
    ) then
      raise exception 'Member not found in this tenant';
    end if;
  end if;

  insert into public.donations
    (tenant_id, fund_id, donor_name, member_id, amount_paise, method,
     reference, anonymous, note, entered_by)
  values
    (v_tenant, p_fund_id, btrim(p_donor_name), p_member_id, p_amount_paise, p_method,
     p_reference, p_anonymous, p_note, auth.uid())
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.create_donation(uuid, text, bigint, donation_method, uuid, text, boolean, text) from public, anon;
grant execute on function public.create_donation(uuid, text, bigint, donation_method, uuid, text, boolean, text) to authenticated;

-- ── RPC · verify_donation ─────────────────────────────────────────
-- Verifier (different person) calls this to verify + issue receipt + ledger
create or replace function public.verify_donation(p_donation_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  d        public.donations;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
  v_receipt text;
  v_fund   public.funds;
begin
  if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Only the office can verify donations';
  end if;

  select * into d from public.donations where id = p_donation_id for update;
  if not found then raise exception 'Donation not found'; end if;
  if d.tenant_id is distinct from v_tenant then raise exception 'Wrong tenant'; end if;
  if d.status <> 'pending' then raise exception 'Donation already %, not pending', d.status; end if;
  if d.entered_by is not distinct from auth.uid() then
    raise exception 'Maker cannot verify their own entry';
  end if;

  v_receipt := public.next_donation_receipt_no(d.tenant_id);

  -- Get fund for ledger
  select * into v_fund from public.funds where id = d.fund_id for update;
  if not found then raise exception 'Fund not found'; end if;

  -- Update fund balance (credit)
  update public.funds
    set balance_paise = balance_paise + d.amount_paise
    where id = v_fund.id;

  -- Update donation to verified
  update public.donations
    set status = 'verified',
        receipt_no = v_receipt,
        verified_by = auth.uid(),
        verified_at = now()
    where id = d.id;

  -- Ledger entry
  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (d.tenant_id, current_date, v_fund.name,
     'Donation · ' || d.donor_name || ' · ' || d.method || coalesce(' · ' || d.reference, ''),
     0, d.amount_paise, 'donation', v_receipt, auth.uid());

  return v_receipt;
end $$;

revoke all on function public.verify_donation(uuid) from public, anon;
grant execute on function public.verify_donation(uuid) to authenticated;

-- ── RPC · reject_donation ─────────────────────────────────────────
create or replace function public.reject_donation(
  p_donation_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  d        public.donations;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
begin
  if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Only the office can reject donations';
  end if;

  select * into d from public.donations where id = p_donation_id for update;
  if not found then raise exception 'Donation not found'; end if;
  if d.tenant_id is distinct from v_tenant then raise exception 'Wrong tenant'; end if;
  if d.status <> 'pending' then raise exception 'Donation is already %', d.status; end if;
  if d.entered_by is not distinct from auth.uid() then
    raise exception 'Maker cannot reject their own entry';
  end if;

  update public.donations
    set status = 'rejected',
        verified_by = auth.uid(),
        verified_at = now(),
        note = coalesce(nullif(btrim(p_reason), ''), d.note, 'Rejected')
    where id = d.id;
end $$;

revoke all on function public.reject_donation(uuid, text) from public, anon;
grant execute on function public.reject_donation(uuid, text) to authenticated;

-- ── Auto-verify for gateway donations (service role only) ─────────
create or replace function public.verify_donation_auto(p_donation_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  d        public.donations;
  v_receipt text;
  v_fund   public.funds;
begin
  if not public.is_service_role() then
    raise exception 'Server-only function';
  end if;

  select * into d from public.donations where id = p_donation_id for update;
  if not found then raise exception 'Donation not found'; end if;
  if d.status <> 'pending' then raise exception 'Donation already %, not pending', d.status; end if;
  if d.method <> 'gateway' then raise exception 'Auto-verify only for gateway donations'; end if;
  if d.entered_by is not null then raise exception 'Auto-verify only for gateway-created entries'; end if;

  v_receipt := public.next_donation_receipt_no(d.tenant_id);

  select * into v_fund from public.funds where id = d.fund_id for update;
  if not found then raise exception 'Fund not found'; end if;

  update public.funds
    set balance_paise = balance_paise + d.amount_paise
    where id = v_fund.id;

  update public.donations
    set status = 'verified',
        receipt_no = v_receipt,
        verified_by = null,
        verified_at = now()
    where id = d.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (d.tenant_id, current_date, v_fund.name,
     'Gateway donation · ' || d.donor_name || ' · ' || d.reference,
     0, d.amount_paise, 'donation', v_receipt, null);

  return v_receipt;
end $$;

revoke all on function public.verify_donation_auto(uuid) from public, anon;
grant execute on function public.verify_donation_auto(uuid) to service_role;

-- ── Add donation to approvals entity types ────────────────────────
-- The decide_approval RPC (0005/0006) already handles 'donation' entity_type
-- via the generic else branch. We just need to ensure the approval row
-- can be created. 0001 has check (entity_type in (...)) so we must ALTER it.
alter table public.approvals
  drop constraint if exists approvals_entity_type_check;
alter table public.approvals
  add constraint approvals_entity_type_check
  check (entity_type in ('payment','expense','waiver','member','fee_change','donation'));

-- The donation_method enum already restricts values, no extra check needed