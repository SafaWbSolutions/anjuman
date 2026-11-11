-- ═══════════════════════════════════════════════════════════════
-- 0028 · Fix tenant profile save + custom member ID prefix
--
-- 1. audit_row() assumed every audited table has a tenant_id column.
--    public.tenants does not (it IS the tenant), so every tenant
--    profile update crashed with 'record "new" has no field
--    "tenant_id"' → the settings page always said "Save failed".
-- 2. Sadar / Secretary can now change the member ID prefix. Existing
--    member codes are untouched; the new prefix applies to members
--    created from now on.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.audit_row()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid;
  v_new    jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  v_old    jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
begin
  -- Tenant-scoped tables carry tenant_id; public.tenants itself only
  -- has id. Read both defensively from the row as JSON.
  v_tenant := coalesce(
    (v_new ->> 'tenant_id')::uuid,
    (v_old ->> 'tenant_id')::uuid,
    (v_new ->> 'id')::uuid,
    (v_old ->> 'id')::uuid
  );

  insert into public.audit_log (tenant_id, actor_id, action, entity, entity_id, meta)
  values (
    v_tenant,
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    jsonb_build_object('status', coalesce(v_new ->> 'status', v_old ->> 'status'))
  );
  return coalesce(new, old);
end $$;

-- ── Member ID prefix ────────────────────────────────────────────
create or replace function public.set_member_prefix(p_prefix text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  v_prefix text := upper(btrim(coalesce(p_prefix, '')));
begin
  if v_role not in ('sadar', 'secretary') and not public.is_super_admin() then
    raise exception 'Sirf Sadar ya Secretary prefix change kar sakte hain';
  end if;
  if v_prefix !~ '^[A-Z]{2,4}$' then
    raise exception 'Prefix 2 se 4 letters ka hona chahiye (sirf A-Z)';
  end if;
  if public.is_super_admin() and v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if exists (select 1 from public.tenants where code = v_prefix and id <> v_tenant) then
    raise exception 'Ye prefix pehle se kisi doosre anjuman ke paas hai';
  end if;

  update public.tenants set code = v_prefix where id = v_tenant;
  if not found then
    raise exception 'Anjuman not found';
  end if;

  return v_prefix;
end $$;

revoke all on function public.set_member_prefix(text) from public;
grant execute on function public.set_member_prefix(text) to authenticated, service_role;
