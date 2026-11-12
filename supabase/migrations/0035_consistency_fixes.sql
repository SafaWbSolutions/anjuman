-- ═══════════════════════════════════════════════════════════════
-- 0035 · Remaining consistency fixes
--
--   • Bulk dues generation never bills a month before the member
--     actually joined.
--   • Work-queue figures use verified advances only and ignore
--     inactive members' old invoices.
-- ═══════════════════════════════════════════════════════════════

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
  v_month_end date;
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
    v_month_end := (v_month + interval '1 month' - interval '1 day')::date;
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
        and m.joined_on <= v_month_end
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
      select count(*) from public.invoices i
      join public.members m on m.id = i.member_id
      where i.tenant_id = v_tenant
        and i.status in ('pending','partial')
        and i.due_date < (now() at time zone 'Asia/Kolkata')::date
        and m.status = 'active'
    ),
    'unallocated_paise', (
      select coalesce(sum(unallocated_paise), 0) from public.payments
      where tenant_id = v_tenant
        and status = 'verified'
        and unallocated_paise > 0
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
      ) listed
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.my_work_queue(int) from public, anon;
grant execute on function public.my_work_queue(int) to authenticated;
