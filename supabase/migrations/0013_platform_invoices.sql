-- ═══════════════════════════════════════════════════════════════
-- 0013 · Platform invoices (Super Admin billing)
--
-- Subscription invoices that anjumans pay to the platform.
-- Separate from member collections — this is platform revenue, not member money.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.platform_invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  invoice_no      text not null unique,
  amount_paise    bigint not null check (amount_paise >= 0),
  status          text not null default 'pending' check (status in ('pending','paid','overdue','voided')),
  period_from     date not null,
  period_to       date not null,
  due_date        date not null,
  paid_at         timestamptz,
  paid_amount_paise bigint,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.platform_invoices enable row level security;

-- Super admin can read all
drop policy if exists platform_invoices_super_read on public.platform_invoices;
create policy platform_invoices_super_read on public.platform_invoices
  for select using (public.is_super_admin());

-- Super admin can insert/update
drop policy if exists platform_invoices_super_write on public.platform_invoices;
create policy platform_invoices_super_write on public.platform_invoices
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- Indexes
create index if not exists platform_invoices_tenant_idx on public.platform_invoices (tenant_id);
create index if not exists platform_invoices_status_idx on public.platform_invoices (status);
create index if not exists platform_invoices_due_idx on public.platform_invoices (due_date);
