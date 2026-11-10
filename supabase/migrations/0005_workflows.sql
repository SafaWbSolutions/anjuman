-- ═══════════════════════════════════════════════════════════════
-- 0005 · Approval workflow
--
-- The panel shows one queue: payments to verify, expenses to
-- approve, waivers to sanction, fee changes to sign off. This
-- migration gives that queue a single, auditable decision point.
--
-- Nothing here can be skipped: the decision RPC re-checks the role,
-- the tenant and maker–checker, then delegates to the same money
-- functions the rest of the system uses.
--
-- Depends on: 0001 (tables), 0002 (RLS), 0003 (verify/approve),
--             0004 (fee overrides, guards).
-- ═══════════════════════════════════════════════════════════════

-- ── Waivers need to remember which months they cover ────────────
-- `entity_id` alone cannot express "waive Aug and Sep". A small
-- jsonb bag keeps the request self-describing without a new table.
alter table public.approvals
  add column if not exists meta jsonb not null default '{}'::jsonb;

-- ── A request is immutable once decided ─────────────────────────
-- Direct table updates from a browser already cannot set
-- status/decided_by (guard_approval_insert only runs on insert), so
-- add the matching update guard.
create or replace function public.guard_approval_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.status      is distinct from old.status
     or new.decided_by is distinct from old.decided_by
     or new.decided_at is distinct from old.decided_at
     or new.decision_note is distinct from old.decision_note
     or new.step      is distinct from old.step then
    raise exception 'Use the approval workflow to decide a request';
  end if;

  if old.status <> 'pending' then
    raise exception 'A decided request is locked';
  end if;

  return new;
end $$;

drop trigger if exists approvals_guard_update on public.approvals;
create trigger approvals_guard_update
  before update on public.approvals
  for each row execute function public.guard_approval_update();

-- ── RPC · request_waiver (periods stored in meta) ───────────────
create or replace function public.request_waiver(
  p_member uuid,
  p_periods text[],
  p_reason text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_total  bigint := 0;
  v_id     uuid;
begin
  if coalesce(public.current_role() in ('sadar','secretary'), false) is not true then
    raise exception 'Not allowed to request waivers';
  end if;
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if p_periods is null or cardinality(p_periods) = 0 then
    raise exception 'Choose at least one month to waive';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required for a waiver';
  end if;

  select coalesce(sum(amount_paise - paid_paise), 0) into v_total
  from public.invoices
  where tenant_id = v_tenant
    and member_id = p_member
    and period = any (p_periods)
    and status in ('pending','partial');

  if v_total <= 0 then
    raise exception 'There are no unpaid dues in the selected months';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (v_tenant, 'waiver', p_member,
     'Waive dues — ' || (v_total / 100)::text,
     p_reason, v_total, auth.uid(), 1, 2,
     jsonb_build_object('periods', to_jsonb(p_periods)))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_waiver(uuid, text[], text) from public, anon;
grant execute on function public.request_waiver(uuid, text[], text) to authenticated;

-- ── RPC · decide_approval ───────────────────────────────────────
-- One function for the whole queue. It never trusts the client's
-- claim about what the request is: it re-reads the row, checks the
-- tenant, refuses self-approval and then calls the specialist RPC.
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
        -- 'member' and any future request type: recording the
        -- decision is the whole action.
        v_result := a.entity_type;
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

-- ── RPC · my_work_queue ─────────────────────────────────────────
-- The dashboard's "what needs me today" list. Reads only the
-- caller's tenant; returns counts and the oldest few items.
create or replace function public.my_work_queue(p_limit int default 20)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_limit  int := greatest(1, least(coalesce(p_limit, 20), 100));
begin
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if coalesce(public.is_office_bearer()
              or public.current_role() = 'collector', false) is not true then
    raise exception 'Not allowed to read the work queue';
  end if;

  return jsonb_build_object(
    'pending_payments', (
      select count(*) from public.payments
      where tenant_id = v_tenant and status = 'pending'
    ),
    'pending_expenses', (
      select count(*) from public.expenses
      where tenant_id = v_tenant and status = 'pending'
    ),
    'pending_approvals', (
      select count(*) from public.approvals
      where tenant_id = v_tenant and status = 'pending'
    ),
    'overdue_invoices', (
      select count(*) from public.invoices
      where tenant_id = v_tenant
        and status in ('pending','partial')
        and due_date < (now() at time zone 'Asia/Kolkata')::date
    ),
    'unallocated_paise', (
      select coalesce(sum(unallocated_paise), 0) from public.payments
      where tenant_id = v_tenant and unallocated_paise > 0
    ),
    'items', coalesce((
      select jsonb_agg(item)
      from (
        select item
        from (
          select jsonb_build_object(
            'kind', 'payment',
            'id', p.id,
            'title', 'Verify payment · ' || m.name,
            'subtitle', '₹' || (p.amount_paise / 100)::text || ' · ' || p.method,
            'created_at', p.created_at
          ) as item, p.created_at
          from public.payments p
          join public.members m on m.id = p.member_id
          where p.tenant_id = v_tenant and p.status = 'pending'

          union all

          select jsonb_build_object(
            'kind', 'expense',
            'id', e.id,
            'title', 'Approve bill · ' || e.vendor,
            'subtitle', e.category || ' · ₹' || (e.amount_paise / 100)::text,
            'created_at', e.created_at
          ) as item, e.created_at
          from public.expenses e
          where e.tenant_id = v_tenant and e.status = 'pending'

          union all

          select jsonb_build_object(
            'kind', 'approval',
            'id', a.id,
            'title', a.title,
            'subtitle', coalesce(a.subtitle, a.entity_type),
            'created_at', a.created_at
          ) as item, a.created_at
          from public.approvals a
          where a.tenant_id = v_tenant and a.status = 'pending'
        ) unioned
        order by created_at asc
        limit v_limit
      ) q
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.my_work_queue(int) from public, anon;
grant execute on function public.my_work_queue(int) to authenticated;
