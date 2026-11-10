-- ═══════════════════════════════════════════════════════════════
-- 0006 · Rejecting an expense
--
-- The queue could approve a bill but had no way to reject one. A
-- rejected bill must leave the fund untouched and stay visible, so
-- this adds a maker–checker RPC and makes decide_approval cascade a
-- rejection to the underlying record.
--
-- Depends on: 0003 (approve_expense), 0004 (guards, reject_payment),
--             0005 (decide_approval).
-- ═══════════════════════════════════════════════════════════════

-- ── RPC · reject_expense ────────────────────────────────────────
create or replace function public.reject_expense(
  p_expense_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  e        public.expenses;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
begin
  if coalesce(v_role in ('sadar','secretary','auditor'), false) is not true then
    raise exception 'Not allowed to reject expenses';
  end if;

  select * into e from public.expenses where id = p_expense_id for update;
  if not found then
    raise exception 'Expense not found';
  end if;
  if e.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;
  if e.status <> 'pending' then
    raise exception 'Expense is already %', e.status;
  end if;
  if e.entered_by is not distinct from auth.uid() then
    raise exception 'Maker cannot reject their own entry';
  end if;

  update public.expenses
    set status = 'rejected',
        approved_by = auth.uid(),
        approved_at = now(),
        note = coalesce(nullif(btrim(p_reason), ''), e.note, 'Rejected')
    where id = e.id;
end $$;

revoke all on function public.reject_expense(uuid, text) from public, anon;
grant execute on function public.reject_expense(uuid, text) to authenticated;

-- ── decide_approval now cascades a rejection ────────────────────
-- Rejecting a payment or a bill must not leave the underlying row
-- pending forever. The maker–checker rules of the specialist RPCs
-- still apply, because we call them instead of writing directly.
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

      else
        v_result := a.entity_type;
    end case;
  else
    -- Rejection: close the underlying record too, using the same
    -- maker–checker rules as approval.
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
