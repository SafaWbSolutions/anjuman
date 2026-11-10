-- ═══════════════════════════════════════════════════════════════
-- 0007 · Fee change requests
--
-- A per-member override may not be written straight into force: the
-- panel needs a maker–checker request, and an override that is
-- already approved is locked by a guard. This RPC is the only way a
-- browser can change a member's fee.
--
-- It writes the override (or rewrites it back to "pending"), then
-- queues a fee_change approval pointing at the override. The sadar
-- or secretary approves it in the normal approvals queue, which
-- calls approve_fee_override.
--
-- Depends on: 0001 (fee_overrides, approvals), 0004 (guards,
--             approve_fee_override), 0005 (decide_approval).
-- ═══════════════════════════════════════════════════════════════

create or replace function public.request_fee_change(
  p_member uuid,
  p_amount_paise bigint,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_role     app_role := public.current_role();
  v_tenant   uuid := public.current_tenant_id();
  v_member   public.members;
  v_override public.fee_overrides;
  v_old      bigint;
  v_approval uuid;
begin
  if coalesce(v_role in ('sadar','secretary','khajanchi'), false) is not true then
    raise exception 'Not allowed to request a fee change';
  end if;

  if p_amount_paise is null or p_amount_paise < 0 then
    raise exception 'Fee amount cannot be negative';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'A reason is required for a fee change';
  end if;

  select * into v_member from public.members where id = p_member for update;
  if not found then
    raise exception 'Member not found';
  end if;
  if v_member.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  select * into v_override
  from public.fee_overrides
  where member_id = p_member
  for update;

  if found then
    -- An approval already waiting for this member? Do not stack them.
    if exists (
      select 1 from public.approvals
      where tenant_id = v_tenant
        and entity_type = 'fee_change'
        and entity_id = v_override.id
        and status = 'pending'
    ) then
      raise exception 'A fee change for this member is already waiting for approval';
    end if;

    v_old := case when v_override.approved_by is not null
                  then v_override.amount_paise
                  else v_member.fee_paise end;

    if v_override.approved_by is not null
       and v_override.amount_paise = p_amount_paise then
      raise exception 'This is already the approved fee';
    end if;

    -- SECURITY DEFINER means the guard sees a trusted context, so a
    -- previously approved override may be taken back for re-approval.
    update public.fee_overrides
      set amount_paise = p_amount_paise,
          reason       = btrim(p_reason),
          approved_by  = null,
          approved_at  = null
      where id = v_override.id
      returning * into v_override;
  else
    v_old := v_member.fee_paise;

    insert into public.fee_overrides (tenant_id, member_id, amount_paise, reason)
    values (v_tenant, p_member, p_amount_paise, btrim(p_reason))
    returning * into v_override;
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps)
  values
    (v_tenant, 'fee_change', v_override.id,
     'Change fee — ' || v_member.name,
     '₹' || (v_old / 100)::text || ' → ₹' || (p_amount_paise / 100)::text
       || ' · ' || btrim(p_reason),
     p_amount_paise, auth.uid(), 1, 2)
  returning id into v_approval;

  return v_approval;
end $$;

revoke all on function public.request_fee_change(uuid, bigint, text) from public, anon;
grant execute on function public.request_fee_change(uuid, bigint, text) to authenticated;
