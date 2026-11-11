-- ═══════════════════════════════════════════════════════════════
-- 0029 · Reset one member's payments (Sadar request → Khajanchi approval)
--
-- Money is never silently deleted. A reset:
--   • marks every payment of that member as 'rejected'
--   • clears their allocations and puts the invoices back to unpaid
--   • posts a matching CREDIT reversal in the tamper-evident ledger
-- so the book balance and reports stay correct and auditable.
-- Only the Khajanchi can approve the reset, after the Sadar asks.
-- ═══════════════════════════════════════════════════════════════

-- Allow a new approval kind.
alter table public.approvals drop constraint if exists approvals_entity_type_check;
alter table public.approvals
  add constraint approvals_entity_type_check
  check (entity_type in ('payment','expense','waiver','member','fee_change','payment_reset'));

-- ── A. Sadar asks for a reset ───────────────────────────────────
create or replace function public.request_payment_reset(
  p_member uuid,
  p_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  m        public.members;
  v_total  bigint;
  v_id     uuid;
begin
  if v_role not in ('sadar', 'secretary') and not public.is_super_admin() then
    raise exception 'Sirf Sadar ya Secretary reset request kar sakte hain';
  end if;

  select * into m from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  select coalesce(sum(amount_paise), 0) into v_total
    from public.payments
   where member_id = p_member and status in ('verified','pending');

  if v_total <= 0 then
    raise exception 'Is member ka koi payment nahi hai';
  end if;

  if exists (
    select 1 from public.approvals
     where tenant_id = m.tenant_id
       and entity_type = 'payment_reset'
       and entity_id = p_member
       and status = 'pending'
  ) then
    raise exception 'Is member ka reset pehle se Khajanchi ke paas pending hai';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (m.tenant_id, 'payment_reset', m.id,
     'Reset payments · ' || m.name,
     coalesce(nullif(btrim(p_reason), ''), 'Demo / wrong entries clear karni hain'),
     v_total, auth.uid(), 1, 2,
     jsonb_build_object('member_code', m.code))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_payment_reset(uuid, text) from public;
grant execute on function public.request_payment_reset(uuid, text) to authenticated, service_role;

-- ── B. Khajanchi-approved reset ─────────────────────────────────
create or replace function public.apply_member_payment_reset(
  p_member uuid,
  p_by     uuid,
  p_note   text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  m        public.members;
  p        record;
  v_total  bigint := 0;
  v_count  int := 0;
begin
  if not public.is_service_role() and public.current_role() <> 'khajanchi' then
    raise exception 'Sirf Khajanchi reset approve kar sakta hai';
  end if;

  select * into m from public.members where id = p_member for update;
  if not found then raise exception 'Member not found'; end if;
  if not public.is_super_admin() and m.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  -- Reversal entry for every verified receipt, before touching them.
  for p in
    select * from public.payments
     where member_id = p_member and status = 'verified'
     order by created_at
  loop
    insert into public.ledger_entries
      (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
       ref_type, ref_no, created_by)
    values
      (p.tenant_id, current_date,
       case when p.method = 'cash' then 'Cash' else 'Bank' end,
       'Payment reset · ' || m.code
         || coalesce(' · ' || nullif(btrim(p_note), ''), ''),
       0, p.amount_paise, 'payment_reset', p.receipt_no, p_by);
    v_total := v_total + p.amount_paise;
    v_count := v_count + 1;
  end loop;

  delete from public.payment_allocations
   where payment_id in (select id from public.payments where member_id = p_member);

  update public.payments
     set status = 'rejected',
         note = coalesce(nullif(note, '') || ' · ', '')
                || 'Reset approved by Khajanchi'
   where member_id = p_member
     and status in ('verified', 'pending');

  update public.invoices
     set paid_paise = 0,
         status = 'pending'
   where member_id = p_member
     and status in ('pending', 'partial', 'paid');

  return v_count::text || ' payments reset · ₹'
         || to_char(v_total / 100.0, 'FM999999990.00');
end $$;

revoke all on function public.apply_member_payment_reset(uuid, uuid, text) from public;
grant execute on function public.apply_member_payment_reset(uuid, uuid, text) to service_role;

-- ── C. decide_approval gains the payment_reset branch ───────────
create or replace function public.decide_approval(
  p_approval_id uuid,
  p_approve boolean,
  p_note text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  a         public.approvals;
  v_role    app_role := public.current_role();
  v_tenant  uuid := public.current_tenant_id();
  v_periods text[];
  v_waived  int := 0;
  v_result  text := null;
  v_status  approval_status;
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
