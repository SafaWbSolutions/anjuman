-- ═══════════════════════════════════════════════════════════════
-- 0041 · Pause / resume membership + maker-checker removal
--
-- Why
--   A member who takes a break (resigns temporarily) should not be
--   deleted: deleting loses the receipts and the payment history.
--   Pausing keeps every rupee of history, stops auto dues while the
--   pause lasts, and starts monthly dues again after a resume.
--
-- Security
--   Nothing destructive is one person's decision:
--     • pause  : Sadar asks → Khajanchi approves, or the other way
--     • resume : same pair
--     • archive: same pair (history is always kept)
--     • delete : same pair AND only when the member has zero
--                financial rows (no payments, donations or invoices)
--   The requester can never approve their own request (decide_approval
--   already enforces this). A super admin can raise a request, but it
--   still needs one of the two office bearers to decide it.
--
-- Billing
--   Invoices are only generated for status = 'active', so a paused
--   member is skipped by the nightly run. On resume, unpaid invoices
--   that belong to the paused months are marked 'waived' (auditable,
--   never deleted).
-- ═══════════════════════════════════════════════════════════════

-- ── A. Pause bookkeeping columns ────────────────────────────────
alter table public.members
  add column if not exists paused_at timestamptz;
alter table public.members
  add column if not exists paused_by uuid references public.profiles(id);
alter table public.members
  add column if not exists resumed_at timestamptz;

-- ── B. New approval kinds ───────────────────────────────────────
alter table public.approvals drop constraint if exists approvals_entity_type_check;
alter table public.approvals
  add constraint approvals_entity_type_check
  check (entity_type in ('payment','expense','waiver','member','fee_change',
                         'payment_reset','payment_edit',
                         'member_pause','member_resume',
                         'member_archive','member_delete'));

create index if not exists approvals_member_pending_idx
  on public.approvals (entity_id, status)
  where status = 'pending';

-- ── C. Maker-checker pairing helper ─────────────────────────────
-- Sadar's request → Khajanchi. Khajanchi's request → Sadar.
create or replace function public.assert_member_change_approver(p_requested_by uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
declare
  v_req  app_role;
  v_role app_role := public.current_role();
begin
  select role into v_req from public.profiles where id = p_requested_by;

  if v_req = 'sadar' then
    if v_role <> 'khajanchi' then
      raise exception 'Sadar ki request sirf Khajanchi approve kar sakta hai';
    end if;
  elsif v_req = 'khajanchi' then
    if v_role <> 'sadar' then
      raise exception 'Khajanchi ki request sirf Sadar approve kar sakta hai';
    end if;
  else
    -- Platform admin (or a legacy profile): either office bearer may decide.
    if v_role not in ('sadar','khajanchi') then
      raise exception 'Membership change sirf Sadar ya Khajanchi decide kar sakta hai';
    end if;
  end if;
end $$;

revoke all on function public.assert_member_change_approver(uuid) from public, anon;
grant execute on function public.assert_member_change_approver(uuid) to authenticated, service_role;

-- Shared guard: one pending membership action per member at a time.
create or replace function public.assert_no_pending_member_change(p_member uuid)
returns void
language plpgsql stable security definer set search_path = public
as $$
begin
  if exists (
    select 1 from public.approvals
     where entity_id = p_member
       and status = 'pending'
       and entity_type in ('member_pause','member_resume','member_archive','member_delete')
  ) then
    raise exception 'Is member ka ek membership request pehle se pending hai';
  end if;
end $$;

revoke all on function public.assert_no_pending_member_change(uuid) from public, anon;
grant execute on function public.assert_no_pending_member_change(uuid) to authenticated, service_role;

-- ── D. Requests ─────────────────────────────────────────────────
create or replace function public.request_member_pause(
  p_member uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if v_role not in ('sadar','khajanchi') and not public.is_super_admin() then
    raise exception 'Sirf Sadar ya Khajanchi pause request kar sakte hain';
  end if;
  if v_reason is null then
    raise exception 'Pause ki wajah likhna zaroori hai';
  end if;

  select * into m from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if m.status <> 'active' then
    raise exception 'Sirf active member ko pause kiya ja sakta hai';
  end if;

  perform public.assert_no_pending_member_change(p_member);

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_pause', m.id,
     'Pause membership · ' || m.name,
     v_reason, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code, 'member_name', m.name))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_pause(uuid, text) from public, anon;
grant execute on function public.request_member_pause(uuid, text) to authenticated, service_role;

create or replace function public.request_member_resume(
  p_member uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if v_role not in ('sadar','khajanchi') and not public.is_super_admin() then
    raise exception 'Sirf Sadar ya Khajanchi resume request kar sakte hain';
  end if;
  if v_reason is null then
    raise exception 'Resume ki wajah likhna zaroori hai';
  end if;

  select * into m from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if m.status <> 'paused' then
    raise exception 'Ye member paused nahi hai';
  end if;

  perform public.assert_no_pending_member_change(p_member);

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_resume', m.id,
     'Resume membership · ' || m.name,
     v_reason, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code, 'member_name', m.name,
                        'paused_at', m.paused_at))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_resume(uuid, text) from public, anon;
grant execute on function public.request_member_resume(uuid, text) to authenticated, service_role;

create or replace function public.request_member_archive(
  p_member uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_id     uuid;
begin
  if v_role not in ('sadar','khajanchi') and not public.is_super_admin() then
    raise exception 'Sirf Sadar ya Khajanchi archive request kar sakte hain';
  end if;
  if v_reason is null then
    raise exception 'Archive ki wajah likhna zaroori hai';
  end if;

  select * into m from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if m.status = 'inactive' then
    raise exception 'Ye member pehle se archived hai';
  end if;

  perform public.assert_no_pending_member_change(p_member);

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_archive', m.id,
     'Archive member · ' || m.name,
     v_reason, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code, 'member_name', m.name,
                        'from_status', m.status))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_archive(uuid, text) from public, anon;
grant execute on function public.request_member_archive(uuid, text) to authenticated, service_role;

create or replace function public.request_member_delete(
  p_member uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant  uuid := public.current_tenant_id();
  v_role    app_role := public.current_role();
  m         public.members;
  v_reason  text := nullif(btrim(coalesce(p_reason, '')), '');
  v_finance boolean;
  v_id      uuid;
begin
  if v_role not in ('sadar','khajanchi') and not public.is_super_admin() then
    raise exception 'Sirf Sadar ya Khajanchi delete request kar sakte hain';
  end if;
  if v_reason is null then
    raise exception 'Permanent delete ki wajah likhna zaroori hai';
  end if;

  select * into m from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  select exists (select 1 from public.payments where member_id = p_member)
      or exists (select 1 from public.donations where member_id = p_member)
      or exists (select 1 from public.invoices where member_id = p_member)
    into v_finance;
  if v_finance then
    raise exception 'Is member ka financial record hai — permanent delete nahi ho sakta. Archive karein.';
  end if;

  perform public.assert_no_pending_member_change(p_member);

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'member_delete', m.id,
     'Permanent delete · ' || m.name,
     v_reason, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code, 'member_name', m.name))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_member_delete(uuid, text) from public, anon;
grant execute on function public.request_member_delete(uuid, text) to authenticated, service_role;

-- ── E. Appliers (only reachable through decide_approval) ────────
create or replace function public.apply_member_pause(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  m public.members;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if m.status <> 'active' then
    raise exception 'Member active nahi hai';
  end if;

  update public.members
     set status = 'paused',
         paused_at = now(),
         paused_by = p_by,
         resumed_at = null
   where id = p_member;

  perform public.notify_member(
    p_member, 'info',
    'Membership paused',
    'Aapki membership temporarily pause ho gayi hai. Pause period me koi auto due nahi banega.',
    jsonb_build_object('paused_at', now(), 'reason', p_note));

  return 'PAUSED';
end $$;

revoke all on function public.apply_member_pause(uuid, uuid, text) from public, anon;
grant execute on function public.apply_member_pause(uuid, uuid, text) to service_role;

create or replace function public.apply_member_resume(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  m             public.members;
  v_pause_month text;
  v_resume_month text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  v_waived      int := 0;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if m.status <> 'paused' then
    raise exception 'Ye member paused nahi hai';
  end if;

  v_pause_month := to_char(
    coalesce(m.paused_at, now()) at time zone 'Asia/Kolkata', 'YYYY-MM');

  -- Pause months are not chargeable. Money already received is untouched;
  -- only the unpaid balance of those months is waived, with an audit trail.
  update public.invoices
     set status = 'waived',
         waived_reason = 'Membership paused · resume approved',
         waived_by = p_by
   where tenant_id = m.tenant_id
     and member_id = p_member
     and period > v_pause_month
     and period < v_resume_month
     and status in ('pending','partial');
  get diagnostics v_waived = row_count;

  update public.members
     set status = 'active',
         paused_at = null,
         paused_by = null,
         resumed_at = now()
   where id = p_member;

  perform public.notify_member(
    p_member, 'info',
    'Membership resumed',
    'Aapki membership wapas active hai. Ab har mahine auto due chalu ho jayega.'
      || case when v_waived > 0
              then ' Pause period ke ' || v_waived::text || ' invoice waive kiye gaye.'
              else '' end,
    jsonb_build_object('resumed_at', now(), 'waived_invoices', v_waived,
                       'reason', p_note));

  return 'RESUMED';
end $$;

revoke all on function public.apply_member_resume(uuid, uuid, text) from public, anon;
grant execute on function public.apply_member_resume(uuid, uuid, text) to service_role;

create or replace function public.apply_member_archive(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  m public.members;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if m.status = 'inactive' then
    raise exception 'Ye member pehle se archived hai';
  end if;

  -- Login band, history intact.
  update public.profiles
     set is_active = false,
         member_id = null
   where member_id = p_member;

  update public.members
     set status = 'inactive',
         paused_at = null,
         paused_by = null,
         resumed_at = null
   where id = p_member;

  return 'ARCHIVED';
end $$;

revoke all on function public.apply_member_archive(uuid, uuid, text) from public, anon;
grant execute on function public.apply_member_archive(uuid, uuid, text) to service_role;

create or replace function public.apply_member_delete(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  m         public.members;
  v_finance boolean;
begin
  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;

  -- Defence in depth: even an approved request cannot erase money history.
  select exists (select 1 from public.payments where member_id = p_member)
      or exists (select 1 from public.donations where member_id = p_member)
      or exists (select 1 from public.invoices where member_id = p_member)
    into v_finance;
  if v_finance then
    raise exception 'Financial record maujood hai — permanent delete nahi ho sakta. Archive karein.';
  end if;

  update public.profiles
     set is_active = false,
         member_id = null
   where member_id = p_member;

  delete from public.members where id = p_member;
  return 'DELETED';
end $$;

revoke all on function public.apply_member_delete(uuid, uuid, text) from public, anon;
grant execute on function public.apply_member_delete(uuid, uuid, text) to service_role;

-- ── F. The old direct remove path can no longer hard-delete ─────
-- Kept for backward compatibility with older builds/automation, but it
-- now always archives. Permanent delete only happens through the
-- dual-approved request above.
create or replace function public.remove_member(p_member uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
begin
  if v_role <> 'sadar' and not public.is_super_admin() then
    raise exception 'Sirf Sadar member archive kar sakta hai';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  update public.profiles
     set is_active = false,
         member_id = null
   where member_id = p_member;

  update public.members
     set status = 'inactive',
         paused_at = null,
         paused_by = null,
         resumed_at = null
   where id = p_member;

  return 'ARCHIVED';
end $$;

revoke all on function public.remove_member(uuid) from public;
grant execute on function public.remove_member(uuid) to authenticated, service_role;

-- ── G. Restore clears pause bookkeeping ─────────────────────────
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
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if m.status = 'active' then
    raise exception 'Ye member pehle se active hai';
  end if;

  update public.members
     set status = 'active',
         paused_at = null,
         paused_by = null,
         resumed_at = now()
   where id = p_member;

  return 'RESTORED';
end $$;

revoke all on function public.restore_member(uuid) from public;
grant execute on function public.restore_member(uuid) to authenticated, service_role;

-- ── H. decide_approval gains the four membership branches ───────
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
        v_result := v_waived::text;

      when 'payment_reset' then
        if v_role <> 'khajanchi' then
          raise exception 'Reset sirf Khajanchi approve kar sakta hai';
        end if;
        v_result := public.apply_member_payment_reset(
          a.entity_id, auth.uid(), coalesce(p_note, a.subtitle)
        );

      when 'payment_edit' then
        -- The other role must approve: Khajanchi's entry → Sadar/Secretary,
        -- Sadar/Secretary's entry → Khajanchi.
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

      when 'member_pause', 'member_resume', 'member_archive', 'member_delete' then
        perform public.assert_member_change_approver(a.requested_by);

        if a.entity_type = 'member_pause' then
          v_result := public.apply_member_pause(
            a.entity_id, auth.uid(), coalesce(p_note, a.subtitle));
        elsif a.entity_type = 'member_resume' then
          v_result := public.apply_member_resume(
            a.entity_id, auth.uid(), coalesce(p_note, a.subtitle));
        elsif a.entity_type = 'member_archive' then
          v_result := public.apply_member_archive(
            a.entity_id, auth.uid(), coalesce(p_note, a.subtitle));
        else
          v_result := public.apply_member_delete(
            a.entity_id, auth.uid(), coalesce(p_note, a.subtitle));
        end if;

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

      when 'member_pause', 'member_resume', 'member_archive', 'member_delete' then
        perform public.assert_member_change_approver(a.requested_by);
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
