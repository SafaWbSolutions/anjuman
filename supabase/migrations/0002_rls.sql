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
