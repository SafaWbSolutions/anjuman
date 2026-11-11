-- AUTO-GENERATED: all migrations in order.
-- Paste this whole file into Supabase Studio -> SQL Editor -> Run.
-- Safe to run on a brand-new project. Generated from supabase/migrations/*.sql.

-- ═══════════ 0001_schema.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0001 · Schema
-- Multi-tenant anjuman / masjid management.
-- Money is stored as integer paise everywhere. Never use floats.
-- ═══════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ── Enums ───────────────────────────────────────────────────────
do $$ begin
  create type app_role as enum (
    'super_admin', 'sadar', 'khajanchi', 'secretary', 'auditor', 'collector', 'member'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type tenant_status as enum ('active', 'trial', 'read_only', 'suspended');
exception when duplicate_object then null; end $$;

do $$ begin
  create type plan_type as enum ('free', 'fixed', 'custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_type as enum ('member', 'donor', 'imam', 'muazzin', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin
  create type member_status as enum ('active', 'inactive', 'pending');
exception when duplicate_object then null; end $$;

do $$ begin
  create type invoice_status as enum ('paid', 'partial', 'pending', 'waived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'upi', 'gateway', 'cheque', 'adjustment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum ('pending', 'verified', 'rejected', 'disputed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type complaint_status as enum ('open', 'assigned', 'in_progress', 'resolved', 'closed');
exception when duplicate_object then null; end $$;

-- ── Tenants ─────────────────────────────────────────────────────
create table if not exists public.tenants (
  id             uuid primary key default gen_random_uuid(),
  code           text not null unique check (code ~ '^[A-Z]{2,4}$'),
  name           text not null,
  village        text not null,
  district       text not null,
  state          text not null,
  pincode        text,
  masjid         text,
  reg_no         text,
  phone          text,
  email          text,
  upi_id         text,
  address        text,
  logo_url       text,
  theme_color    text default '#059669',
  status         tenant_status not null default 'trial',
  plan_type      plan_type not null default 'free',
  plan_amount_paise bigint not null default 0,
  plan_cycle     text not null default 'yearly' check (plan_cycle in ('monthly','yearly','lifetime')),
  expires_at     date,
  grace_days     int not null default 14,
  member_limit   int,
  features       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ── Profiles (one per auth user) ────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid references public.tenants(id) on delete set null,
  full_name   text,
  phone       text,
  email       text,
  role        app_role not null default 'member',
  is_active   boolean not null default true,
  two_factor  boolean not null default false,
  member_id   uuid,
  created_at  timestamptz not null default now()
);
create index if not exists profiles_tenant_idx on public.profiles (tenant_id);

-- ── Members ─────────────────────────────────────────────────────
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  serial_no   int not null,
  code        text not null,
  name        text not null,
  father_name text,
  phone       text,
  email       text,
  household   text,
  mohalla     text,
  member_type member_type not null default 'member',
  status      member_status not null default 'active',
  fee_paise   bigint not null default 0 check (fee_paise >= 0),
  joined_on   date not null default current_date,
  blood_group text,
  photo_url   text,
  concession  text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, code),
  unique (tenant_id, serial_no)
);
create index if not exists members_tenant_status_idx on public.members (tenant_id, status);
create index if not exists members_name_trgm_idx on public.members using gin (name gin_trgm_ops);

-- ── Fee plans & overrides ───────────────────────────────────────
create table if not exists public.fee_plans (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  amount_paise  bigint not null check (amount_paise >= 0),
  cycle         text not null default 'monthly' check (cycle in ('monthly','quarterly','yearly')),
  due_day       int not null default 10 check (due_day between 1 and 28),
  grace_days    int not null default 5,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists public.fee_overrides (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  amount_paise  bigint not null check (amount_paise >= 0),
  reason        text not null,
  approved_by   uuid references public.profiles(id),
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (member_id)
);

-- ── Invoices ────────────────────────────────────────────────────
create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  period       text not null check (period ~ '^\d{4}-\d{2}$'),
  amount_paise bigint not null check (amount_paise >= 0),
  paid_paise   bigint not null default 0 check (paid_paise >= 0),
  status       invoice_status not null default 'pending',
  due_date     date not null,
  waived_reason text,
  waived_by    uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  unique (tenant_id, member_id, period),
  check (paid_paise <= amount_paise)
);
create index if not exists invoices_tenant_period_idx on public.invoices (tenant_id, period);
create index if not exists invoices_member_idx on public.invoices (member_id, status);

-- ── Receipt sequences ───────────────────────────────────────────
create table if not exists public.receipt_sequences (
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  fiscal_year text not null,
  last_no     int not null default 1000,
  primary key (tenant_id, fiscal_year)
);

-- ── Payments ────────────────────────────────────────────────────
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  method       payment_method not null,
  reference    text,
  status       payment_status not null default 'pending',
  receipt_no   text,
  period_from  text,
  period_to    text,
  entered_by   uuid references public.profiles(id),
  verified_by  uuid references public.profiles(id),
  verified_at  timestamptz,
  note         text,
  created_at   timestamptz not null default now(),
  check (verified_by is null or verified_by <> entered_by)
);
create unique index if not exists payments_receipt_unique
  on public.payments (tenant_id, receipt_no) where receipt_no is not null;
create index if not exists payments_tenant_created_idx on public.payments (tenant_id, created_at desc);

create table if not exists public.payment_allocations (
  payment_id uuid not null references public.payments(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount_paise bigint not null check (amount_paise > 0),
  primary key (payment_id, invoice_id)
);

-- ── Funds & expenses ────────────────────────────────────────────
create table if not exists public.funds (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  code         text not null,
  name         text not null,
  restricted   boolean not null default false,
  balance_paise bigint not null default 0 check (balance_paise >= 0),
  unique (tenant_id, code)
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  fund_id       uuid not null references public.funds(id) on delete restrict,
  category      text not null,
  amount_paise  bigint not null check (amount_paise > 0),
  vendor        text not null,
  bill_path     text,
  status        expense_status not null default 'pending',
  entered_by    uuid references public.profiles(id),
  approved_by   uuid references public.profiles(id),
  approved_at   timestamptz,
  note          text,
  created_at    timestamptz not null default now(),
  check (approved_by is null or approved_by <> entered_by)
);
create index if not exists expenses_tenant_created_idx on public.expenses (tenant_id, created_at desc);

-- ── Ledger (append-only, hash chained) ──────────────────────────
create table if not exists public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  entry_date    date not null default current_date,
  account       text not null,
  narration     text not null,
  debit_paise   bigint not null default 0 check (debit_paise >= 0),
  credit_paise  bigint not null default 0 check (credit_paise >= 0),
  ref_type      text not null,
  ref_no        text,
  prev_hash     text,
  hash          text not null,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  check (debit_paise = 0 or credit_paise = 0)
);
create index if not exists ledger_tenant_created_idx on public.ledger_entries (tenant_id, created_at desc);

create table if not exists public.ledger_seals (
  tenant_id   uuid primary key references public.tenants(id) on delete cascade,
  head_hash   text not null,
  entry_count bigint not null default 0,
  sealed_at   timestamptz not null default now()
);

-- ── Approvals (maker–checker) ───────────────────────────────────
create table if not exists public.approvals (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  entity_type  text not null check (entity_type in ('payment','expense','waiver','member','fee_change')),
  entity_id    uuid not null,
  title        text not null,
  subtitle     text,
  amount_paise bigint,
  requested_by uuid references public.profiles(id),
  step         int not null default 1,
  total_steps  int not null default 2,
  status       approval_status not null default 'pending',
  decided_by   uuid references public.profiles(id),
  decided_at   timestamptz,
  decision_note text,
  created_at   timestamptz not null default now(),
  check (decided_by is null or decided_by <> requested_by)
);
create index if not exists approvals_tenant_status_idx on public.approvals (tenant_id, status);

-- ── Complaints & notices ────────────────────────────────────────
create table if not exists public.complaints (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  tracking_code text not null,
  category      text not null,
  subject       text not null,
  body          text not null,
  anonymous     boolean not null default false,
  member_id     uuid references public.members(id) on delete set null,
  status        complaint_status not null default 'open',
  priority      text not null default 'normal' check (priority in ('low','normal','high')),
  assigned_to   uuid references public.profiles(id),
  sla_hours     int not null default 72,
  resolved_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (tenant_id, tracking_code)
);

create table if not exists public.notices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  title        text not null,
  body         text not null,
  audience     text not null default 'all' check (audience in ('all','members','office_bearers')),
  pinned       boolean not null default false,
  published_at timestamptz not null default now(),
  expires_at   date,
  created_by   uuid references public.profiles(id)
);

-- ── Prayer timetable ────────────────────────────────────────────
create table if not exists public.prayer_days (
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  date          date not null,
  hijri         text,
  fajr          time,
  zuhr          time,
  asr           time,
  maghrib       time,
  isha          time,
  jumuah        time,
  iqamah_offset int not null default 10,
  source        text not null default 'calculated' check (source in ('calculated','manual','excel')),
  primary key (tenant_id, date)
);

-- ── Integrations (plug-and-play keys, encrypted at rest) ────────
create table if not exists public.integrations (
  id             uuid primary key default gen_random_uuid(),
  scope          text not null default 'tenant' check (scope in ('platform','tenant')),
  tenant_id      uuid references public.tenants(id) on delete cascade,
  type           text not null check (type in ('payment','sms','whatsapp','email','push')),
  provider       text not null,
  mode           text not null default 'test' check (mode in ('test','live')),
  enabled        boolean not null default false,
  config         jsonb not null default '{}'::jsonb,
  secret_ref     text,
  status         text not null default 'not_configured',
  last_tested_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (scope, tenant_id, type, provider)
);

-- ── Audit log ───────────────────────────────────────────────────
create table if not exists public.audit_log (
  id         bigserial primary key,
  tenant_id  uuid references public.tenants(id) on delete cascade,
  actor_id   uuid references public.profiles(id),
  action     text not null,
  entity     text,
  entity_id  uuid,
  meta       jsonb not null default '{}'::jsonb,
  ip         inet,
  created_at timestamptz not null default now()
);
create index if not exists audit_tenant_created_idx on public.audit_log (tenant_id, created_at desc);

-- ── updated_at helper ───────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists tenants_touch on public.tenants;
create trigger tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();

drop trigger if exists members_touch on public.members;
create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- ═══════════ 0002_rls.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0002 · Row Level Security
--
-- Rule: a tenant user can only ever see rows where
--       tenant_id = current_tenant_id().
-- Super admins bypass tenant scoping for platform management.
-- Helpers are SECURITY DEFINER so they can read `profiles`
-- without triggering RLS recursion.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.current_profile()
returns public.profiles
language sql stable security definer set search_path = public
as $$
  select * from public.profiles where id = auth.uid();
$$;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.current_role()
returns app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role = 'super_admin' and is_active from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.is_office_bearer()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('sadar','khajanchi','secretary','auditor') from public.profiles where id = auth.uid() and is_active),
    false
  );
$$;

-- Turn RLS on everywhere.
alter table public.tenants            enable row level security;
alter table public.profiles           enable row level security;
alter table public.members            enable row level security;
alter table public.fee_plans          enable row level security;
alter table public.fee_overrides      enable row level security;
alter table public.invoices           enable row level security;
alter table public.receipt_sequences  enable row level security;
alter table public.payments           enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.funds              enable row level security;
alter table public.expenses           enable row level security;
alter table public.ledger_entries     enable row level security;
alter table public.ledger_seals       enable row level security;
alter table public.approvals          enable row level security;
alter table public.complaints         enable row level security;
alter table public.notices            enable row level security;
alter table public.prayer_days        enable row level security;
alter table public.integrations       enable row level security;
alter table public.audit_log          enable row level security;

-- ── Profiles ────────────────────────────────────────────────────
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
  for select using (id = auth.uid() or public.is_super_admin()
                    or (tenant_id = public.current_tenant_id() and public.is_office_bearer()));

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ── Tenants ─────────────────────────────────────────────────────
drop policy if exists tenants_read on public.tenants;
create policy tenants_read on public.tenants
  for select using (id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists tenants_admin_write on public.tenants;
create policy tenants_admin_write on public.tenants
  for all using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists tenants_self_update on public.tenants;
create policy tenants_self_update on public.tenants
  for update using (id = public.current_tenant_id()
                    and public.current_role() in ('sadar','secretary'))
  with check (id = public.current_tenant_id());

-- ── Generic tenant-scoped tables ────────────────────────────────
-- Read + insert are granted to the tenant. Update is granted only
-- where a row may legitimately change (see the explicit block below).
do $$
declare
  t text;
  tables text[] := array[
    'members','fee_plans','fee_overrides','invoices','receipt_sequences',
    'payments','funds','expenses','ledger_entries',
    'ledger_seals','approvals','complaints','notices','prayer_days','integrations'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I_tenant_read on public.%I', t, t);
    execute format(
      'create policy %I_tenant_read on public.%I for select
         using (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      t, t
    );

    execute format('drop policy if exists %I_tenant_insert on public.%I', t, t);
    execute format(
      'create policy %I_tenant_insert on public.%I for insert
         with check (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      t, t
    );
  end loop;
end $$;

-- Tables whose rows may be edited after creation.
do $$
declare
  t text;
  tables text[] := array[
    'members','fee_plans','fee_overrides','invoices','funds','expenses',
    'approvals','complaints','notices','prayer_days','integrations'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I_tenant_update on public.%I', t, t);
    execute format(
      'create policy %I_tenant_update on public.%I for update
         using (tenant_id = public.current_tenant_id() or public.is_super_admin())
         with check (tenant_id = public.current_tenant_id() or public.is_super_admin())',
      t, t
    );
  end loop;
end $$;

-- ── Payment allocations ────────────────────────────────────────
-- This table has no tenant_id; it inherits the tenant from its
-- parent payment. Reads are allowed through that join, writes are
-- never allowed from a browser (only the verification RPC writes).
drop policy if exists payment_allocations_read on public.payment_allocations;
create policy payment_allocations_read on public.payment_allocations
  for select using (
    public.is_super_admin()
    or exists (
      select 1 from public.payments p
      where p.id = payment_id
        and p.tenant_id = public.current_tenant_id()
    )
  );

-- ── Append-only tables: no update / delete for anyone ───────────
-- (Cleanup happens only through a privileged service_role job.)
do $$
declare
  t text;
  tables text[] := array['ledger_entries','ledger_seals','payment_allocations','receipt_sequences'];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I_no_update on public.%I', t, t);
    execute format('create policy %I_no_update on public.%I as restrictive for update using (false)', t, t);

    execute format('drop policy if exists %I_no_delete on public.%I', t, t);
    execute format('create policy %I_no_delete on public.%I as restrictive for delete using (false)', t, t);
  end loop;
end $$;

-- ── Members can read only their own invoices / payments ─────────
drop policy if exists invoices_member_self on public.invoices;
create policy invoices_member_self on public.invoices
  for select using (
    member_id in (
      select m.id from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
    )
  );

drop policy if exists payments_member_self on public.payments;
create policy payments_member_self on public.payments
  for select using (
    member_id in (
      select m.id from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
    )
  );

-- ── Complaints: anonymous submitters keep access via tracking code ─
drop policy if exists complaints_member_insert on public.complaints;
create policy complaints_member_insert on public.complaints
  for insert with check (tenant_id = public.current_tenant_id());

-- ── Audit log is read-only for office bearers, write via triggers ─
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log
  for select using (public.is_super_admin()
                    or (tenant_id = public.current_tenant_id()
                        and public.current_role() in ('sadar','auditor')));

-- ── Storage: receipts / bills / photos stay per tenant ──────────
-- Buckets are created separately; policy below assumes a bucket
-- named `tenant-files` with path prefix `<tenant_id>/…`.
drop policy if exists storage_tenant_read on storage.objects;
create policy storage_tenant_read on storage.objects
  for select using (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

drop policy if exists storage_tenant_write on storage.objects;
create policy storage_tenant_write on storage.objects
  for insert with check (
    bucket_id = 'tenant-files'
    and (storage.foldername(name))[1] = public.current_tenant_id()::text
  );

-- ═══════════ 0003_functions.sql ═══════════
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
  if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Not allowed to verify payments';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from v_tenant then raise exception 'Wrong tenant'; end if;
  if p.status <> 'pending' then raise exception 'Payment already %, not pending', p.status; end if;
  if p.entered_by is not distinct from auth.uid() then
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
  if coalesce(v_role in ('sadar','auditor'), false) is not true then
    raise exception 'Only the sadar or auditor can approve expenses';
  end if;

  select * into e from public.expenses where id = p_expense_id for update;
  if not found then raise exception 'Expense not found'; end if;
  if e.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if e.status <> 'pending' then raise exception 'Expense is not pending'; end if;
  if e.entered_by is not distinct from auth.uid() then raise exception 'Maker cannot approve their own expense'; end if;

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
  if coalesce(public.current_role() in ('sadar','secretary'), false) is not true then
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

-- ── Explicit grants ─────────────────────────────────────────────
-- Functions are executable by PUBLIC by default. Close that off:
-- only a signed-in tenant user (or the server) may call these.
revoke all on function public.verify_payment(uuid) from public, anon;
revoke all on function public.approve_expense(uuid) from public, anon;
revoke all on function public.request_waiver(uuid, text[], text) from public, anon;

grant execute on function public.verify_payment(uuid) to authenticated;
grant execute on function public.approve_expense(uuid) to authenticated;
grant execute on function public.request_waiver(uuid, text[], text) to authenticated;

-- ═══════════ 0004_automation.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0004 · Automation, messaging & reconciliation
--
-- Everything a solo operator should never have to do by hand:
--   · monthly invoices            · dues reminders
--   · receipt messages            · notice broadcasts
--   · gateway webhook matching    · ledger verification
--   · subscription expiry
--
-- Also adds the financial guards: a payment, expense or ledger row
-- can only reach its final state through an approved RPC, never by
-- a direct table update from the browser.
--
-- Depends on: 0001 (tables), 0002 (helpers + RLS), 0003 (ledger).
-- ═══════════════════════════════════════════════════════════════

-- ── Optional extensions ─────────────────────────────────────────
-- Both ship with Supabase. On a plain Postgres install they may be
-- missing, so never fail the migration because of them.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
exception when others then
  raise notice 'pg_cron unavailable: %', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net;
  end if;
exception when others then
  raise notice 'pg_net unavailable: %', sqlerrm;
end $$;

-- ── Context helpers ─────────────────────────────────────────────

-- The role from the request JWT. PostgREST puts it in
-- `request.jwt.claim.role` (and, on newer versions, a full claims
-- document). Reading it from the settings — not from current_user —
-- is important: inside a SECURITY DEFINER function current_user is
-- the function owner, so it can never distinguish a service call.
create or replace function public.jwt_role()
returns text
language plpgsql stable
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.jwt.claim.role', true), '');
  if v is not null then
    return v;
  end if;

  begin
    v := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v := null;
  end;

  return v;
end $$;

-- True only for server-side calls that present the secret key
-- (Edge Functions, scheduled jobs). Never true for a browser.
create or replace function public.is_service_role()
returns boolean
language sql stable
as $$
  select public.jwt_role() = 'service_role';
$$;

-- True when the current statement runs as a privileged database
-- role: a direct service_role request, or any SECURITY DEFINER RPC
-- owned by postgres. Used by the financial guards below. A browser
-- session always runs as `authenticated`, so it can never be true.
create or replace function public.is_trusted_context()
returns boolean
language sql stable
as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

-- ── Per-tenant automation settings ──────────────────────────────
create table if not exists public.tenant_settings (
  tenant_id               uuid primary key references public.tenants(id) on delete cascade,
  auto_generate_invoices  boolean not null default true,
  auto_send_reminders     boolean not null default true,
  auto_verify_gateway     boolean not null default true,
  reminder_days           int[] not null default '{3,7,10,15}',
  invoice_due_day         int not null default 10 check (invoice_due_day between 1 and 28),
  receipt_footer          text,
  updated_at              timestamptz not null default now()
);

insert into public.tenant_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.ensure_tenant_settings()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.tenant_settings (tenant_id) values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end $$;

drop trigger if exists tenants_ensure_settings on public.tenants;
create trigger tenants_ensure_settings
  after insert on public.tenants
  for each row execute function public.ensure_tenant_settings();

drop trigger if exists tenant_settings_touch on public.tenant_settings;
create trigger tenant_settings_touch
  before update on public.tenant_settings
  for each row execute function public.touch_updated_at();

alter table public.tenant_settings enable row level security;

drop policy if exists tenant_settings_read on public.tenant_settings;
create policy tenant_settings_read on public.tenant_settings
  for select using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists tenant_settings_update on public.tenant_settings;
create policy tenant_settings_update on public.tenant_settings
  for update using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary'))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary'))
  );

-- ── Member contact preferences ──────────────────────────────────
alter table public.members
  add column if not exists whatsapp_opt_in boolean not null default true,
  add column if not exists sms_opt_in      boolean not null default true,
  add column if not exists email_opt_in    boolean not null default true,
  add column if not exists push_opt_in     boolean not null default true;

-- ── Integration secrets (server-only) ───────────────────────────
-- One row per integration. No RLS policy is created on purpose:
-- anon/authenticated get nothing, only service_role (which bypasses
-- RLS) can read a tenant's gateway / WhatsApp keys.
create table if not exists public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  tenant_id      uuid references public.tenants(id) on delete cascade,
  secret         jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

-- ── Outbound message queue ──────────────────────────────────────
create table if not exists public.notification_queue (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  channel             text not null check (channel in ('whatsapp','sms','email','push')),
  template            text not null,
  recipient           text not null,
  recipient_name      text,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'queued'
                      check (status in ('queued','sending','sent','failed','skipped','cancelled')),
  priority            int not null default 5,
  attempts            int not null default 0,
  max_attempts        int not null default 3,
  scheduled_at        timestamptz not null default now(),
  locked_at           timestamptz,
  sent_at             timestamptz,
  provider            text,
  provider_message_id text,
  cost_paise          int not null default 0,
  error               text,
  dedupe_key          text,
  created_at          timestamptz not null default now()
);

create unique index if not exists notification_queue_dedupe_idx
  on public.notification_queue (tenant_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_queue_pick_idx
  on public.notification_queue (status, priority, scheduled_at)
  where status = 'queued';

create index if not exists notification_queue_tenant_idx
  on public.notification_queue (tenant_id, created_at desc);

alter table public.notification_queue enable row level security;

drop policy if exists notification_queue_read on public.notification_queue;
create policy notification_queue_read on public.notification_queue
  for select using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists notification_queue_manual_insert on public.notification_queue;
create policy notification_queue_manual_insert on public.notification_queue
  for insert with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi'))
  );

-- ── Gateway webhook events (idempotency ledger) ─────────────────
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  event_id      text not null,
  tenant_id     uuid references public.tenants(id) on delete cascade,
  signature_ok  boolean not null default false,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'received'
                check (status in ('received','processed','ignored','failed')),
  payment_id    uuid references public.payments(id) on delete set null,
  error         text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  unique (provider, event_id)
);

create index if not exists webhook_events_tenant_idx
  on public.webhook_events (tenant_id, received_at desc);

alter table public.webhook_events enable row level security;

drop policy if exists webhook_events_read on public.webhook_events;
create policy webhook_events_read on public.webhook_events
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','auditor','khajanchi'))
  );

-- ── Job history (what ran, when, with what result) ──────────────
create table if not exists public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  job         text not null,
  status      text not null default 'running'
              check (status in ('running','success','failed','skipped')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  stats       jsonb not null default '{}'::jsonb,
  error       text
);

create index if not exists job_runs_started_idx on public.job_runs (started_at desc);

alter table public.job_runs enable row level security;

drop policy if exists job_runs_read on public.job_runs;
create policy job_runs_read on public.job_runs
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','auditor'))
  );

-- ═══════════════════════════════════════════════════════════════
-- Channel selection: WhatsApp first, SMS fallback, but only if the
-- tenant has that integration enabled and the member opted in.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.pick_channel(
  p_tenant uuid,
  p_whatsapp_opt boolean,
  p_sms_opt boolean
) returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_whatsapp_opt and exists (
      select 1 from public.integrations
      where tenant_id = p_tenant and type = 'whatsapp' and enabled
    ) then 'whatsapp'
    when p_sms_opt and exists (
      select 1 from public.integrations
      where tenant_id = p_tenant and type = 'sms' and enabled
    ) then 'sms'
    else null
  end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC · generate_monthly_invoices
-- Idempotent: running it twice in a month creates nothing new.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.generate_monthly_invoices(
  p_tenant uuid,
  p_period text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_period   text;
  v_due_day  int := 10;
  v_start    date;
  v_due_date date;
  v_created  int := 0;
  v_total    bigint := 0;
  v_ins      int := 0;
  r          record;
begin
  if coalesce(public.is_service_role()
             or public.is_super_admin()
             or (public.current_tenant_id() = p_tenant
                 and public.current_role() in ('sadar','secretary','khajanchi')), false) is not true then
    raise exception 'Not allowed to generate invoices for this tenant';
  end if;

  v_period := coalesce(p_period, to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  if v_period !~ '^\d{4}-\d{2}$' then
    raise exception 'Invalid period % (expected YYYY-MM)', v_period;
  end if;

  select invoice_due_day into v_due_day
  from public.tenant_settings where tenant_id = p_tenant;
  v_due_day := coalesce(v_due_day, 10);

  v_start := to_date(v_period || '-01', 'YYYY-MM-DD');
  v_due_date := v_start + (v_due_day - 1);

  for r in
    select m.id as member_id,
           coalesce(o.amount_paise, m.fee_paise) as amount_paise
    from public.members m
    left join public.fee_overrides o
      on o.member_id = m.id and o.approved_by is not null
    where m.tenant_id = p_tenant
      and m.status = 'active'
      and m.member_type <> 'staff'
      and m.joined_on <= (v_start + interval '1 month' - interval '1 day')::date
      and coalesce(o.amount_paise, m.fee_paise) > 0
  loop
    insert into public.invoices
      (tenant_id, member_id, period, amount_paise, due_date)
    values
      (p_tenant, r.member_id, v_period, r.amount_paise, v_due_date)
    on conflict (tenant_id, member_id, period) do nothing;

    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      v_created := v_created + 1;
      v_total := v_total + r.amount_paise;
    end if;
  end loop;

  return jsonb_build_object(
    'tenant_id', p_tenant,
    'period', v_period,
    'created', v_created,
    'amount_paise', v_total,
    'due_date', v_due_date
  );
end $$;

revoke all on function public.generate_monthly_invoices(uuid, text) from public;
grant execute on function public.generate_monthly_invoices(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- RPC · queue_reminders
-- Queues one message per unpaid invoice, deduplicated per day.
-- The actual send happens in the send-queue Edge Function.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.queue_reminders(
  p_tenant uuid,
  p_period text default null,
  p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_day     int := extract(day from (now() at time zone 'Asia/Kolkata'))::int;
  v_period  text := coalesce(p_period, to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  v_days    int[];
  v_auto    boolean := true;
  v_created int := 0;
  v_skipped int := 0;
  v_ins     int := 0;
  v_channel text;
  r         record;
begin
  if coalesce(public.is_service_role()
             or public.is_super_admin()
             or (public.current_tenant_id() = p_tenant
                 and public.current_role() in ('sadar','secretary','khajanchi')), false) is not true then
    raise exception 'Not allowed to queue reminders for this tenant';
  end if;

  select reminder_days, auto_send_reminders
    into v_days, v_auto
  from public.tenant_settings where tenant_id = p_tenant;

  v_days := coalesce(v_days, '{3,7,10,15}');
  v_auto := coalesce(v_auto, true);

  if not v_auto and not public.is_service_role() then
    return jsonb_build_object('period', v_period, 'created', 0, 'reason', 'reminders_disabled');
  end if;
  if not p_force and not (v_day = any (v_days)) then
    return jsonb_build_object(
      'period', v_period, 'created', 0,
      'reason', 'not_a_reminder_day', 'day', v_day
    );
  end if;

  for r in
    select i.id as invoice_id,
           i.period,
           (i.amount_paise - i.paid_paise) as due_paise,
           i.due_date,
           m.id as member_id,
           m.name,
           m.phone,
           m.whatsapp_opt_in,
           m.sms_opt_in
    from public.invoices i
    join public.members m on m.id = i.member_id
    where i.tenant_id = p_tenant
      and i.period = v_period
      and i.status in ('pending','partial')
      and i.amount_paise > i.paid_paise
      and m.status = 'active'
      and m.phone is not null
  loop
    v_channel := public.pick_channel(p_tenant, r.whatsapp_opt_in, r.sms_opt_in);
    if v_channel is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    values
      (p_tenant,
       v_channel,
       case when r.due_date < v_today then 'overdue_notice' else 'dues_reminder' end,
       r.phone,
       r.name,
       jsonb_build_object(
         'member_id', r.member_id,
         'member_name', r.name,
         'invoice_id', r.invoice_id,
         'period', r.period,
         'month_label', to_char(to_date(r.period || '-01', 'YYYY-MM-DD'), 'Mon YYYY'),
         'amount_paise', r.due_paise,
         'due_date', r.due_date,
         'overdue', r.due_date < v_today
       ),
       'reminder:' || r.invoice_id::text || ':' || v_period || ':' || v_day::text)
    on conflict do nothing;

    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'period', v_period, 'created', v_created,
    'skipped', v_skipped, 'reason', 'queued'
  );
end $$;

revoke all on function public.queue_reminders(uuid, text, boolean) from public;
grant execute on function public.queue_reminders(uuid, text, boolean) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- Instant notice broadcast. A trigger, so publishing a notice from
-- any client (web or Android) always fans out the same way.
-- Audience is honoured: office-bearer notices never go to members.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.broadcast_notice(p_notice_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  n       public.notices;
  v_count int := 0;
  v_part  int := 0;
begin
  select * into n from public.notices where id = p_notice_id;
  if not found then
    return 0;
  end if;

  -- Scheduled notices wait for their publish time. The nightly job
  -- calls this function again once the time has passed.
  if n.published_at is not null and n.published_at > now() then
    return 0;
  end if;

  if n.audience = 'office_bearers' then
    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    select
      n.tenant_id,
      public.pick_channel(n.tenant_id, true, true),
      'notice_alert',
      p.phone,
      p.full_name,
      jsonb_build_object(
        'notice_id', n.id,
        'member_id', p.member_id,
        'member_name', p.full_name,
        'title', n.title,
        'body', n.body,
        'pinned', n.pinned
      ),
      'notice:' || n.id::text || ':p:' || p.id::text
    from public.profiles p
    where p.tenant_id = n.tenant_id
      and p.is_active
      and p.role in ('sadar','khajanchi','secretary','auditor')
      and p.phone is not null
      and public.pick_channel(n.tenant_id, true, true) is not null
    on conflict do nothing;
  else
    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    select
      n.tenant_id,
      public.pick_channel(n.tenant_id, m.whatsapp_opt_in, m.sms_opt_in),
      'notice_alert',
      m.phone,
      m.name,
      jsonb_build_object(
        'notice_id', n.id,
        'member_id', m.id,
        'member_name', m.name,
        'title', n.title,
        'body', n.body,
        'pinned', n.pinned
      ),
      'notice:' || n.id::text || ':m:' || m.id::text
    from public.members m
    where m.tenant_id = n.tenant_id
      and m.status = 'active'
      and m.phone is not null
      and public.pick_channel(n.tenant_id, m.whatsapp_opt_in, m.sms_opt_in) is not null
    on conflict do nothing;
  end if;

  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  return v_count;
end $$;

revoke all on function public.broadcast_notice(uuid) from public;
grant execute on function public.broadcast_notice(uuid) to service_role;

create or replace function public.queue_notice_broadcast()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.broadcast_notice(new.id);
  return new;
end $$;

drop trigger if exists notices_queue_broadcast on public.notices;
create trigger notices_queue_broadcast
  after insert on public.notices
  for each row execute function public.queue_notice_broadcast();

-- Scheduled notices that have come due since the last run.
create or replace function public.publish_due_notices()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r       record;
  v_total int := 0;
begin
  if public.is_service_role() is not true then
    raise exception 'Only the scheduler can publish notices';
  end if;

  for r in
    select id from public.notices
    where published_at is not null
      and published_at <= now()
      and published_at > now() - interval '2 days'
  loop
    v_total := v_total + public.broadcast_notice(r.id);
  end loop;

  return v_total;
end $$;

revoke all on function public.publish_due_notices() from public;
grant execute on function public.publish_due_notices() to service_role;

-- ═══════════════════════════════════════════════════════════════
-- Instant receipt message after a payment is verified.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.queue_payment_receipt()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_member  public.members;
  v_channel text;
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    select * into v_member from public.members where id = new.member_id;
    if v_member.id is null or v_member.phone is null then
      return new;
    end if;

    v_channel := public.pick_channel(new.tenant_id, v_member.whatsapp_opt_in, v_member.sms_opt_in);
    if v_channel is null then
      return new;
    end if;

    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    values
      (new.tenant_id, v_channel, 'receipt_issued', v_member.phone, v_member.name,
       jsonb_build_object(
         'member_id', new.member_id,
         'member_name', v_member.name,
         'payment_id', new.id,
         'receipt_no', new.receipt_no,
         'amount_paise', new.amount_paise
       ),
       'receipt:' || new.id::text)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists payments_queue_receipt on public.payments;
create trigger payments_queue_receipt
  after update of status on public.payments
  for each row execute function public.queue_payment_receipt();

-- ═══════════════════════════════════════════════════════════════
-- Payment allocation (single place where dues are settled)
-- ═══════════════════════════════════════════════════════════════

-- Overpayments are kept visible instead of being silently absorbed.
alter table public.payments
  add column if not exists unallocated_paise bigint not null default 0
  check (unallocated_paise >= 0);

-- One gateway order can produce exactly one payment row, even when a
-- webhook is delivered twice at the same moment.
create unique index if not exists payments_gateway_reference_unique
  on public.payments (tenant_id, reference)
  where method = 'gateway' and reference is not null;

-- The one function allowed to move a payment to `verified`.
create or replace function public.apply_verified_payment(
  p_payment_id uuid,
  p_verified_by uuid,
  p_note text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  p         public.payments;
  v_receipt text;
  v_left    bigint;
  v_due     bigint;
  v_take    bigint;
  r         record;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment % not found', p_payment_id;
  end if;
  if p.status <> 'pending' then
    raise exception 'Payment is %, not pending', p.status;
  end if;

  v_receipt := public.next_receipt_no(p.tenant_id);
  v_left := p.amount_paise;

  for r in
    select * from public.invoices
    where tenant_id = p.tenant_id
      and member_id = p.member_id
      and status in ('pending','partial')
    order by period asc
    for update
  loop
    exit when v_left <= 0;

    v_due := r.amount_paise - r.paid_paise;
    continue when v_due <= 0;

    v_take := least(v_due, v_left);

    update public.invoices
      set paid_paise = paid_paise + v_take
      where id = r.id;

    insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
    values (p.id, r.id, v_take)
    on conflict (payment_id, invoice_id) do update
      set amount_paise = public.payment_allocations.amount_paise + excluded.amount_paise;

    v_left := v_left - v_take;
  end loop;

  update public.payments
    set status = 'verified',
        receipt_no = v_receipt,
        verified_by = p_verified_by,
        verified_at = now(),
        unallocated_paise = v_left,
        note = coalesce(p_note, p.note)
    where id = p.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (p.tenant_id, current_date,
     case when p.method = 'cash' then 'Cash' else 'Bank' end,
     'Chanda received · ' || coalesce(p.reference, '')
       || case when v_left > 0 then ' · advance' else '' end,
     p.amount_paise, 0, 'payment', v_receipt, p_verified_by);

  return v_receipt;
end $$;

revoke all on function public.apply_verified_payment(uuid, uuid, text) from public;
grant execute on function public.apply_verified_payment(uuid, uuid, text) to service_role;

-- Human verification. Same rules as before, now delegating the
-- allocation + ledger work to the function above.
create or replace function public.verify_payment(p_payment_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  p        public.payments;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
begin
  if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Not allowed to verify payments';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from v_tenant then raise exception 'Wrong tenant'; end if;
  if p.status <> 'pending' then raise exception 'Payment already %', p.status; end if;
  if p.entered_by is not distinct from auth.uid() then
    raise exception 'Maker cannot verify their own entry';
  end if;

  return public.apply_verified_payment(p_payment_id, auth.uid(), null);
end $$;

-- System verification, only for payments recorded by a signed
-- gateway webhook (entered_by is null). Never exposed to clients.
create or replace function public.verify_payment_auto(
  p_payment_id uuid,
  p_note text default 'auto-reconciled from gateway webhook'
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  p public.payments;
begin
  if public.is_service_role() is not true then
    raise exception 'Auto-verification is a server-only operation';
  end if;

  select * into p from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if p.entered_by is not null then
    raise exception 'Only gateway-recorded payments can be auto-verified';
  end if;
  if p.method is distinct from 'gateway' then
    raise exception 'Only gateway payments can be auto-verified';
  end if;

  return public.apply_verified_payment(p_payment_id, null, p_note);
end $$;

revoke all on function public.verify_payment_auto(uuid, text) from public;
grant execute on function public.verify_payment_auto(uuid, text) to service_role;

-- ── Reject a pending payment (money never entered the books) ────
create or replace function public.reject_payment(
  p_payment_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  p public.payments;
begin
  if coalesce(public.current_role() in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Not allowed to reject payments';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if p.status <> 'pending' then raise exception 'Only a pending payment can be rejected'; end if;

  update public.payments
    set status = 'rejected',
        note = coalesce(p_reason, note)
    where id = p.id;
end $$;

revoke all on function public.reject_payment(uuid, text) from public;
grant execute on function public.reject_payment(uuid, text) to authenticated;

-- ── Reverse a verified payment (contra entry, never a delete) ───
-- Used when a cheque bounces, a UPI transfer is charged back, or the
-- office realises an entry was duplicated. The ledger keeps both
-- entries, so the history stays explainable.
create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  p       public.payments;
  v_alloc record;
  v_role  app_role := public.current_role();
begin
  if coalesce(v_role in ('sadar','auditor'), false) is not true then
    raise exception 'Only the sadar or auditor can reverse a payment';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reverse a payment';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if p.status <> 'verified' then raise exception 'Only a verified payment can be reversed'; end if;

  -- Un-settle the invoices this payment paid for.
  for v_alloc in
    select * from public.payment_allocations where payment_id = p.id
  loop
    update public.invoices
      set paid_paise = greatest(paid_paise - v_alloc.amount_paise, 0)
      where id = v_alloc.invoice_id;
  end loop;

  delete from public.payment_allocations where payment_id = p.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (p.tenant_id, current_date,
     case when p.method = 'cash' then 'Cash' else 'Bank' end,
     'Payment reversed · ' || coalesce(p.receipt_no, left(p.id::text, 8)) || ' · ' || p_reason,
     0, p.amount_paise, 'reversal', p.receipt_no, auth.uid());

  update public.payments
    set status = 'rejected',
        unallocated_paise = 0,
        note = coalesce(note || ' | ', '') || 'Reversed: ' || p_reason
    where id = p.id;
end $$;

revoke all on function public.reverse_payment(uuid, text) from public;
grant execute on function public.reverse_payment(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Financial guards
-- Nothing reaches "verified" / "approved" by a direct table write.
-- ═══════════════════════════════════════════════════════════════

-- Payments: inserts from a browser are always pending and receipt-less.
create or replace function public.guard_payment_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.status       := 'pending';
    new.receipt_no   := null;
    new.verified_by  := null;
    new.verified_at  := null;
    new.unallocated_paise := 0;
    new.entered_by   := coalesce(new.entered_by, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists payments_guard_insert on public.payments;
create trigger payments_guard_insert
  before insert on public.payments
  for each row execute function public.guard_payment_insert();

-- Payments: money fields and workflow fields are immutable outside RPCs.
-- Notes and references may still be corrected while pending.
create or replace function public.guard_payment_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.tenant_id     is distinct from old.tenant_id
     or new.member_id  is distinct from old.member_id
     or new.amount_paise is distinct from old.amount_paise
     or new.method     is distinct from old.method
     or new.entered_by is distinct from old.entered_by
     or new.status     is distinct from old.status
     or new.receipt_no is distinct from old.receipt_no
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.unallocated_paise is distinct from old.unallocated_paise then
    raise exception 'Use the verification workflow to change a payment';
  end if;

  return new;
end $$;

drop trigger if exists payments_guard_update on public.payments;
create trigger payments_guard_update
  before update on public.payments
  for each row execute function public.guard_payment_update();

-- Invoices: paid_paise only moves through a verified payment.
create or replace function public.guard_invoice_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.paid_paise is distinct from old.paid_paise then
    raise exception 'Invoice dues can only be settled by a verified payment';
  end if;

  if new.amount_paise is distinct from old.amount_paise
     or new.member_id is distinct from old.member_id
     or new.period is distinct from old.period
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'Invoice identity cannot be edited';
  end if;

  if new.status is distinct from old.status then
    if coalesce(new.status = 'waived'
                and public.current_role() in ('sadar','secretary')
                and new.waived_reason is not null
                and new.waived_by is not distinct from auth.uid(), false) is not true then
      raise exception 'Only a waiver can change invoice status directly';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists invoices_guard_update on public.invoices;
create trigger invoices_guard_update
  before update on public.invoices
  for each row execute function public.guard_invoice_update();

-- Expenses: a browser can only create a pending bill.
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
  end if;
  return new;
end $$;

drop trigger if exists expenses_guard_insert on public.expenses;
create trigger expenses_guard_insert
  before insert on public.expenses
  for each row execute function public.guard_expense_insert();

-- While a bill is still pending its maker may fix a typo. Once it
-- has been approved, nothing about the money may change.
create or replace function public.guard_expense_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.status      is distinct from old.status
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.entered_by  is distinct from old.entered_by then
    raise exception 'Use the approval workflow to change an expense';
  end if;

  if old.status <> 'pending'
     and (new.amount_paise is distinct from old.amount_paise
          or new.fund_id is distinct from old.fund_id) then
    raise exception 'An approved expense can no longer be edited';
  end if;

  return new;
end $$;

drop trigger if exists expenses_guard_update on public.expenses;
create trigger expenses_guard_update
  before update on public.expenses
  for each row execute function public.guard_expense_update();

-- Funds: balances only move through approved expenses.
create or replace function public.guard_fund_update()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context()
     and new.balance_paise is distinct from old.balance_paise then
    raise exception 'Fund balances only change through approved expenses';
  end if;
  return new;
end $$;

drop trigger if exists funds_guard_update on public.funds;
create trigger funds_guard_update
  before update on public.funds
  for each row execute function public.guard_fund_update();

-- Ledger and receipt sequences are written by RPCs only. Direct
-- writes from anon/authenticated are revoked, so a compromised
-- office-bearer token still cannot forge a receipt.
revoke insert, update, delete on public.ledger_entries from anon, authenticated;
revoke insert, update, delete on public.ledger_seals from anon, authenticated;
revoke insert, update, delete on public.receipt_sequences from anon, authenticated;
revoke insert, update, delete on public.payment_allocations from anon, authenticated;

-- Sealing must work even when the writing role is not the table
-- owner. (Re-created here so the revoked grants above do not break
-- the definer context.)
create or replace function public.ledger_append()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_prev text;
begin
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

create or replace function public.ledger_seal()
returns trigger
language plpgsql security definer set search_path = public
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

-- ═══════════════════════════════════════════════════════════════
-- Write policies by role
--
-- 0002 granted INSERT/UPDATE on every tenant table to every tenant
-- user, including plain members. That is fine for reading a
-- community notice board, but not for money. These policies replace
-- the blanket ones with an explicit role list.
-- ═══════════════════════════════════════════════════════════════

-- Tables that must never be written from a browser at all.
do $$
declare
  t text;
  tables text[] := array[
    'receipt_sequences','payment_allocations','ledger_entries','ledger_seals'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I_tenant_insert on public.%I', t, t);
    execute format('drop policy if exists %I_tenant_update on public.%I', t, t);
  end loop;
end $$;

-- ── Read policies: a member sees their own dues, not the village's ─
drop policy if exists invoices_tenant_read on public.invoices;
create policy invoices_tenant_read on public.invoices
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role()::text in ('sadar','khajanchi','secretary','auditor','collector'))
    or member_id in (
      select m.id from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
    )
  );

drop policy if exists payments_tenant_read on public.payments;
create policy payments_tenant_read on public.payments
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role()::text in ('sadar','khajanchi','secretary','auditor','collector'))
    or member_id in (
      select m.id from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
    )
  );

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('members',       array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('fee_plans',     array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('fee_overrides', array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('invoices',      array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('payments',      array['sadar','secretary','khajanchi','collector'],
                        array[]::text[],                               false),
      ('funds',         array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('expenses',      array['sadar','secretary','khajanchi','auditor'],
                        array['sadar','secretary','khajanchi','auditor'], true),
      ('approvals',     array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('complaints',    array['sadar','secretary','khajanchi','auditor','collector','member'],
                        array['sadar','secretary','khajanchi','auditor'], true),
      ('notices',       array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('prayer_days',   array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('integrations',  array['sadar','secretary'],
                        array['sadar','secretary'],                    true)
    ) as t(tbl, ins_roles, upd_roles, has_update)
  loop
    execute format('drop policy if exists %I_tenant_insert on public.%I', r.tbl, r.tbl);
    execute format(
      'create policy %I_tenant_insert on public.%I for insert
         with check (
           public.is_super_admin()
           or (tenant_id = public.current_tenant_id()
               and public.current_role()::text = any (%L::text[]))
         )',
      r.tbl, r.tbl, r.ins_roles
    );

    if r.has_update then
      execute format('drop policy if exists %I_tenant_update on public.%I', r.tbl, r.tbl);
      execute format(
        'create policy %I_tenant_update on public.%I for update
           using (
             public.is_super_admin()
             or (tenant_id = public.current_tenant_id()
                 and public.current_role()::text = any (%L::text[]))
           )
           with check (
             public.is_super_admin()
             or (tenant_id = public.current_tenant_id()
                 and public.current_role()::text = any (%L::text[]))
           )',
        r.tbl, r.tbl, r.upd_roles, r.upd_roles
      );
    end if;
  end loop;
end $$;

-- ── Column-level guards ─────────────────────────────────────────

-- A member may not give themselves a discount, change their type or
-- reactivate themselves. Only office bearers and the server can.
create or replace function public.guard_member_write()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.tenant_id   is distinct from old.tenant_id
     or new.code     is distinct from old.code
     or new.serial_no is distinct from old.serial_no
     or new.fee_paise is distinct from old.fee_paise
     or new.member_type is distinct from old.member_type
     or new.status   is distinct from old.status
     or new.joined_on is distinct from old.joined_on then
    raise exception 'Only the office can change membership or fee details';
  end if;

  return new;
end $$;

drop trigger if exists members_guard_write on public.members;
create trigger members_guard_write
  before update on public.members
  for each row execute function public.guard_member_write();

-- A browser-created invoice always starts unpaid and unwaived.
create or replace function public.guard_invoice_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.paid_paise    := 0;
    new.status        := 'pending';
    new.waived_reason := null;
    new.waived_by     := null;
  end if;
  return new;
end $$;

drop trigger if exists invoices_guard_insert on public.invoices;
create trigger invoices_guard_insert
  before insert on public.invoices
  for each row execute function public.guard_invoice_insert();

-- A new fund starts at zero. Opening balances are a server-side,
-- audited adjustment, never a number typed into a web form.
create or replace function public.guard_fund_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.balance_paise := 0;
  end if;
  return new;
end $$;

drop trigger if exists funds_guard_insert on public.funds;
create trigger funds_guard_insert
  before insert on public.funds
  for each row execute function public.guard_fund_insert();

-- Approvals are created pending; only a server-side decision RPC may
-- set them to approved/rejected.
create or replace function public.guard_approval_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.status      := 'pending';
    new.decided_by  := null;
    new.decided_at  := null;
    new.decision_note := null;
    new.step        := 1;
  end if;
  return new;
end $$;

drop trigger if exists approvals_guard_insert on public.approvals;
create trigger approvals_guard_insert
  before insert on public.approvals
  for each row execute function public.guard_approval_insert();

-- Fee overrides need a second pair of eyes: a client insert is always
-- pending, and an approved override is locked.
create or replace function public.guard_fee_override_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;

drop trigger if exists fee_overrides_guard_insert on public.fee_overrides;
create trigger fee_overrides_guard_insert
  before insert on public.fee_overrides
  for each row execute function public.guard_fee_override_insert();

create or replace function public.guard_fee_override_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if old.approved_by is not null then
    raise exception 'An approved fee override is locked';
  end if;

  new.approved_by := null;
  new.approved_at := null;
  return new;
end $$;

drop trigger if exists fee_overrides_guard_update on public.fee_overrides;
create trigger fee_overrides_guard_update
  before update on public.fee_overrides
  for each row execute function public.guard_fee_override_update();

-- A tenant administrator may edit their masjid's address, logo and
-- UPI handle — never their own subscription plan or expiry date.
create or replace function public.guard_tenant_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.code              is distinct from old.code
     or new.status          is distinct from old.status
     or new.plan_type       is distinct from old.plan_type
     or new.plan_amount_paise is distinct from old.plan_amount_paise
     or new.plan_cycle      is distinct from old.plan_cycle
     or new.expires_at      is distinct from old.expires_at
     or new.grace_days      is distinct from old.grace_days
     or new.member_limit    is distinct from old.member_limit
     or new.features        is distinct from old.features then
    raise exception 'Subscription settings can only be changed by the platform admin';
  end if;

  return new;
end $$;

drop trigger if exists tenants_guard_update on public.tenants;
create trigger tenants_guard_update
  before update on public.tenants
  for each row execute function public.guard_tenant_update();

-- An integration's identity (what it is, whose it is) is fixed at
-- creation. Only the keys and the enabled flag live in the panel.
create or replace function public.guard_integration_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.scope     is distinct from old.scope
     or new.tenant_id is distinct from old.tenant_id
     or new.type    is distinct from old.type
     or new.provider is distinct from old.provider then
    raise exception 'Create a new integration instead of changing its type';
  end if;

  return new;
end $$;

drop trigger if exists integrations_guard_update on public.integrations;
create trigger integrations_guard_update
  before update on public.integrations
  for each row execute function public.guard_integration_update();

-- ── RPC · approve_fee_override ──────────────────────────────────
create or replace function public.approve_fee_override(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o public.fee_overrides;
begin
  if coalesce(public.current_role() in ('sadar','secretary') or public.is_super_admin(), false) is not true then
    raise exception 'Only the sadar or secretary can approve a fee override';
  end if;

  select * into o from public.fee_overrides where id = p_id for update;
  if not found then raise exception 'Fee override not found'; end if;
  if o.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if o.approved_by is not null then raise exception 'Already approved'; end if;

  update public.fee_overrides
    set approved_by = auth.uid(), approved_at = now()
    where id = o.id;
end $$;

revoke all on function public.approve_fee_override(uuid) from public;
grant execute on function public.approve_fee_override(uuid) to authenticated;

-- ── RPC · save_integration_secret ───────────────────────────────
-- The only way a key entered in the panel reaches the server-only
-- table. Nothing is ever returned to the browser.
create or replace function public.save_integration_secret(
  p_integration_id uuid,
  p_secret jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  i public.integrations;
begin
  select * into i from public.integrations where id = p_integration_id;
  if not found then raise exception 'Integration not found'; end if;

  if i.scope = 'platform' then
    if public.is_super_admin() is not true then
      raise exception 'Only the platform admin can edit platform keys';
    end if;
  elsif coalesce(public.is_super_admin()
                 or (i.tenant_id = public.current_tenant_id()
                     and public.current_role() in ('sadar','secretary')), false) is not true then
    raise exception 'Not allowed to edit this integration';
  end if;

  insert into public.integration_secrets (integration_id, tenant_id, secret, updated_at)
  values (i.id, i.tenant_id, coalesce(p_secret, '{}'::jsonb), now())
  on conflict (integration_id) do update
    set secret = excluded.secret,
        updated_at = now();

  update public.integrations
    set status = 'untested',
        last_tested_at = null
    where id = i.id;
end $$;

revoke all on function public.save_integration_secret(uuid, jsonb) from public;
grant execute on function public.save_integration_secret(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Queue worker primitives (service_role only)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.claim_notifications(p_limit int default 25)
returns setof public.notification_queue
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_service_role() is not true then
    raise exception 'Only the queue worker can claim notifications';
  end if;

  return query
  with picked as (
    select id from public.notification_queue
    where status = 'queued'
      and scheduled_at <= now()
    order by priority asc, scheduled_at asc
    limit greatest(1, least(coalesce(p_limit, 25), 200))
    for update skip locked
  )
  update public.notification_queue q
    set status = 'sending',
        locked_at = now(),
        attempts = q.attempts + 1
    from picked
    where q.id = picked.id
    returning q.*;
end $$;

revoke all on function public.claim_notifications(int) from public;
grant execute on function public.claim_notifications(int) to service_role;

create or replace function public.requeue_notifications()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
  v_part  int := 0;
begin
  if public.is_service_role() is not true then
    raise exception 'Only the queue worker can requeue notifications';
  end if;

  -- Exponential backoff: 10, 20, 40 minutes (capped at 60).
  update public.notification_queue
    set status = 'queued',
        scheduled_at = now()
          + make_interval(mins => least(60, 10 * power(2, greatest(attempts - 1, 0)))::int),
        error = null
    where status = 'failed'
      and attempts < max_attempts;
  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  -- A worker that died mid-send should not strand a message.
  update public.notification_queue
    set status = 'queued',
        scheduled_at = now()
    where status = 'sending'
      and locked_at < now() - interval '10 minutes'
      and attempts < max_attempts;
  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  return v_count;
end $$;

revoke all on function public.requeue_notifications() from public;
grant execute on function public.requeue_notifications() to service_role;

-- ── Cancel a queued message from the panel ──────────────────────
create or replace function public.cancel_notification(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  n public.notification_queue;
begin
  select * into n from public.notification_queue where id = p_id for update;
  if not found then raise exception 'Notification not found'; end if;

  if coalesce(public.is_super_admin()
              or (n.tenant_id = public.current_tenant_id()
                  and public.current_role() in ('sadar','secretary','khajanchi')), false) is not true then
    raise exception 'Not allowed to cancel this notification';
  end if;

  if n.status is null or n.status not in ('queued','failed') then
    raise exception 'A message that is % cannot be cancelled', coalesce(n.status, 'unknown');
  end if;

  update public.notification_queue set status = 'cancelled' where id = n.id;
end $$;

revoke all on function public.cancel_notification(uuid) from public;
grant execute on function public.cancel_notification(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- RPC · dashboard_snapshot
-- The home screen asks one question: "what needs me today?"
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

  select coalesce(sum(amount_paise - paid_paise), 0) into v_outstanding
  from public.invoices
  where tenant_id = v_tenant and status in ('pending','partial');

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

-- ═══════════════════════════════════════════════════════════════
-- RPC · expire_tenants (subscription lifecycle)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.expire_tenants()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
begin
  if public.is_service_role() is not true then
    raise exception 'Only the scheduler can expire tenants';
  end if;

  update public.tenants
    set status = 'read_only'
    where status in ('active','trial')
      and expires_at is not null
      and expires_at + make_interval(days => grace_days) < current_date;
  get diagnostics v_count = row_count;

  return v_count;
end $$;

revoke all on function public.expire_tenants() from public;
grant execute on function public.expire_tenants() to service_role;

-- ═══════════════════════════════════════════════════════════════
-- Seed: the demo tenant gets sensible automation settings.
-- ═══════════════════════════════════════════════════════════════
insert into public.tenant_settings
  (tenant_id, invoice_due_day, reminder_days, receipt_footer)
select id, 10, '{3,7,10,15}',
       'Jazak Allah khair. This is a computer-generated receipt.'
from public.tenants
on conflict (tenant_id) do nothing;

-- ═══════════ 0005_workflows.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0005 · Approval workflow
--
-- The panel shows one queue: payments to verify, expenses to
-- approve, waivers to sanction, fee changes to sign off. This
-- migration gives that queue a single, auditable decision point.
--
-- Nothing here can be skipped: the decision RPC re-checks the role,
-- the tenant and maker–checker, then delegates to the same money
-- functions the rest of the system uses.
--
-- Depends on: 0001 (tables), 0002 (RLS), 0003 (verify/approve),
--             0004 (fee overrides, guards).
-- ═══════════════════════════════════════════════════════════════

-- ── Waivers need to remember which months they cover ────────────
-- `entity_id` alone cannot express "waive Aug and Sep". A small
-- jsonb bag keeps the request self-describing without a new table.
alter table public.approvals
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- ── A request is immutable once decided ─────────────────────────
-- Direct table updates from a browser already cannot set
-- status/decided_by (guard_approval_insert only runs on insert), so
-- add the matching update guard.
create or replace function public.guard_approval_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.status      is distinct from old.status
     or new.decided_by is distinct from old.decided_by
     or new.decided_at is distinct from old.decided_at
     or new.decision_note is distinct from old.decision_note
     or new.step      is distinct from old.step then
    raise exception 'Use the approval workflow to decide a request';
  end if;

  if old.status <> 'pending' then
    raise exception 'A decided request is locked';
  end if;

  return new;
end $$;

drop trigger if exists approvals_guard_update on public.approvals;
create trigger approvals_guard_update
  before update on public.approvals
  for each row execute function public.guard_approval_update();

-- ── RPC · request_waiver (periods stored in meta) ───────────────
create or replace function public.request_waiver(
  p_member uuid,
  p_periods text[],
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_total  bigint := 0;
  v_id     uuid;
begin
  if coalesce(public.current_role() in ('sadar','secretary'), false) is not true then
    raise exception 'Not allowed to request waivers';
  end if;
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if p_periods is null or cardinality(p_periods) = 0 then
    raise exception 'Choose at least one month to waive';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required for a waiver';
  end if;

  select coalesce(sum(amount_paise - paid_paise), 0) into v_total
  from public.invoices
  where tenant_id = v_tenant
    and member_id = p_member
    and period = any (p_periods)
    and status in ('pending','partial');

  if v_total <= 0 then
    raise exception 'There are no unpaid dues in the selected months';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (v_tenant, 'waiver', p_member,
     'Waive dues — ' || (v_total / 100)::text,
     p_reason, v_total, auth.uid(), 1, 2,
     jsonb_build_object('periods', to_jsonb(p_periods)))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_waiver(uuid, text[], text) from public, anon;
grant execute on function public.request_waiver(uuid, text[], text) to authenticated;

-- ── RPC · decide_approval ───────────────────────────────────────
-- One function for the whole queue. It never trusts the client's
-- claim about what the request is: it re-reads the row, checks the
-- tenant, refuses self-approval and then calls the specialist RPC.
create or replace function public.decide_approval(
  p_approval_id uuid,
  p_approve boolean,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  a         public.approvals;
  v_role    app_role := public.current_role();
  v_tenant  uuid := public.current_tenant_id();
  v_periods text[];
  v_waived  int := 0;
  v_result  text := null;
  v_status  approval_status;
begin
  if coalesce(v_role in ('sadar','secretary','auditor','khajanchi'), false) is not true then
    raise exception 'Not allowed to decide approvals';
  end if;

  select * into a from public.approvals where id = p_approval_id for update;
  if not found then
    raise exception 'Approval not found';
  end if;
  if a.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if a.status <> 'pending' then
    raise exception 'This request is already %', a.status;
  end if;
  if a.requested_by is not distinct from auth.uid() then
    raise exception 'Maker cannot decide their own request';
  end if;

  if p_approve then
    case a.entity_type
      when 'payment' then
        if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
          raise exception 'Only the office can verify a payment';
        end if;
        v_result := public.verify_payment(a.entity_id);

      when 'expense' then
        if coalesce(v_role in ('sadar','auditor'), false) is not true then
          raise exception 'Only the sadar or auditor can approve an expense';
        end if;
        perform public.approve_expense(a.entity_id);

      when 'fee_change' then
        if coalesce(v_role in ('sadar','secretary'), false) is not true then
          raise exception 'Only the sadar or secretary can approve a fee change';
        end if;
        perform public.approve_fee_override(a.entity_id);

      when 'waiver' then
        if coalesce(v_role in ('sadar','secretary'), false) is not true then
          raise exception 'Only the sadar or secretary can sanction a waiver';
        end if;

        select coalesce(array_agg(value::text), array[]::text[])
          into v_periods
        from jsonb_array_elements_text(coalesce(a.meta -> 'periods', '[]'::jsonb));

        if cardinality(v_periods) = 0 then
          raise exception 'This waiver has no months attached';
        end if;

        update public.invoices
          set status = 'waived',
              waived_reason = coalesce(p_note, a.subtitle, 'Approved waiver'),
              waived_by = auth.uid()
          where tenant_id = a.tenant_id
            and member_id = a.entity_id
            and period = any (v_periods)
            and status in ('pending','partial');
        get diagnostics v_waived = row_count;

        if v_waived = 0 then
          raise exception 'Nothing left to waive — the dues were already settled';
        end if;
        v_result := v_waived::text;

      else
        -- 'member' and any future request type: recording the
        -- decision is the whole action.
        v_result := a.entity_type;
    end case;
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.approvals
    set status = v_status,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = p_note
    where id = a.id;

  return jsonb_build_object(
    'approval_id', a.id,
    'entity_type', a.entity_type,
    'status', v_status,
    'waived', v_waived,
    'result', v_result
  );
end $$;

revoke all on function public.decide_approval(uuid, boolean, text) from public, anon;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;

-- ── RPC · my_work_queue ─────────────────────────────────────────
-- The dashboard's "what needs me today" list. Reads only the
-- caller's tenant; returns counts and the oldest few items.
create or replace function public.my_work_queue(p_limit int default 20)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_limit  int := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if coalesce(public.is_office_bearer()
              or public.current_role() = 'collector', false) is not true then
    raise exception 'Not allowed to read the work queue';
  end if;

  return jsonb_build_object(
    'pending_payments', (
      select count(*) from public.payments
      where tenant_id = v_tenant and status = 'pending'
    ),
    'pending_expenses', (
      select count(*) from public.expenses
      where tenant_id = v_tenant and status = 'pending'
    ),
    'pending_approvals', (
      select count(*) from public.approvals
      where tenant_id = v_tenant and status = 'pending'
    ),
    'overdue_invoices', (
      select count(*) from public.invoices
      where tenant_id = v_tenant
        and status in ('pending','partial')
        and due_date < (now() at time zone 'Asia/Kolkata')::date
    ),
    'unallocated_paise', (
      select coalesce(sum(unallocated_paise), 0) from public.payments
      where tenant_id = v_tenant and unallocated_paise > 0
    ),
    'items', coalesce((
      select jsonb_agg(item)
      from (
        select item
        from (
          select jsonb_build_object(
            'kind', 'payment',
            'id', p.id,
            'title', 'Verify payment · ' || m.name,
            'subtitle', '₹' || (p.amount_paise / 100)::text || ' · ' || p.method,
            'created_at', p.created_at
          ) as item, p.created_at
          from public.payments p
          join public.members m on m.id = p.member_id
          where p.tenant_id = v_tenant and p.status = 'pending'

          union all

          select jsonb_build_object(
            'kind', 'expense',
            'id', e.id,
            'title', 'Approve bill · ' || e.vendor,
            'subtitle', e.category || ' · ₹' || (e.amount_paise / 100)::text,
            'created_at', e.created_at
          ) as item, e.created_at
          from public.expenses e
          where e.tenant_id = v_tenant and e.status = 'pending'

          union all

          select jsonb_build_object(
            'kind', 'approval',
            'id', a.id,
            'title', a.title,
            'subtitle', coalesce(a.subtitle, a.entity_type),
            'created_at', a.created_at
          ) as item, a.created_at
          from public.approvals a
          where a.tenant_id = v_tenant and a.status = 'pending'
        ) unioned
        order by created_at asc
        limit v_limit
      ) q
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.my_work_queue(int) from public, anon;
grant execute on function public.my_work_queue(int) to authenticated;

-- ═══════════ 0006_expense_reject.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0006 · Rejecting an expense
--
-- The queue could approve a bill but had no way to reject one. A
-- rejected bill must leave the fund untouched and stay visible, so
-- this adds a maker–checker RPC and makes decide_approval cascade a
-- rejection to the underlying record.
--
-- Depends on: 0003 (approve_expense), 0004 (guards, reject_payment),
--             0005 (decide_approval).
-- ═══════════════════════════════════════════════════════════════

-- ── RPC · reject_expense ────────────────────────────────────────
create or replace function public.reject_expense(
  p_expense_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  e        public.expenses;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
begin
  if coalesce(v_role in ('sadar','secretary','auditor'), false) is not true then
    raise exception 'Not allowed to reject expenses';
  end if;

  select * into e from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found';
  end if;
  if e.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if e.status <> 'pending' then
    raise exception 'Expense is already %', e.status;
  end if;
  if e.entered_by is not distinct from auth.uid() then
    raise exception 'Maker cannot reject their own entry';
  end if;

  update public.expenses
    set status = 'rejected',
        approved_by = auth.uid(),
        approved_at = now(),
        note = coalesce(nullif(btrim(p_reason), ''), e.note, 'Rejected')
    where id = e.id;
end $$;

revoke all on function public.reject_expense(uuid, text) from public, anon;
grant execute on function public.reject_expense(uuid, text) to authenticated;

-- ── decide_approval now cascades a rejection ────────────────────
-- Rejecting a payment or a bill must not leave the underlying row
-- pending forever. The maker–checker rules of the specialist RPCs
-- still apply, because we call them instead of writing directly.
create or replace function public.decide_approval(
  p_approval_id uuid,
  p_approve boolean,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  a         public.approvals;
  v_role    app_role := public.current_role();
  v_tenant  uuid := public.current_tenant_id();
  v_periods text[];
  v_waived  int := 0;
  v_result  text := null;
  v_status  approval_status;
begin
  if coalesce(v_role in ('sadar','secretary','auditor','khajanchi'), false) is not true then
    raise exception 'Not allowed to decide approvals';
  end if;

  select * into a from public.approvals where id = p_approval_id for update;
  if not found then
    raise exception 'Approval not found';
  end if;
  if a.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if a.status <> 'pending' then
    raise exception 'This request is already %', a.status;
  end if;
  if a.requested_by is not distinct from auth.uid() then
    raise exception 'Maker cannot decide their own request';
  end if;

  if p_approve then
    case a.entity_type
      when 'payment' then
        if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
          raise exception 'Only the office can verify a payment';
        end if;
        v_result := public.verify_payment(a.entity_id);

      when 'expense' then
        if coalesce(v_role in ('sadar','auditor'), false) is not true then
          raise exception 'Only the sadar or auditor can approve an expense';
        end if;
        perform public.approve_expense(a.entity_id);

      when 'fee_change' then
        if coalesce(v_role in ('sadar','secretary'), false) is not true then
          raise exception 'Only the sadar or secretary can approve a fee change';
        end if;
        perform public.approve_fee_override(a.entity_id);

      when 'waiver' then
        if coalesce(v_role in ('sadar','secretary'), false) is not true then
          raise exception 'Only the sadar or secretary can sanction a waiver';
        end if;

        select coalesce(array_agg(value::text), array[]::text[])
          into v_periods
        from jsonb_array_elements_text(coalesce(a.meta -> 'periods', '[]'::jsonb));

        if cardinality(v_periods) = 0 then
          raise exception 'This waiver has no months attached';
        end if;

        update public.invoices
          set status = 'waived',
              waived_reason = coalesce(p_note, a.subtitle, 'Approved waiver'),
              waived_by = auth.uid()
          where tenant_id = a.tenant_id
            and member_id = a.entity_id
            and period = any (v_periods)
            and status in ('pending','partial');
        get diagnostics v_waived = row_count;

        if v_waived = 0 then
          raise exception 'Nothing left to waive — the dues were already settled';
        end if;
        v_result := v_waived::text;

      else
        v_result := a.entity_type;
    end case;
  else
    -- Rejection: close the underlying record too, using the same
    -- maker–checker rules as approval.
    case a.entity_type
      when 'payment' then
        if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
          raise exception 'Only the office can reject a payment';
        end if;
        perform public.reject_payment(
          a.entity_id,
          coalesce(p_note, 'Rejected by ' || v_role::text)
        );
        v_result := 'payment_rejected';

      when 'expense' then
        if coalesce(v_role in ('sadar','secretary','auditor'), false) is not true then
          raise exception 'Only the office can reject an expense';
        end if;
        perform public.reject_expense(a.entity_id, p_note);
        v_result := 'expense_rejected';

      else
        v_result := a.entity_type || '_rejected';
    end case;
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.approvals
    set status = v_status,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = p_note
    where id = a.id;

  return jsonb_build_object(
    'approval_id', a.id,
    'entity_type', a.entity_type,
    'status', v_status,
    'waived', v_waived,
    'result', v_result
  );
end $$;

revoke all on function public.decide_approval(uuid, boolean, text) from public, anon;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;

-- ═══════════ 0007_fee_change.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0007 · Fee change requests
--
-- A per-member override may not be written straight into force: the
-- panel needs a maker–checker request, and an override that is
-- already approved is locked by a guard. This RPC is the only way a
-- browser can change a member's fee.
--
-- It writes the override (or rewrites it back to "pending"), then
-- queues a fee_change approval pointing at the override. The sadar
-- or secretary approves it in the normal approvals queue, which
-- calls approve_fee_override.
--
-- Depends on: 0001 (fee_overrides, approvals), 0004 (guards,
--             approve_fee_override), 0005 (decide_approval).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.request_fee_change(
  p_member uuid,
  p_amount_paise bigint,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_role     app_role := public.current_role();
  v_tenant   uuid := public.current_tenant_id();
  v_member   public.members;
  v_override public.fee_overrides;
  v_old      bigint;
  v_approval uuid;
begin
  if coalesce(v_role in ('sadar','secretary','khajanchi'), false) is not true then
    raise exception 'Not allowed to request a fee change';
  end if;

  if p_amount_paise is null or p_amount_paise < 0 then
    raise exception 'Fee amount cannot be negative';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required for a fee change';
  end if;

  select * into v_member from public.members where id = p_member for update;
  if not found then
    raise exception 'Member not found';
  end if;
  if v_member.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  select * into v_override
  from public.fee_overrides
  where member_id = p_member
  for update;

  if found then
    -- An approval already waiting for this member? Do not stack them.
    if exists (
      select 1 from public.approvals
      where tenant_id = v_tenant
        and entity_type = 'fee_change'
        and entity_id = v_override.id
        and status = 'pending'
    ) then
      raise exception 'A fee change for this member is already waiting for approval';
    end if;

    v_old := case when v_override.approved_by is not null
                  then v_override.amount_paise
                  else v_member.fee_paise end;

    if v_override.approved_by is not null
       and v_override.amount_paise = p_amount_paise then
      raise exception 'This is already the approved fee';
    end if;

    -- SECURITY DEFINER means the guard sees a trusted context, so a
    -- previously approved override may be taken back for re-approval.
    update public.fee_overrides
      set amount_paise = p_amount_paise,
          reason       = btrim(p_reason),
          approved_by  = null,
          approved_at  = null
      where id = v_override.id
      returning * into v_override;
  else
    v_old := v_member.fee_paise;

    insert into public.fee_overrides (tenant_id, member_id, amount_paise, reason)
    values (v_tenant, p_member, p_amount_paise, btrim(p_reason))
    returning * into v_override;
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps)
  values
    (v_tenant, 'fee_change', v_override.id,
     'Change fee — ' || v_member.name,
     '₹' || (v_old / 100)::text || ' → ₹' || (p_amount_paise / 100)::text
       || ' · ' || btrim(p_reason),
     p_amount_paise, auth.uid(), 1, 2)
  returning id into v_approval;

  return v_approval;
end $$;

revoke all on function public.request_fee_change(uuid, bigint, text) from public, anon;
grant execute on function public.request_fee_change(uuid, bigint, text) to authenticated;

-- ═══════════ 0008_complaint_workflow.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0008 · Complaints
--
-- Problems:
--   · tracking_code is NOT NULL but nothing generated it, so every
--     complaint insert failed.
--   · the generic tenant-update policy let any member edit anyone's
--     complaint, including marking it resolved.
--
-- This adds a code generator, a small update guard and an
-- office-bearers-only update policy.
--
-- Depends on: 0001 (complaints), 0002 (RLS), 0004 (current_role).
-- ═══════════════════════════════════════════════════════════════

-- ── Tracking code: CMP-4X2Q9K ───────────────────────────────────
create or replace function public.assign_complaint_code()
returns trigger
language plpgsql
as $$
declare
  v_code text;
  v_try  int := 0;
begin
  if new.tracking_code is not null and btrim(new.tracking_code) <> '' then
    return new;
  end if;

  loop
    v_try := v_try + 1;
    v_code := 'CMP-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

    exit when not exists (
      select 1 from public.complaints
      where tenant_id = new.tenant_id and tracking_code = v_code
    );

    if v_try > 10 then
      raise exception 'Could not allocate a complaint tracking code';
    end if;
  end loop;

  new.tracking_code := v_code;
  return new;
end $$;

drop trigger if exists complaints_assign_code on public.complaints;
create trigger complaints_assign_code
  before insert on public.complaints
  for each row execute function public.assign_complaint_code();

-- ── Update guard ────────────────────────────────────────────────
-- Identity of a complaint never changes. Resolution time follows
-- the status, so reports can trust it.
create or replace function public.guard_complaint_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.tenant_id     is distinct from old.tenant_id
     or new.tracking_code is distinct from old.tracking_code
     or new.created_at  is distinct from old.created_at
     or new.member_id   is distinct from old.member_id
     or new.anonymous   is distinct from old.anonymous
     or new.subject     is distinct from old.subject
     or new.body        is distinct from old.body then
    raise exception 'A complaint can only change its status, priority or owner';
  end if;

  if new.status in ('resolved','closed') and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status not in ('resolved','closed') then
    new.resolved_at := null;
  end if;

  return new;
end $$;

drop trigger if exists complaints_guard_update on public.complaints;
create trigger complaints_guard_update
  before update on public.complaints
  for each row execute function public.guard_complaint_update();

-- ── Only office bearers may triage ──────────────────────────────
-- Replaces the generic tenant update policy created in 0002.
drop policy if exists complaints_tenant_update on public.complaints;
drop policy if exists complaints_office_update on public.complaints;
create policy complaints_office_update on public.complaints
  for update using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector'))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector'))
  );

-- ═══════════ 0009_prayer_location.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0009 · Prayer-time location & method
--
-- The timetable cannot be calculated without knowing where the
-- masjid is. These columns hold the coordinates and the calculation
-- method; the panel fills them once and the timetable follows.
--
-- Depends on: 0001 (tenants), 0004 (tenant_settings).
-- ═══════════════════════════════════════════════════════════════

alter table public.tenants
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision,
  add column if not exists timezone  text not null default 'Asia/Kolkata';

alter table public.tenant_settings
  add column if not exists calc_method   text not null default 'karachi',
  add column if not exists fajr_angle    numeric not null default 18,
  add column if not exists isha_angle    numeric not null default 18,
  add column if not exists asr_factor    int not null default 2,
  add column if not exists iqamah_offset int not null default 10,
  add column if not exists prayer_reminders boolean not null default true,
  add column if not exists jumuah_alert     boolean not null default true;

-- ═══════════ 0010_donations.sql ═══════════
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

-- ═══════════ 0011_security_hardening.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0011 · Security hardening
--
-- Additive only — no existing table, policy or RPC is removed.
-- Fixes found during the deep review of 0001–0010:
--
--   1. profiles: a signed-in user could change their own `role`
--      (privilege escalation to super_admin). No guard existed.
--   2. donations: there was no INSERT guard, so an office bearer
--      could insert a row already marked verified with a hand-typed
--      receipt number — bypassing next_donation_receipt_no, the fund
--      balance and the ledger entirely.
--   3. donations: after verification the amount / fund / donor were
--      still editable, unlike payments.
--   4. internal helpers next_receipt_no(), next_donation_receipt_no()
--      and verify_ledger() were SECURITY DEFINER but never revoked
--      from PUBLIC, so an anonymous caller could burn receipt
--      numbers or probe ledger integrity.
--   5. broadcast_notice() was service-role only, but the admin panel
--      calls it directly — the call always failed.
--
-- Depends on: 0001–0010.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. A profile cannot escalate itself ───────────────────────────
-- Users may edit their own name / phone / 2FA. Role, tenant, account
-- state and audit fields are platform-admin territory only.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.id        is distinct from old.id
     or new.role      is distinct from old.role
     or new.tenant_id is distinct from old.tenant_id
     or new.is_active is distinct from old.is_active
     or new.member_id is distinct from old.member_id
     or new.email     is distinct from old.email then
    raise exception 'Only the platform admin can change a role, tenant or account state';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ── 2. A browser-created donation can never arrive verified ───────
create or replace function public.guard_donation_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  new.status      := 'pending';
  new.receipt_no  := null;
  new.verified_by := null;
  new.verified_at := null;
  new.entered_by  := auth.uid();

  return new;
end $$;

drop trigger if exists donations_guard_insert on public.donations;
create trigger donations_guard_insert
  before insert on public.donations
  for each row execute function public.guard_donation_insert();

-- ── 3. A recorded donation is immutable in its money fields ───────
-- Replaces the partial guard from 0010, which only froze the status
-- columns and left the amount / fund editable.
create or replace function public.guard_donation_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Use the verify_donation / reject_donation RPC to change status';
  end if;
  if new.receipt_no  is distinct from old.receipt_no
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    raise exception 'Receipt number and verifier are assigned by the verification RPC';
  end if;
  if new.tenant_id   is distinct from old.tenant_id
     or new.fund_id     is distinct from old.fund_id
     or new.member_id   is distinct from old.member_id
     or new.amount_paise is distinct from old.amount_paise
     or new.method      is distinct from old.method
     or new.donor_name  is distinct from old.donor_name
     or new.anonymous   is distinct from old.anonymous
     or new.entered_by  is distinct from old.entered_by then
    raise exception 'A recorded donation cannot be edited; reject it and record a new one';
  end if;

  return new;
end $$;

-- ── 4. Internal helpers are not callable from the browser ────────
-- next_receipt_no / next_donation_receipt_no mint numbers and
-- verify_ledger walks the hash chain; both are invariants, not
-- user actions. Office RPCs call them internally as the definer.
revoke all on function public.next_receipt_no(uuid) from public, anon;
grant execute on function public.next_receipt_no(uuid) to authenticated, service_role;

revoke all on function public.next_donation_receipt_no(uuid) from public, anon;
grant execute on function public.next_donation_receipt_no(uuid) to authenticated, service_role;

revoke all on function public.verify_ledger(uuid) from public, anon;
grant execute on function public.verify_ledger(uuid) to authenticated, service_role;

-- ── 5. broadcast_notice: honour the caller instead of service-only ─
-- The admin panel calls this straight after publishing; the
-- notices_queue_broadcast trigger also calls it. The dedupe key
-- makes the second call a no-op.
create or replace function public.broadcast_notice(p_notice_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  n       public.notices;
  v_count int := 0;
  v_part  int := 0;
begin
  select * into n from public.notices where id = p_notice_id;
  if not found then
    return 0;
  end if;

  -- Only jwt-role / profile checks are usable here: this function is
  -- SECURITY DEFINER, so `current_user` (and is_trusted_context) is
  -- always the owner, never the caller.
  if coalesce(
       public.is_service_role()
       or public.is_super_admin()
       or (public.current_tenant_id() = n.tenant_id
           and public.current_role() in ('sadar','secretary','khajanchi')),
       false
     ) is not true then
    raise exception 'Not allowed to broadcast this notice';
  end if;

  -- Scheduled notices wait for their publish time. The nightly job
  -- calls this function again once the time has passed.
  if n.published_at is not null and n.published_at > now() then
    return 0;
  end if;

  if n.audience = 'office_bearers' then
    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    select
      n.tenant_id,
      public.pick_channel(n.tenant_id, true, true),
      'notice_alert',
      p.phone,
      p.full_name,
      jsonb_build_object(
        'notice_id', n.id,
        'member_id', p.member_id,
        'member_name', p.full_name,
        'title', n.title,
        'body', n.body,
        'pinned', n.pinned
      ),
      'notice:' || n.id::text || ':p:' || p.id::text
    from public.profiles p
    where p.tenant_id = n.tenant_id
      and p.is_active
      and p.role in ('sadar','khajanchi','secretary','auditor')
      and p.phone is not null
      and public.pick_channel(n.tenant_id, true, true) is not null
    on conflict do nothing;
  else
    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    select
      n.tenant_id,
      public.pick_channel(n.tenant_id, m.whatsapp_opt_in, m.sms_opt_in),
      'notice_alert',
      m.phone,
      m.name,
      jsonb_build_object(
        'notice_id', n.id,
        'member_id', m.id,
        'member_name', m.name,
        'title', n.title,
        'body', n.body,
        'pinned', n.pinned
      ),
      'notice:' || n.id::text || ':m:' || m.id::text
    from public.members m
    where m.tenant_id = n.tenant_id
      and m.status = 'active'
      and m.phone is not null
      and public.pick_channel(n.tenant_id, m.whatsapp_opt_in, m.sms_opt_in) is not null
    on conflict do nothing;
  end if;

  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  return v_count;
end $$;

revoke all on function public.broadcast_notice(uuid) from public, anon;
grant execute on function public.broadcast_notice(uuid) to authenticated, service_role;

-- ── 6. Donations: keep the super-admin path consistent ───────────
-- Every other tenant table ORs is_super_admin(); donations did not.
drop policy if exists donations_office_insert on public.donations;
create policy donations_office_insert on public.donations
  for insert with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector'))
  );

-- ═══════════ 0012_platform_plans.sql ═══════════
-- ═══════════════════════════════════════════════════════════════
-- 0012 · Platform plans (default plans for new anjumans)
--
-- These are the default plans that appear in the onboarding flow.
-- A tenant picks one, then its pricing/limits can be overridden
-- individually in the Tenants page.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.platform_plans (
  id            text primary key,
  name          text not null,
  type          plan_type not null default 'fixed',
  price_paise   bigint not null check (price_paise >= 0),
  cycle         text not null check (cycle in ('monthly','quarterly','yearly','lifetime')),
  max_members   int,
  features      text[] not null default '{}',
  active        boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.platform_plans enable row level security;

-- Super admin can read all
drop policy if exists platform_plans_super_read on public.platform_plans;
create policy platform_plans_super_read on public.platform_plans
  for select using (public.is_super_admin());

-- Super admin can insert/update
drop policy if exists platform_plans_super_write on public.platform_plans;
create policy platform_plans_super_write on public.platform_plans
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Seed default plans
insert into public.platform_plans (id, name, type, price_paise, cycle, max_members, features, sort_order) values
  ('p-free',       'Free',        'free',   0,          'yearly',  150, '{Members & households,Basic collections,Reports}', 1),
  ('p-standard',   'Standard',    'fixed',  120000,     'yearly',  1000, '{Everything in Free,Payment gateway,WhatsApp reminders,ID cards}', 2),
  ('p-pro',        'Pro',         'fixed',  250000,     'yearly',  null,   '{Everything in Standard,Multi-masjid,Audit pack,Priority support}', 3),
  ('p-custom',     'Custom',      'custom', 0,          'yearly',  null,   '{Negotiated pricing,Custom limits,Custom features}', 4)
on conflict (id) do nothing;

