-- ═══════════════════════════════════════════════════════════════
-- 0033 · Member notifications + payment corrections (maker-checker)
--
-- 1. Every member gets an in-app inbox. Payments, dues and notices
--    automatically create a notification row.
-- 2. A verified payment can never be silently edited. The Sadar or
--    Khajanchi raises a correction, and the *other* role approves it.
--    The ledger gets a matching adjustment entry and invoices are
--    re-allocated from scratch, so books and reports stay correct.
-- ═══════════════════════════════════════════════════════════════

-- ── A. Notifications ────────────────────────────────────────────
create table if not exists public.member_notifications (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  member_id  uuid references public.members(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  kind       text not null default 'info'
             check (kind in ('payment','due','notice','approval','info')),
  title      text not null,
  body       text,
  meta       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists member_notifications_member_idx
  on public.member_notifications (member_id, created_at desc);
create index if not exists member_notifications_tenant_idx
  on public.member_notifications (tenant_id, created_at desc);

alter table public.member_notifications enable row level security;

drop policy if exists member_notifications_select on public.member_notifications;
create policy member_notifications_select on public.member_notifications
  for select to authenticated
  using (
    member_id in (
      select p.member_id from public.profiles p
       where p.id = auth.uid() and p.member_id is not null
    )
    or user_id = auth.uid()
    or (
      tenant_id = public.current_tenant_id()
      and coalesce(
        public.current_role() in ('sadar','secretary','khajanchi','auditor'),
        false
      )
    )
  );

-- No direct insert/update/delete: only definer functions below.

create or replace function public.notify_member(
  p_member uuid,
  p_kind   text,
  p_title  text,
  p_body   text default null,
  p_meta   jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  m public.members;
begin
  if p_member is null then return; end if;

  select * into m from public.members where id = p_member;
  if not found then return; end if;

  insert into public.member_notifications
    (tenant_id, member_id, user_id, kind, title, body, meta, created_by)
  values
    (m.tenant_id, m.id,
     (select p.id from public.profiles p where p.member_id = m.id limit 1),
     coalesce(nullif(btrim(p_kind), ''), 'info'),
     p_title, nullif(btrim(p_body), ''), coalesce(p_meta, '{}'::jsonb), auth.uid());
end $$;

revoke all on function public.notify_member(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.notify_member(uuid, text, text, text, jsonb) to authenticated, service_role;

-- ── B. Automatic notifications from the books ───────────────────
create or replace function public.notify_payment_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_amount text := to_char(new.amount_paise / 100.0, 'FM999999990.00');
  v_old    text := to_char(old.amount_paise / 100.0, 'FM999999990.00');
begin
  if tg_op = 'INSERT' then
    perform public.notify_member(
      new.member_id, 'payment',
      'Payment ₹' || v_amount || ' entry hui',
      'Aapki ₹' || v_amount || ' payment '
        || case when new.status = 'verified' then 'verify ho gayi' else 'approval ke liye pending hai' end
        || ' · ' || upper(new.method)
        || coalesce(' · ' || nullif(new.reference, ''), ''),
      jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                         'status', new.status));
  elsif tg_op = 'UPDATE' then
    if new.status = 'verified' and old.status is distinct from 'verified' then
      perform public.notify_member(
        new.member_id, 'payment',
        'Payment ₹' || v_amount || ' verified',
        'Receipt ' || coalesce(new.receipt_no, '—')
          || ' · ' || upper(new.method),
        jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                           'status', new.status, 'receipt_no', new.receipt_no));
    elsif new.status = 'rejected' and old.status is distinct from 'rejected' then
      perform public.notify_member(
        new.member_id, 'payment',
        'Payment ₹' || v_amount || ' reject / reset hui',
        coalesce(nullif(new.note, ''), 'Office ne is entry ko reject kiya'),
        jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                           'status', new.status));
    elsif new.status = 'pending' and old.status = 'rejected' then
      perform public.notify_member(
        new.member_id, 'payment',
        'Payment ₹' || v_amount || ' dobara pending',
        'Office ne entry update ki hai — approval baaki hai',
        jsonb_build_object('payment_id', new.id, 'amount_paise', new.amount_paise,
                           'status', new.status));
    end if;

    if new.amount_paise is distinct from old.amount_paise then
      perform public.notify_member(
        new.member_id, 'approval',
        'Payment amount badla: ₹' || v_old || ' → ₹' || v_amount,
        'Receipt ' || coalesce(new.receipt_no, '—')
          || ' · approved correction ke baad hi final maana jayega',
        jsonb_build_object('payment_id', new.id,
                           'old_amount_paise', old.amount_paise,
                           'amount_paise', new.amount_paise));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists payments_notify_member on public.payments;
create trigger payments_notify_member
  after insert or update of amount_paise, status
  on public.payments
  for each row execute function public.notify_payment_change();

create or replace function public.notify_invoice_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_amount text := to_char(new.amount_paise / 100.0, 'FM999999990.00');
begin
  if tg_op = 'INSERT' then
    perform public.notify_member(
      new.member_id, 'due',
      'Nayi due · ' || new.period,
      '₹' || v_amount || ' ki due add hui — due date '
        || to_char(coalesce(new.due_date, current_date), 'DD Mon YYYY'),
      jsonb_build_object('invoice_id', new.id, 'period', new.period,
                         'amount_paise', new.amount_paise));
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'paid' then
      perform public.notify_member(
        new.member_id, 'due',
        'Due clear · ' || new.period,
        '₹' || v_amount || ' ki due poori tarah paid ho gayi',
        jsonb_build_object('invoice_id', new.id, 'period', new.period,
                           'amount_paise', new.amount_paise));
    elsif new.status = 'waived' then
      perform public.notify_member(
        new.member_id, 'due',
        'Due maaf · ' || new.period,
        coalesce(nullif(new.waived_reason, ''), 'Anjuman ne ye due waive kar di'),
        jsonb_build_object('invoice_id', new.id, 'period', new.period,
                           'amount_paise', new.amount_paise));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists invoices_notify_member on public.invoices;
create trigger invoices_notify_member
  after insert or update of status
  on public.invoices
  for each row execute function public.notify_invoice_change();

create or replace function public.notify_notice_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.audience in ('all', 'members') then
    insert into public.member_notifications
      (tenant_id, member_id, user_id, kind, title, body, meta, created_by)
    select new.tenant_id, m.id,
           (select p.id from public.profiles p where p.member_id = m.id limit 1),
           'notice', new.title,
           left(new.body, 400),
           jsonb_build_object('notice_id', new.id),
           new.created_by
      from public.members m
     where m.tenant_id = new.tenant_id
       and m.status = 'active';
  end if;
  return new;
end $$;

drop trigger if exists notices_notify_members on public.notices;
create trigger notices_notify_members
  after insert on public.notices
  for each row execute function public.notify_notice_change();

-- ── C. Read receipts (own rows only) ────────────────────────────
create or replace function public.mark_notification_read(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.member_notifications
     set read_at = now()
   where id = p_id
     and read_at is null
     and (
       member_id in (select p.member_id from public.profiles p
                      where p.id = auth.uid() and p.member_id is not null)
       or user_id = auth.uid()
     );
end $$;

create or replace function public.mark_all_notifications_read()
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update public.member_notifications
     set read_at = now()
   where read_at is null
     and (
       member_id in (select p.member_id from public.profiles p
                      where p.id = auth.uid() and p.member_id is not null)
       or user_id = auth.uid()
     );
end $$;

revoke all on function public.mark_notification_read(uuid) from public, anon;
revoke all on function public.mark_all_notifications_read() from public, anon;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- ── D. Payment corrections ──────────────────────────────────────
alter table public.approvals drop constraint if exists approvals_entity_type_check;
alter table public.approvals
  add constraint approvals_entity_type_check
  check (entity_type in ('payment','expense','waiver','member','fee_change',
                         'payment_reset','payment_edit'));

create or replace function public.request_payment_edit(
  p_payment   uuid,
  p_amount    bigint,
  p_method    text,
  p_reference text default null,
  p_note      text default null,
  p_reason    text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
  p        public.payments;
  m        public.members;
  v_id     uuid;
begin
  if coalesce(v_role in ('sadar','secretary','khajanchi'), false) is not true
     and not public.is_super_admin() then
    raise exception 'Sirf Sadar, Secretary ya Khajanchi payment correction request kar sakte hain';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount 0 se bada hona chahiye';
  end if;
  if coalesce(p_method, '') not in ('cash','upi','gateway','cheque','adjustment') then
    raise exception 'Payment method galat hai';
  end if;

  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if not public.is_super_admin() and p.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  select * into m from public.members where id = p.member_id;

  if exists (
    select 1 from public.approvals
     where tenant_id = p.tenant_id
       and entity_type = 'payment_edit'
       and entity_id = p.id
       and status = 'pending'
  ) then
    raise exception 'Is payment ki correction pehle se approval ke liye pending hai';
  end if;

  insert into public.approvals
    (tenant_id, entity_type, entity_id, title, subtitle, amount_paise,
     requested_by, step, total_steps, meta)
  values
    (p.tenant_id, 'payment_edit', p.id,
     'Payment correction · ₹' || to_char(p.amount_paise / 100.0, 'FM999999990.00')
       || ' → ₹' || to_char(p_amount / 100.0, 'FM999999990.00'),
     coalesce(m.name, 'Member') || coalesce(' · ' || nullif(btrim(p_reason), ''),
                                            ' · wrong entry correction'),
     p_amount, auth.uid(), 1, 2,
     jsonb_build_object(
       'member_code', m.code,
       'member_name', m.name,
       'payment_id', p.id,
       'old_amount', p.amount_paise,
       'old_method', p.method,
       'old_reference', p.reference,
       'old_note', p.note,
       'amount_paise', p_amount,
       'new_method', p_method,
       'new_reference', p_reference,
       'new_note', p_note))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.request_payment_edit(uuid, bigint, text, text, text, text) from public, anon;
grant execute on function public.request_payment_edit(uuid, bigint, text, text, text, text)
  to authenticated, service_role;

create or replace function public.apply_payment_edit(
  p_payment   uuid,
  p_amount    bigint,
  p_method    text,
  p_reference text,
  p_note      text,
  p_by        uuid
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  p        public.payments;
  v_alloc  record;
  v_inv    record;
  v_left   bigint;
  v_delta  bigint;
  v_acct   text;
begin
  select * into p from public.payments where id = p_payment for update;
  if not found then raise exception 'Payment not found'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount 0 se bada hona chahiye';
  end if;

  v_delta := p_amount - p.amount_paise;
  v_acct  := case when p.method = 'cash' then 'Cash' else 'Bank' end;

  -- Verified money: adjust the ledger by the difference.
  if p.status = 'verified' and v_delta <> 0 then
    if v_delta > 0 then
      insert into public.ledger_entries
        (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
         ref_type, ref_no, created_by)
      values
        (p.tenant_id, current_date, v_acct,
         'Payment correction (+) · ' || coalesce(p.receipt_no, p.id::text),
         v_delta, 0, 'payment_correction', p.receipt_no, p_by);
    else
      insert into public.ledger_entries
        (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
         ref_type, ref_no, created_by)
      values
        (p.tenant_id, current_date, v_acct,
         'Payment correction (−) · ' || coalesce(p.receipt_no, p.id::text),
         0, -v_delta, 'payment_correction', p.receipt_no, p_by);
    end if;
  end if;

  -- Rebuild allocations so invoices reflect the corrected amount.
  if p.status = 'verified' then
    for v_alloc in
      select * from public.payment_allocations where payment_id = p.id
    loop
      update public.invoices
         set paid_paise = greatest(0, paid_paise - v_alloc.amount_paise)
       where id = v_alloc.invoice_id;
    end loop;
    delete from public.payment_allocations where payment_id = p.id;

    v_left := p_amount;
    for v_inv in
      select * from public.invoices
       where tenant_id = p.tenant_id
         and member_id = p.member_id
         and status in ('pending','partial')
       order by period asc
       for update
    loop
      exit when v_left <= 0;
      declare
        v_due  bigint := v_inv.amount_paise - v_inv.paid_paise;
        v_take bigint := least(v_due, v_left);
      begin
        if v_take > 0 then
          update public.invoices
             set paid_paise = paid_paise + v_take
           where id = v_inv.id;
          insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
          values (p.id, v_inv.id, v_take);
          v_left := v_left - v_take;
        end if;
      end;
    end loop;
  end if;

  update public.payments
     set amount_paise = p_amount,
         method       = p_method,
         reference    = nullif(btrim(coalesce(p_reference, '')), ''),
         note         = coalesce(nullif(btrim(coalesce(p_note, '')), ''),
                                 note)
                          || ' · corrected (maker-checker)',
         verified_by  = coalesce(verified_by, p_by)
   where id = p.id;

  return 'Payment corrected · ₹'
    || to_char(p.amount_paise / 100.0, 'FM999999990.00')
    || ' → ₹' || to_char(p_amount / 100.0, 'FM999999990.00');
end $$;

revoke all on function public.apply_payment_edit(uuid, bigint, text, text, text, uuid)
  from public, anon;
grant execute on function public.apply_payment_edit(uuid, bigint, text, text, text, uuid)
  to service_role;

-- ── E. decide_approval gains the payment_edit branch ────────────
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
