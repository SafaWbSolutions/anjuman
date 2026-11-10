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
