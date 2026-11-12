-- ═══════════════════════════════════════════════════════════════
-- 0044 · Collection date (backdated receipts)
--
-- `payments.created_at` is the collection date chosen by the office.
-- Verification used to overwrite the reporting date with now(), so a
-- payment received two days ago but entered today landed in the wrong
-- day/month. This keeps the chosen collection date in `verified_at`
-- and in the ledger entry date.
-- ═══════════════════════════════════════════════════════════════

-- Guard: a collection date cannot be in the future.
create or replace function public.guard_payment_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.status       := 'pending';
    new.receipt_no   := null;
    new.verified_by  := null;
    new.verified_at  := null;
    new.unallocated_paise := 0;
    new.entered_by   := coalesce(new.entered_by, auth.uid());
  end if;

  if new.created_at is null then
    new.created_at := now();
  end if;
  if new.created_at > now() + interval '5 minutes' then
    raise exception 'Collection date future me nahi ho sakti';
  end if;

  return new;
end $$;

-- Verification keeps the collection date for the receipt, the ledger
-- and every monthly report.
create or replace function public.apply_verified_payment(
  p_payment_id uuid,
  p_verified_by uuid,
  p_note text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  p         public.payments;
  v_receipt text;
  v_left    bigint;
  v_due     bigint;
  v_take    bigint;
  r         record;
  v_date    timestamptz;
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment % not found', p_payment_id;
  end if;
  if p.status <> 'pending' then
    raise exception 'Payment is %, not pending', p.status;
  end if;

  v_date := coalesce(p.created_at, now());
  v_receipt := public.next_receipt_no(p.tenant_id);
  v_left := p.amount_paise;

  for r in
    select * from public.invoices
    where tenant_id = p.tenant_id
      and member_id = p.member_id
      and status in ('pending','partial')
    order by period asc
    for update
  loop
    exit when v_left <= 0;

    v_due := r.amount_paise - r.paid_paise;
    continue when v_due <= 0;

    v_take := least(v_due, v_left);

    update public.invoices
      set paid_paise = paid_paise + v_take
      where id = r.id;

    insert into public.payment_allocations (payment_id, invoice_id, amount_paise)
    values (p.id, r.id, v_take)
    on conflict (payment_id, invoice_id) do update
      set amount_paise = public.payment_allocations.amount_paise + excluded.amount_paise;

    v_left := v_left - v_take;
  end loop;

  update public.payments
    set status = 'verified',
        receipt_no = v_receipt,
        verified_by = p_verified_by,
        verified_at = v_date,
        unallocated_paise = v_left,
        note = coalesce(p_note, p.note)
    where id = p.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (p.tenant_id, v_date::date,
     case when p.method = 'cash' then 'Cash' else 'Bank' end,
     'Chanda received · ' || coalesce(p.reference, '')
       || case when v_left > 0 then ' · advance' else '' end,
     p.amount_paise, 0, 'payment', v_receipt, p_verified_by);

  return v_receipt;
end $$;

revoke all on function public.apply_verified_payment(uuid, uuid, text) from public;
grant execute on function public.apply_verified_payment(uuid, uuid, text) to service_role;
