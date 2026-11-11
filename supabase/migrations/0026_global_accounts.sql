-- ═══════════════════════════════════════════════════════════════
-- 0026 · Super Admin global control over every account
-- One place to see every login across all anjumans, change the role
-- and switch an account on/off. A super admin can never lock
-- themselves out (self role change / self suspend is blocked).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.list_all_accounts()
returns table (
  id          uuid,
  full_name   text,
  email       text,
  phone       text,
  role        app_role,
  tenant_id   uuid,
  tenant_name text,
  is_active   boolean,
  member_code text,
  created_at  timestamptz
)
language sql stable security definer set search_path = public
as $$
  select p.id,
         p.full_name,
         coalesce(p.email, u.email),
         p.phone,
         p.role,
         p.tenant_id,
         t.name,
         p.is_active,
         m.code,
         p.created_at
  from public.profiles p
  left join public.tenants t on t.id = p.tenant_id
  left join public.members m on m.id = p.member_id
  left join auth.users u on u.id = p.id
  where public.is_super_admin()
  order by t.name nulls last, p.role, p.full_name;
$$;

revoke all on function public.list_all_accounts() from public;
grant execute on function public.list_all_accounts() to authenticated;

create or replace function public.set_account_role(
  p_profile uuid,
  p_role    app_role
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can change roles';
  end if;
  if p_profile = auth.uid() then
    raise exception 'Apni hi role change nahi kar sakte';
  end if;

  update public.profiles set role = p_role where id = p_profile;
  if not found then raise exception 'Account not found'; end if;
end $$;

revoke all on function public.set_account_role(uuid, app_role) from public;
grant execute on function public.set_account_role(uuid, app_role) to authenticated;

create or replace function public.set_account_active(
  p_profile uuid,
  p_active  boolean
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Only Super Admin can enable or disable accounts';
  end if;
  if p_profile = auth.uid() then
    raise exception 'Apna account band nahi kar sakte';
  end if;

  update public.profiles set is_active = p_active where id = p_profile;
  if not found then raise exception 'Account not found'; end if;
end $$;

revoke all on function public.set_account_active(uuid, boolean) from public;
grant execute on function public.set_account_active(uuid, boolean) to authenticated;
