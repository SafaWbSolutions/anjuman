-- ═══════════════════════════════════════════════════════════════
-- 0024 · Backdated member dues + member advance payment (dual approval)
-- ═══════════════════════════════════════════════════════════════

-- ── A. Backdated dues for one member ────────────────────────────
create or replace function public.generate_member_dues(
  p_member uuid,
  p_from   text,
  p_to     text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_role     app_role := public.current_role();
  m          public.members;
  v_due_day  int := 10;
  v_end      text;
  v_cur      text;
  v_month    date;
  v_due      date;
  v_amount   bigint;
  v_created  int := 0;
  v_total    bigint := 0;
  v_months   int := 0;
  v_ins      int := 0;
begin
  if coalesce(public.is_service_role()
             or (v_role in ('sadar','secretary','khajanchi') and v_tenant is not null),
             false) is not true then
    raise exception 'Not allowed to create member dues';
  end if;

  select * into m from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;
  if m.tenant_id is distinct from v_tenant and not public.is_service_role() then
    raise exception 'Wrong tenant';
  end if;

  select invoice_due_day into v_due_day
    from public.tenant_settings where tenant_id = m.tenant_id;
  v_due_day := coalesce(v_due_day, 10);

  select coalesce(o.amount_paise, m.fee_paise) into v_amount
    from public.members mm
    left join public.fee_overrides o
      on o.member_id = mm.id and o.approved_by is not null
   where mm.id = p_member;
  v_amount := coalesce(v_amount, m.fee_paise);

  if v_amount <= 0 then
    raise exception 'Is member ki monthly fee 0 hai — pehle fee set karein';
  end if;

  if p_from !~ '^\d{4}-\d{2}$' then
    raise exception 'Start month YYYY-MM format me chahiye';
  end if;
  v_end := coalesce(nullif(btrim(p_to), ''),
                    to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  if v_end !~ '^\d{4}-\d{2}$' then
    raise exception 'End month YYYY-MM format me chahiye';
  end if;
  if p_from > v_end then
    raise exception 'Start month end month se aage hai';
  end if;

  v_cur := p_from;
  while v_cur <= v_end loop
    v_month := make_date(split_part(v_cur, '-', 1)::int,
                         split_part(v_cur, '-', 2)::int, 1);
    v_due := v_month + (v_due_day - 1);
    v_months := v_months + 1;

    insert into public.invoices
      (tenant_id, member_id, period, amount_paise, due_date)
    values
      (m.tenant_id, m.id, v_cur, v_amount, v_due)
    on conflict (tenant_id, member_id, period) do nothing;

    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      v_created := v_created + 1;
      v_total := v_total + v_amount;
    end if;

    v_cur := to_char(v_month + interval '1 month', 'YYYY-MM');
  end loop;

  return jsonb_build_object(
    'member_id', m.id,
    'from', p_from,
    'to', v_end,
    'months', v_months,
    'created', v_created,
    'amount_paise', v_total,
    'monthly_paise', v_amount
  );
end $$;

revoke all on function public.generate_member_dues(uuid, text, text) from public;
grant execute on function public.generate_member_dues(uuid, text, text) to authenticated, service_role;

-- ── B. Member-submitted advance payment ─────────────────────────
alter table public.payments
  add column if not exists requires_dual_approval boolean not null default false;
alter table public.payments
  add column if not exists first_approved_by uuid references public.profiles(id);
alter table public.payments
  add column if not exists first_approved_at timestamptz;

create or replace function public.submit_advance_payment(
  p_member   uuid,
  p_amount   bigint,
  p_method   text default 'upi',
  p_reference text default null,
  p_note     text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
  v_own    uuid;
  v_member public.members;
  v_id     uuid;
begin
  if v_uid is null then raise exception 'Login required'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount 0 se zyada hona chahiye';
  end if;

  select * into v_member from public.members where id = p_member;
  if not found then raise exception 'Member not found'; end if;

  if v_role in ('member', 'collector') then
    select member_id into v_own from public.profiles where id = v_uid;
    if v_own is distinct from p_member then
      raise exception 'Sirf apni payment submit kar sakte hain';
    end if;
  elsif v_role not in ('sadar','secretary','khajanchi') then
    raise exception 'Not allowed to submit this payment';
  end if;

  if v_member.tenant_id is distinct from v_tenant then
    raise exception 'Wrong tenant';
  end if;

  insert into public.payments
    (tenant_id, member_id, amount_paise, method, reference, note,
     entered_by, status, requires_dual_approval)
  values
    (v_member.tenant_id, p_member, p_amount, p_method::payment_method,
     nullif(btrim(p_reference), ''),
     coalesce(nullif(btrim(p_note), ''), 'Advance payment'),
     v_uid, 'pending', true)
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.submit_advance_payment(uuid, bigint, text, text, text) from public;
grant execute on function public.submit_advance_payment(uuid, bigint, text, text, text) to authenticated;

-- ── C. Two approvals for member-submitted payments ──────────────
create or replace function public.verify_payment(p_payment_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  p        public.payments;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
  v_first_role app_role;
begin
  if coalesce(v_role in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Not allowed to verify payments';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from v_tenant then raise exception 'Wrong tenant'; end if;
  if p.status <> 'pending' then raise exception 'Payment already %', p.status; end if;
  if p.entered_by is not distinct from auth.uid() then
    raise exception 'Maker cannot verify their own entry';
  end if;

  -- Member-submitted advance: sadar AND khajanchi, one after the other.
  if p.requires_dual_approval then
    if v_role not in ('sadar','khajanchi') then
      raise exception 'Sadar ya Khajanchi hi approve kar sakte hain';
    end if;

    if p.first_approved_by is null then
      update public.payments
         set first_approved_by = auth.uid(),
             first_approved_at = now()
       where id = p.id;
      return 'PENDING-SECOND-APPROVAL';
    end if;

    if p.first_approved_by = auth.uid() then
      raise exception 'Doosre approver (sadar/khajanchi) ka approval chahiye';
    end if;

    select role into v_first_role from public.profiles where id = p.first_approved_by;
    if v_first_role = v_role then
      raise exception 'Sadar aur Khajanchi dono approve karein';
    end if;
  end if;

  return public.apply_verified_payment(p_payment_id, auth.uid(), null);
end $$;

revoke all on function public.verify_payment(uuid) from public;
grant execute on function public.verify_payment(uuid) to authenticated;
