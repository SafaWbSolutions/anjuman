-- ═══════════════════════════════════════════════════════════════
-- 0040 · Member pause / resume with dual approval (maker-checker)
--
-- Use case: member resigns temporarily, or Sadar wants to stop dues
-- without losing history. Unlike "remove" (which archives), pause:
--   • keeps member active in all records
--   • stops auto invoice generation
--   • can be resumed later
--   • requires dual approval (Sadar↔Khajanchi) so no single person
--     can misuse the power.
-- ═══════════════════════════════════════════════════════════════

-- 1. Add 'paused' to member_status enum
alter type public.member_status add value if not exists 'paused';

-- 2. Add new approval entity types
alter table public.approvals drop constraint if exists approvals_entity_type_check;
alter table public.approvals
  add constraint approvals_entity_type_check
  check (entity_type in (
    'payment','expense','waiver','member','fee_change',
    'payment_reset','payment_edit',
    'member_pause','member_resume','member_archive','member_delete'
  ));

-- 3. Helper: current user can request pause/resume?
create or replace function public.can_manage_member_status()
returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_role app_role := public.current_role();
begin
  return v_role in ('sadar','secretary','khajanchi') or public.is_super_admin();
end $$;

-- 4. A. Sadar/Secretary/Khajanchi requests PAUSE
create or replace function public.request_member_pause(
  p_member uuid,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_id     uuid;
begin
  if not public.can_manage_member_status() then
    raise exception 'Sirf Sadar, Secretary ya Khajanchi pause request kar sakte hain';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  if m.status = 'paused' then
    raise exception 'Ye member pehle se paused hai';
  end if;
  if m.status <> 'active' then
    raise exception 'Sirf active member pause ho sakta hai';
  end if;

  if exists (
    select 1 from public.approvals
     where tenant_id = m.tenant_id
       and entity_type in ('member_pause','member_resume')
       and entity_id = p_member
       and status = 'pending'
  ) then
    raise exception 'Is member ka pause/resume pehle se pending hai';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_pause', m.id,
     'Pause member · ' || m.name,
     coalesce(nullif(btrim(p_reason), ''), 'Temporary hold — dues stop'),
     0, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_pause(uuid, text) from public;
grant execute on function public.request_member_pause(uuid, text) to authenticated, service_role;

-- 5. B. Sadar/Secretary/Khajanchi requests RESUME
create or replace function public.request_member_resume(
  p_member uuid,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_id     uuid;
begin
  if not public.can_manage_member_status() then
    raise exception 'Sirf Sadar, Secretary ya Khajanchi resume request kar sakte hain';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  if m.status <> 'paused' then
    raise exception 'Sirf paused member resume ho sakta hai';
  end if;

  if exists (
    select 1 from public.approvals
     where tenant_id = m.tenant_id
       and entity_type in ('member_pause','member_resume')
       and entity_id = p_member
       and status = 'pending'
  ) then
    raise exception 'Is member ka pause/resume pehle se pending hai';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_resume', m.id,
     'Resume member · ' || m.name,
     coalesce(nullif(btrim(p_reason), ''), 'Dues restart'),
     0, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_resume(uuid, text) from public;
grant execute on function public.request_member_resume(uuid, text) to authenticated, service_role;

-- 6. C. Apply PAUSE (called by decide_approval when approved)
create or replace function public.apply_member_pause(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  m        public.members;
begin
  -- Only the OTHER role can approve (maker-checker)
  -- Requester role is checked in decide_approval
  if not public.is_service_role() and public.current_role() not in ('sadar','secretary','khajanchi') then
    raise exception 'Not allowed to apply pause';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  update public.members
     set status = 'paused',
         updated_at = now()
   where id = p_member;

  -- Log in member_notifications
  perform public.notify_member(
    p_member, 'info',
    'Membership paused',
    'Aapke dues ab auto-generate nahi honge. Resume hone par dobara shuru honge.',
    jsonb_build_object('paused_by', p_by, 'note', p_note)
  );

  return 'PAUSED';
end $$;

revoke all on function public.apply_member_pause(uuid, uuid, text) from public;
grant execute on function public.apply_member_pause(uuid, uuid, text) to service_role;

-- 7. D. Apply RESUME
create or replace function public.apply_member_resume(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  m        public.members;
begin
  if not public.is_service_role() and public.current_role() not in ('sadar','secretary','khajanchi') then
    raise exception 'Not allowed to apply resume';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  update public.members
     set status = 'active',
         updated_at = now()
   where id = p_member;

  perform public.notify_member(
    p_member, 'info',
    'Membership resumed',
    'Aapke dues ab har mahine auto-generate honge.',
    jsonb_build_object('resumed_by', p_by, 'note', p_note)
  );

  return 'RESUMED';
end $$;

revoke all on function public.apply_member_resume(uuid, uuid, text) from public;
grant execute on function public.apply_member_resume(uuid, uuid, text) to service_role;

-- 7.5 E. Sadar/Secretary/Khajanchi requests ARCHIVE (approval-based)
create or replace function public.request_member_archive(
  p_member uuid,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_id     uuid;
begin
  if not public.can_manage_member_status() then
    raise exception 'Sirf Sadar, Secretary ya Khajanchi archive request kar sakte hain';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  if m.status = 'inactive' then
    raise exception 'Ye member pehle se archived hai';
  end if;
  if m.status <> 'active' and m.status <> 'paused' then
    raise exception 'Sirf active ya paused member archive ho sakta hai';
  end if;

  if exists (
    select 1 from public.approvals
     where tenant_id = m.tenant_id
       and entity_type in ('member_archive','member_delete')
       and entity_id = p_member
       and status = 'pending'
  ) then
    raise exception 'Is member ka archive/delete pehle se pending hai';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_archive', m.id,
     'Archive member · ' || m.name,
     coalesce(nullif(btrim(p_reason), ''), 'Member left — keep history'),
     0, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_archive(uuid, text) from public;
grant execute on function public.request_member_archive(uuid, text) to authenticated, service_role;

-- 7.6 F. Sadar/Secretary/Khajanchi requests PERMANENT DELETE (approval-based)
create or replace function public.request_member_delete(
  p_member uuid,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_id     uuid;
  v_finance boolean;
begin
  if not public.can_manage_member_status() then
    raise exception 'Sirf Sadar, Secretary ya Khajanchi delete request kar sakte hain';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  if m.status = 'inactive' then
    raise exception 'Ye member pehle se archived hai; use restore karein';
  end if;
  if m.status <> 'active' and m.status <> 'paused' then
    raise exception 'Sirf active ya paused member delete ho sakta hai';
  end if;

  -- DB will re-check on apply, but we fail fast here for better UX
  select exists (select 1 from public.payments where member_id = p_member)
      or exists (select 1 from public.donations where member_id = p_member)
      or exists (select 1 from public.invoices where member_id = p_member and paid_paise > 0)
    into v_finance;

  if v_finance then
    raise exception 'Is member ka financial history hai — permanent delete nahi ho sakta. Archive karein.';
  end if;

  if exists (
    select 1 from public.approvals
     where tenant_id = m.tenant_id
       and entity_type in ('member_archive','member_delete')
       and entity_id = p_member
       and status = 'pending'
  ) then
    raise exception 'Is member ka archive/delete pehle se pending hai';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_delete', m.id,
     'Delete member · ' || m.name,
     coalesce(nullif(btrim(p_reason), ''), 'No financial history — permanent removal'),
     0, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_delete(uuid, text) from public;
grant execute on function public.request_member_delete(uuid, text) to authenticated, service_role;

-- 7.7 G. Apply ARCHIVE (called by decide_approval when approved)
create or replace function public.apply_member_archive(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  m        public.members;
begin
  if not public.is_service_role() and public.current_role() not in ('sadar','secretary','khajanchi') then
    raise exception 'Not allowed to apply archive';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  -- Detach login access (same as remove_member)
  update public.profiles
     set is_active = false,
         member_id = null
   where member_id = p_member;

  update public.members
     set status = 'inactive',
         updated_at = now()
   where id = p_member;

  perform public.notify_member(
    p_member, 'info',
    'Membership archived',
    'Aapka membership archived ho gaya. Login band. History safe hai.',
    jsonb_build_object('archived_by', p_by, 'note', p_note)
  );

  return 'ARCHIVED';
end $$;

revoke all on function public.apply_member_archive(uuid, uuid, text) from public;
grant execute on function public.apply_member_archive(uuid, uuid, text) to service_role;

-- 7.8 H. Apply DELETE (called by decide_approval when approved)
create or replace function public.apply_member_delete(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  m        public.members;
  v_finance boolean;
begin
  if not public.is_service_role() and public.current_role() not in ('sadar','secretary','khajanchi') then
    raise exception 'Not allowed to apply delete';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  -- Re-check: DB must refuse if any financial history exists
  select exists (select 1 from public.payments where member_id = p_member)
      or exists (select 1 from public.donations where member_id = p_member)
      or exists (select 1 from public.invoices where member_id = p_member and paid_paise > 0)
    into v_finance;

  if v_finance then
    raise exception 'Financial history found — cannot delete. Use archive instead.';
  end if;

  -- Detach login access
  update public.profiles
     set is_active = false,
         member_id = null
   where member_id = p_member;

  delete from public.members where id = p_member;

  return 'DELETED';
end $$;

revoke all on function public.apply_member_delete(uuid, uuid, text) from public;
grant execute on function public.apply_member_delete(uuid, uuid, text) to service_role;

-- 8. Update decide_approval to handle member_pause / member_resume / member_archive / member_delete
--    (This replaces the existing decide_approval from 0033)
create or replace function public.decide_approval(
  p_approval_id uuid,
  p_approve boolean,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  a          public.approvals;
  v_role     app_role := public.current_role();
  v_tenant   uuid := public.current_tenant_id();
  v_periods  text[];
  v_waived   int := 0;
  v_result   text := null;
  v_status   approval_status;
  v_req_role app_role;
begin
  if coalesce(v_role in ('sadar','secretary','auditor','khajanchi'), false) is not true then
    raise exception 'Not allowed to decide approvals';
  end if;

  select * into a from public.approvals where id = p_approval_id for update;
  if not found then
    raise exception 'Approval not found';
  end if;
  if a.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if a.status <> 'pending' then
    raise exception 'This request is already %', a.status;
  end if;
  if a.requested_by is not distinct from auth.uid() then
    raise exception 'Maker cannot decide their own request';
  end if;

  select role into v_req_role from public.profiles where id = a.requested_by;

  if p_approve then
    case a.entity_type
      when 'payment' then
        if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
          raise exception 'Only the office can verify a payment';
        end if;
        v_result := public.verify_payment(a.entity_id);

      when 'expense' then
        if coalesce(v_role in ('sadar','auditor'), false) is not true then
          raise exception 'Only the sadar or auditor can approve an expense';
        end if;
        perform public.approve_expense(a.entity_id);

      when 'fee_change' then
        if coalesce(v_role in ('sadar','secretary'), false) is not true then
          raise exception 'Only the sadar or secretary can approve a fee change';
        end if;
        perform public.approve_fee_override(a.entity_id);
        -- Notify member about fee change
        perform public.notify_member(
          a.entity_id, 'info',
          'Monthly fee updated',
          'Aapka monthly fee badla gaya hai. Naya amount agle mahine se laagu hoga.',
          jsonb_build_object('approved_by', auth.uid(), 'note', p_note)
        );

      when 'waiver' then
        if coalesce(v_role in ('sadar','secretary'), false) is not true then
          raise exception 'Only the sadar or secretary can sanction a waiver';
        end if;

        select coalesce(array_agg(value::text), array[]::text[])
          into v_periods
        from jsonb_array_elements_text(coalesce(a.meta -> 'periods', '[]'::jsonb));

        if cardinality(v_periods) = 0 then
          raise exception 'This waiver has no months attached';
        end if;

        update public.invoices
          set status = 'waived',
              waived_reason = coalesce(p_note, a.subtitle, 'Approved waiver'),
              waived_by = auth.uid()
        where tenant_id = a.tenant_id
          and member_id = a.entity_id
          and period = any (v_periods)
          and status in ('pending','partial');
        get diagnostics v_waived = row_count;

        if v_waived = 0 then
          raise exception 'Nothing left to waive — the dues were already settled';
        end if;
        -- Notify member about waiver
        perform public.notify_member(
          a.entity_id, 'info',
          'Dues waived for selected months',
          v_waived::text || ' mahine ka due maaf kiya gaya hai. Receipts par "waived" dikhega.',
          jsonb_build_object('approved_by', auth.uid(), 'months_waived', v_waived, 'note', p_note)
        );
        v_result := v_waived::text;

      when 'payment_reset' then
        if v_role <> 'khajanchi' then
          raise exception 'Reset sirf Khajanchi approve kar sakta hai';
        end if;
        v_result := public.apply_member_payment_reset(
          a.entity_id, auth.uid(), coalesce(p_note, a.subtitle)
        );

      when 'payment_edit' then
        if coalesce(v_req_role::text, 'sadar') = 'khajanchi' then
          if coalesce(v_role in ('sadar','secretary'), false) is not true then
            raise exception 'Khajanchi ki entry ko Sadar ya Secretary hi approve karega';
          end if;
        else
          if v_role <> 'khajanchi' then
            raise exception 'Payment correction sirf Khajanchi approve kar sakta hai';
          end if;
        end if;

        v_result := public.apply_payment_edit(
          a.entity_id,
          coalesce((a.meta ->> 'amount_paise')::bigint, a.amount_paise),
          coalesce(a.meta ->> 'new_method', 'cash'),
          a.meta ->> 'new_reference',
          a.meta ->> 'new_note',
          auth.uid()
        );

      when 'member_pause' then
        -- Cross-approval: Sadar/Secretary request → Khajanchi approves
        --                Khajanchi request → Sadar/Secretary approves
        if coalesce(v_req_role::text, 'sadar') = 'khajanchi' then
          if coalesce(v_role in ('sadar','secretary'), false) is not true then
            raise exception 'Khajanchi ki pause request ko Sadar ya Secretary hi approve karega';
          end if;
        else
          if v_role <> 'khajanchi' then
            raise exception 'Pause sirf Khajanchi approve kar sakta hai';
          end if;
        end if;
        v_result := public.apply_member_pause(
          a.entity_id, auth.uid(), coalesce(p_note, a.subtitle)
        );

      when 'member_resume' then
        -- Same cross-approval logic
        if coalesce(v_req_role::text, 'sadar') = 'khajanchi' then
          if coalesce(v_role in ('sadar','secretary'), false) is not true then
            raise exception 'Khajanchi ki resume request ko Sadar ya Secretary hi approve karega';
          end if;
        else
          if v_role <> 'khajanchi' then
            raise exception 'Resume sirf Khajanchi approve kar sakta hai';
          end if;
        end if;
        v_result := public.apply_member_resume(
          a.entity_id, auth.uid(), coalesce(p_note, a.subtitle)
        );

      when 'member_archive' then
        -- Cross-approval: Sadar/Secretary request → Khajanchi approves
        --                Khajanchi request → Sadar/Secretary approves
        if coalesce(v_req_role::text, 'sadar') = 'khajanchi' then
          if coalesce(v_role in ('sadar','secretary'), false) is not true then
            raise exception 'Khajanchi ki archive request ko Sadar ya Secretary hi approve karega';
          end if;
        else
          if v_role <> 'khajanchi' then
            raise exception 'Archive sirf Khajanchi approve kar sakta hai';
          end if;
        end if;
        v_result := public.apply_member_archive(
          a.entity_id, auth.uid(), coalesce(p_note, a.subtitle)
        );

      when 'member_delete' then
        -- Cross-approval: Sadar/Secretary request → Khajanchi approves
        --                Khajanchi request → Sadar/Secretary approves
        if coalesce(v_req_role::text, 'sadar') = 'khajanchi' then
          if coalesce(v_role in ('sadar','secretary'), false) is not true then
            raise exception 'Khajanchi ki delete request ko Sadar ya Secretary hi approve karega';
          end if;
        else
          if v_role <> 'khajanchi' then
            raise exception 'Delete sirf Khajanchi approve kar sakta hai';
          end if;
        end if;
        v_result := public.apply_member_delete(
          a.entity_id, auth.uid(), coalesce(p_note, a.subtitle)
        );

      else
        v_result := a.entity_type;
    end case;
  else
    case a.entity_type
      when 'payment' then
        if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
          raise exception 'Only the office can reject a payment';
        end if;
        perform public.reject_payment(
          a.entity_id,
          coalesce(p_note, 'Rejected by ' || v_role::text)
        );
        v_result := 'payment_rejected';

      when 'expense' then
        if coalesce(v_role in ('sadar','secretary','auditor'), false) is not true then
          raise exception 'Only the office can reject an expense';
        end if;
        perform public.reject_expense(a.entity_id, p_note);
        v_result := 'expense_rejected';

      when 'fee_change' then
        perform public.notify_member(
          a.entity_id, 'info',
          'Fee change request rejected',
          'Aapka fee change request approve nahi hua. Wajah: ' || coalesce(p_note, 'Office ne reject kiya'),
          jsonb_build_object('rejected_by', auth.uid(), 'note', p_note)
        );
        v_result := 'fee_change_rejected';

      when 'waiver' then
        perform public.notify_member(
          a.entity_id, 'info',
          'Waiver request rejected',
          'Aapka dues waiver request approve nahi hua. Wajah: ' || coalesce(p_note, 'Office ne reject kiya'),
          jsonb_build_object('rejected_by', auth.uid(), 'note', p_note)
        );
        v_result := 'waiver_rejected';

      when 'member_pause', 'member_resume', 'member_archive', 'member_delete' then
        -- Anyone who could approve can also reject
        if coalesce(v_role in ('sadar','secretary','khajanchi'), false) is not true then
          raise exception 'Not allowed to reject this request';
        end if;
        v_result := a.entity_type || '_rejected';

      else
        v_result := a.entity_type || '_rejected';
    end case;
  end if;

  v_status := case when p_approve then 'approved' else 'rejected' end;

  update public.approvals
    set status = v_status,
        decided_by = auth.uid(),
        decided_at = now(),
        decision_note = p_note
  where id = a.id;

  return jsonb_build_object(
    'approval_id', a.id,
    'entity_type', a.entity_type,
    'status', v_status,
    'waived', v_waived,
    'result', v_result
  );
end $$;

revoke all on function public.decide_approval(uuid, boolean, text) from public, anon;
grant execute on function public.decide_approval(uuid, boolean, text) to authenticated;

-- 9. Invoice generation already skips non-active (see 0004, 0024, 0035 where
--    `m.status = 'active'` is used). 'paused' is not 'active', so it will
--    automatically be excluded. No further changes needed there.

-- 10. Outstanding/dues queries already filter by active (0030, 0038).
--     'paused' members won't appear in outstanding.