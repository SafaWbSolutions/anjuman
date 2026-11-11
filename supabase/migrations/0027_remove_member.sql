-- ═══════════════════════════════════════════════════════════════
-- 0027 · Sadar can remove a member
-- Financial integrity: a member with any receipt or paid invoice is
-- archived (status = inactive) instead of deleted, so the ledger,
-- receipts and audit trail stay intact. A member with no financial
-- history is deleted outright.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.remove_member(p_member uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_role    app_role := public.current_role();
  m         public.members;
  v_finance boolean;
begin
  if v_role <> 'sadar' and not public.is_super_admin() then
    raise exception 'Sirf Sadar member remove kar sakta hai';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then
    raise exception 'Member not found';
  end if;

  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  select exists (select 1 from public.payments where member_id = p_member)
      or exists (select 1 from public.donations where member_id = p_member)
      or exists (select 1 from public.invoices
                  where member_id = p_member and paid_paise > 0)
    into v_finance;

  -- Remove the member's login access, but keep the account row so the
  -- audit trail still points at a real profile.
  update public.profiles
     set is_active = false,
         member_id = null
   where member_id = p_member;

  if v_finance then
    update public.members
       set status = 'inactive',
           updated_at = now()
     where id = p_member;
    return 'ARCHIVED';
  end if;

  delete from public.members where id = p_member;
  return 'DELETED';
end $$;

revoke all on function public.remove_member(uuid) from public;
grant execute on function public.remove_member(uuid) to authenticated, service_role;
