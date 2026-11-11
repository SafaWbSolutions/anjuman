-- ═══════════════════════════════════════════════════════════════
-- 0023 · Fee cycle: custom start month, due date, backdated dues
--
-- Sadar can now decide from which month the chanda starts counting
-- (e.g. two years back) and on which day of the month it is due.
-- Backdated invoices are generated idempotently — running the
-- backfill twice never duplicates a month.
-- ═══════════════════════════════════════════════════════════════

alter table public.tenant_settings
  add column if not exists fee_start_period text;

-- ── Sadar sets the cycle ────────────────────────────────────────
create or replace function public.set_fee_cycle(
  p_start   text,
  p_due_day int default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
begin
  if coalesce(v_role in ('sadar', 'secretary', 'khajanchi'), false) is not true then
    raise exception 'Not allowed to change the fee cycle';
  end if;
  if v_tenant is null then
    raise exception 'No tenant in session';
  end if;

  if p_start is not null then
    p_start := nullif(btrim(p_start), '');
    if p_start is not null and p_start !~ '^\d{4}-\d{2}$' then
      raise exception 'Start month YYYY-MM format me chahiye (e.g. 2024-11)';
    end if;
    if p_start is not null
       and make_date(split_part(p_start, '-', 1)::int,
                     split_part(p_start, '-', 2)::int, 1)
           > (now() at time zone 'Asia/Kolkata')::date then
      raise exception 'Start month future me nahi ho sakta';
    end if;
  end if;

  if p_due_day is not null and (p_due_day < 1 or p_due_day > 28) then
    raise exception 'Due day 1 se 28 ke beech hona chahiye';
  end if;

  insert into public.tenant_settings (tenant_id)
  values (v_tenant)
  on conflict (tenant_id) do nothing;

  update public.tenant_settings
     set fee_start_period = p_start,
         invoice_due_day  = coalesce(p_due_day, invoice_due_day),
         updated_at       = now()
   where tenant_id = v_tenant;

  return jsonb_build_object(
    'fee_start_period', p_start,
    'invoice_due_day', coalesce(p_due_day, 10)
  );
end $$;

revoke all on function public.set_fee_cycle(text, int) from public;
grant execute on function public.set_fee_cycle(text, int) to authenticated;

-- ── Backfill every month from the chosen start ───────────────────
create or replace function public.generate_dues_range(
  p_from text default null,
  p_to   text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant   uuid := public.current_tenant_id();
  v_role     app_role := public.current_role();
  v_start    text;
  v_end      text;
  v_due_day  int;
  v_cur      text;
  v_month    date;
  v_due      date;
  v_created  int := 0;
  v_total    bigint := 0;
  v_ins      int := 0;
  v_months   int := 0;
  r          record;
begin
  if coalesce(public.is_service_role() or public.is_super_admin()
             or (v_role in ('sadar', 'secretary', 'khajanchi') and v_tenant is not null),
             false) is not true then
    raise exception 'Not allowed to generate dues';
  end if;

  select fee_start_period, invoice_due_day
    into v_start, v_due_day
  from public.tenant_settings where tenant_id = v_tenant;

  v_start   := coalesce(nullif(btrim(p_from), ''), v_start,
                        to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  v_end     := coalesce(nullif(btrim(p_to), ''),
                        to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  v_due_day := coalesce(v_due_day, 10);

  if v_start !~ '^\d{4}-\d{2}$' or v_end !~ '^\d{4}-\d{2}$' then
    raise exception 'Months YYYY-MM format me chahiye';
  end if;
  if v_start > v_end then
    raise exception 'Start month end month se aage hai';
  end if;

  v_cur := v_start;
  while v_cur <= v_end loop
    v_month := make_date(split_part(v_cur, '-', 1)::int,
                         split_part(v_cur, '-', 2)::int, 1);
    v_due   := v_month + (v_due_day - 1);
    v_months := v_months + 1;

    for r in
      select m.id as member_id,
             coalesce(o.amount_paise, m.fee_paise) as amount_paise
      from public.members m
      left join public.fee_overrides o
        on o.member_id = m.id and o.approved_by is not null
      where m.tenant_id = v_tenant
        and m.status = 'active'
        and m.member_type <> 'staff'
        and coalesce(o.amount_paise, m.fee_paise) > 0
    loop
      insert into public.invoices
        (tenant_id, member_id, period, amount_paise, due_date)
      values
        (v_tenant, r.member_id, v_cur, r.amount_paise, v_due)
      on conflict (tenant_id, member_id, period) do nothing;

      get diagnostics v_ins = row_count;
      if v_ins > 0 then
        v_created := v_created + 1;
        v_total   := v_total + r.amount_paise;
      end if;
    end loop;

    v_cur := to_char(v_month + interval '1 month', 'YYYY-MM');
  end loop;

  return jsonb_build_object(
    'from', v_start,
    'to', v_end,
    'months', v_months,
    'created', v_created,
    'amount_paise', v_total,
    'due_day', v_due_day
  );
end $$;

revoke all on function public.generate_dues_range(text, text) from public;
grant execute on function public.generate_dues_range(text, text) to authenticated, service_role;

-- ── Never create dues before the chosen start month ─────────────
create or replace function public.generate_monthly_invoices(
  p_tenant uuid,
  p_period text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_period   text;
  v_start_p  text;
  v_due_day  int := 10;
  v_start    date;
  v_due_date date;
  v_created  int := 0;
  v_total    bigint := 0;
  v_ins      int := 0;
  r          record;
begin
  if coalesce(public.is_service_role()
             or public.is_super_admin()
             or (public.current_tenant_id() = p_tenant
                 and public.current_role() in ('sadar','secretary','khajanchi')), false) is not true then
    raise exception 'Not allowed to generate invoices for this tenant';
  end if;

  v_period := coalesce(p_period, to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  if v_period !~ '^\d{4}-\d{2}$' then
    raise exception 'Invalid period % (expected YYYY-MM)', v_period;
  end if;

  select invoice_due_day, fee_start_period
    into v_due_day, v_start_p
  from public.tenant_settings where tenant_id = p_tenant;
  v_due_day := coalesce(v_due_day, 10);

  -- Counting has not started yet for this tenant.
  if v_start_p is not null and v_period < v_start_p then
    return jsonb_build_object(
      'tenant_id', p_tenant,
      'period', v_period,
      'created', 0,
      'reason', 'before fee start period'
    );
  end if;

  v_start := to_date(v_period || '-01', 'YYYY-MM-DD');
  v_due_date := v_start + (v_due_day - 1);

  for r in
    select m.id as member_id,
           coalesce(o.amount_paise, m.fee_paise) as amount_paise
    from public.members m
    left join public.fee_overrides o
      on o.member_id = m.id and o.approved_by is not null
    where m.tenant_id = p_tenant
      and m.status = 'active'
      and m.member_type <> 'staff'
      and m.joined_on <= (v_start + interval '1 month' - interval '1 day')::date
      and coalesce(o.amount_paise, m.fee_paise) > 0
  loop
    insert into public.invoices
      (tenant_id, member_id, period, amount_paise, due_date)
    values
      (p_tenant, r.member_id, v_period, r.amount_paise, v_due_date)
    on conflict (tenant_id, member_id, period) do nothing;

    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      v_created := v_created + 1;
      v_total := v_total + r.amount_paise;
    end if;
  end loop;

  return jsonb_build_object(
    'tenant_id', p_tenant,
    'period', v_period,
    'created', v_created,
    'amount_paise', v_total,
    'due_date', v_due_date
  );
end $$;
