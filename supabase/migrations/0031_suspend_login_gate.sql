-- ═══════════════════════════════════════════════════════════════
-- 0031 · Suspended anjuman login gate (server side)
--
-- 0015 already blocks every write for suspended tenants, but a valid
-- session could still READ the tenant's data. Two changes close that:
--
--   1. my_tenant_status() lets the app read the tenant's status even
--      when RLS would otherwise hide the tenants row, so the login
--      page can explain exactly why sign-in was refused.
--   2. current_tenant_id() returns NULL while the tenant is suspended,
--      so every tenant-scoped RLS policy returns nothing.
--
-- Nothing is deleted or moved. Reactivating the tenant (status =
-- 'active') makes current_tenant_id() work again and every login and
-- every row is exactly where it was.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.my_tenant_status()
returns text
language sql stable security definer set search_path = public
as $$
  select t.status
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid();
$$;

revoke all on function public.my_tenant_status() from public, anon;
grant execute on function public.my_tenant_status() to authenticated, service_role;

create or replace function public.current_tenant_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  join public.tenants t on t.id = p.tenant_id
  where p.id = auth.uid()
    and p.is_active
    and t.status <> 'suspended';
$$;
