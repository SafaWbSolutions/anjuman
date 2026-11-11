-- ═══════════════════════════════════════════════════════════════
-- 0017 · Team invite flow
--
-- Super admins and anjuman office bearers can invite new users
-- (Sadar, Khajanchi, Secretary, Auditor, Collector, Member) to
-- join a tenant. Invites are single-use and expire after 7 days.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.invitations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  email          text not null check (email ~* '^.+@.+\..+$'),
  role           app_role not null,
  invited_by     uuid not null references public.profiles(id),
  token          text not null unique,
  expires_at     timestamptz not null default (now() + interval '7 days'),
  accepted_at    timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.invitations enable row level security;

-- Super admin can read all
drop policy if exists invitations_super_read on public.invitations;
create policy invitations_super_read on public.invitations
  for select using (public.is_super_admin());

-- Tenant office bearers can read their own tenant's invites
drop policy if exists invitations_tenant_read on public.invitations;
create policy invitations_tenant_read on public.invitations
  for select using (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('sadar','secretary','super_admin')
  );

-- Tenant office bearers can create invites
drop policy if exists invitations_tenant_insert on public.invitations;
create policy invitations_tenant_insert on public.invitations
  for insert with check (
    tenant_id = public.current_tenant_id()
    and public.current_role() in ('sadar','secretary','super_admin')
    and invited_by = auth.uid()
  );

-- Anyone with a valid token can read the invite (to accept it)
drop policy if exists invitations_token_read on public.invitations;
create policy invitations_token_read on public.invitations
  for select using (
    accepted_at is null
    and expires_at > now()
  );

-- Indexes
create index if not exists invitations_tenant_idx on public.invitations (tenant_id);
create index if not exists invitations_token_idx on public.invitations (token);
create index if not exists invitations_email_idx on public.invitations (email);
