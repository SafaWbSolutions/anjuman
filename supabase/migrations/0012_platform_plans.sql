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