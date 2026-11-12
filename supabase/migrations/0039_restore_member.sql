-- ═══════════════════════════════════════════════════════════════
-- 0039 · Sadar can restore an archived member
--
-- `remove_member()` (0027) archives a member instead of deleting when
-- they already have financial history. Until now there was no way back:
-- `update_member_details()` cannot change `members.status`, so an
-- archived member could never be made active again from the panel.
--
-- This adds the missing counterpart. It only flips `status` back to
-- 'active'. The login is intentionally NOT re-enabled here: the profile
-- was detached on removal, so the office bearer should use
-- "Create login" again (admin-create-user reuses the same auth account).
-- Every change is captured by the audit_members trigger (0014).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.restore_member(p_member uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
begin
  if v_role <> 'sadar' and not public.is_super_admin() then
    raise exception 'Sirf Sadar member restore kar sakta hai';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then
    raise exception 'Member not found';
  end if;

  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  if m.status = 'active' then
    raise exception 'Ye member pehle se active hai';
  end if;

  update public.members
     set status = 'active',
         updated_at = now()
   where id = p_member;

  return 'RESTORED';
end $$;

revoke all on function public.restore_member(uuid) from public;
grant execute on function public.restore_member(uuid) to authenticated, service_role;
