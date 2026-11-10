-- ═══════════════════════════════════════════════════════════════
-- 0004 · Automation, messaging & reconciliation
--
-- Everything a solo operator should never have to do by hand:
--   · monthly invoices            · dues reminders
--   · receipt messages            · notice broadcasts
--   · gateway webhook matching    · ledger verification
--   · subscription expiry
--
-- Also adds the financial guards: a payment, expense or ledger row
-- can only reach its final state through an approved RPC, never by
-- a direct table update from the browser.
--
-- Depends on: 0001 (tables), 0002 (helpers + RLS), 0003 (ledger).
-- ═══════════════════════════════════════════════════════════════

-- ── Optional extensions ─────────────────────────────────────────
-- Both ship with Supabase. On a plain Postgres install they may be
-- missing, so never fail the migration because of them.
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    create extension pg_cron;
  end if;
exception when others then
  raise notice 'pg_cron unavailable: %', sqlerrm;
end $$;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    create extension pg_net;
  end if;
exception when others then
  raise notice 'pg_net unavailable: %', sqlerrm;
end $$;

-- ── Context helpers ─────────────────────────────────────────────

-- The role from the request JWT. PostgREST puts it in
-- `request.jwt.claim.role` (and, on newer versions, a full claims
-- document). Reading it from the settings — not from current_user —
-- is important: inside a SECURITY DEFINER function current_user is
-- the function owner, so it can never distinguish a service call.
create or replace function public.jwt_role()
returns text
language plpgsql stable
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.jwt.claim.role', true), '');
  if v is not null then
    return v;
  end if;

  begin
    v := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  exception when others then
    v := null;
  end;

  return v;
end $$;

-- True only for server-side calls that present the secret key
-- (Edge Functions, scheduled jobs). Never true for a browser.
create or replace function public.is_service_role()
returns boolean
language sql stable
as $$
  select public.jwt_role() = 'service_role';
$$;

-- True when the current statement runs as a privileged database
-- role: a direct service_role request, or any SECURITY DEFINER RPC
-- owned by postgres. Used by the financial guards below. A browser
-- session always runs as `authenticated`, so it can never be true.
create or replace function public.is_trusted_context()
returns boolean
language sql stable
as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role');
$$;

-- ── Per-tenant automation settings ──────────────────────────────
create table if not exists public.tenant_settings (
  tenant_id               uuid primary key references public.tenants(id) on delete cascade,
  auto_generate_invoices  boolean not null default true,
  auto_send_reminders     boolean not null default true,
  auto_verify_gateway     boolean not null default true,
  reminder_days           int[] not null default '{3,7,10,15}',
  invoice_due_day         int not null default 10 check (invoice_due_day between 1 and 28),
  receipt_footer          text,
  updated_at              timestamptz not null default now()
);

insert into public.tenant_settings (tenant_id)
select id from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.ensure_tenant_settings()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.tenant_settings (tenant_id) values (new.id)
  on conflict (tenant_id) do nothing;
  return new;
end $$;

drop trigger if exists tenants_ensure_settings on public.tenants;
create trigger tenants_ensure_settings
  after insert on public.tenants
  for each row execute function public.ensure_tenant_settings();

drop trigger if exists tenant_settings_touch on public.tenant_settings;
create trigger tenant_settings_touch
  before update on public.tenant_settings
  for each row execute function public.touch_updated_at();

alter table public.tenant_settings enable row level security;

drop policy if exists tenant_settings_read on public.tenant_settings;
create policy tenant_settings_read on public.tenant_settings
  for select using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists tenant_settings_update on public.tenant_settings;
create policy tenant_settings_update on public.tenant_settings
  for update using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary'))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary'))
  );

-- ── Member contact preferences ──────────────────────────────────
alter table public.members
  add column if not exists whatsapp_opt_in boolean not null default true,
  add column if not exists sms_opt_in      boolean not null default true,
  add column if not exists email_opt_in    boolean not null default true,
  add column if not exists push_opt_in     boolean not null default true;

-- ── Integration secrets (server-only) ───────────────────────────
-- One row per integration. No RLS policy is created on purpose:
-- anon/authenticated get nothing, only service_role (which bypasses
-- RLS) can read a tenant's gateway / WhatsApp keys.
create table if not exists public.integration_secrets (
  integration_id uuid primary key references public.integrations(id) on delete cascade,
  tenant_id      uuid references public.tenants(id) on delete cascade,
  secret         jsonb not null default '{}'::jsonb,
  updated_at     timestamptz not null default now()
);

alter table public.integration_secrets enable row level security;
revoke all on public.integration_secrets from anon, authenticated;

-- ── Outbound message queue ──────────────────────────────────────
create table if not exists public.notification_queue (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  channel             text not null check (channel in ('whatsapp','sms','email','push')),
  template            text not null,
  recipient           text not null,
  recipient_name      text,
  payload             jsonb not null default '{}'::jsonb,
  status              text not null default 'queued'
                      check (status in ('queued','sending','sent','failed','skipped','cancelled')),
  priority            int not null default 5,
  attempts            int not null default 0,
  max_attempts        int not null default 3,
  scheduled_at        timestamptz not null default now(),
  locked_at           timestamptz,
  sent_at             timestamptz,
  provider            text,
  provider_message_id text,
  cost_paise          int not null default 0,
  error               text,
  dedupe_key          text,
  created_at          timestamptz not null default now()
);

create unique index if not exists notification_queue_dedupe_idx
  on public.notification_queue (tenant_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_queue_pick_idx
  on public.notification_queue (status, priority, scheduled_at)
  where status = 'queued';

create index if not exists notification_queue_tenant_idx
  on public.notification_queue (tenant_id, created_at desc);

alter table public.notification_queue enable row level security;

drop policy if exists notification_queue_read on public.notification_queue;
create policy notification_queue_read on public.notification_queue
  for select using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists notification_queue_manual_insert on public.notification_queue;
create policy notification_queue_manual_insert on public.notification_queue
  for insert with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi'))
  );

-- ── Gateway webhook events (idempotency ledger) ─────────────────
create table if not exists public.webhook_events (
  id            uuid primary key default gen_random_uuid(),
  provider      text not null,
  event_id      text not null,
  tenant_id     uuid references public.tenants(id) on delete cascade,
  signature_ok  boolean not null default false,
  payload       jsonb not null default '{}'::jsonb,
  status        text not null default 'received'
                check (status in ('received','processed','ignored','failed')),
  payment_id    uuid references public.payments(id) on delete set null,
  error         text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  unique (provider, event_id)
);

create index if not exists webhook_events_tenant_idx
  on public.webhook_events (tenant_id, received_at desc);

alter table public.webhook_events enable row level security;

drop policy if exists webhook_events_read on public.webhook_events;
create policy webhook_events_read on public.webhook_events
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','auditor','khajanchi'))
  );

-- ── Job history (what ran, when, with what result) ──────────────
create table if not exists public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade,
  job         text not null,
  status      text not null default 'running'
              check (status in ('running','success','failed','skipped')),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  stats       jsonb not null default '{}'::jsonb,
  error       text
);

create index if not exists job_runs_started_idx on public.job_runs (started_at desc);

alter table public.job_runs enable row level security;

drop policy if exists job_runs_read on public.job_runs;
create policy job_runs_read on public.job_runs
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','auditor'))
  );

-- ═══════════════════════════════════════════════════════════════
-- Channel selection: WhatsApp first, SMS fallback, but only if the
-- tenant has that integration enabled and the member opted in.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.pick_channel(
  p_tenant uuid,
  p_whatsapp_opt boolean,
  p_sms_opt boolean
) returns text
language sql stable security definer set search_path = public
as $$
  select case
    when p_whatsapp_opt and exists (
      select 1 from public.integrations
      where tenant_id = p_tenant and type = 'whatsapp' and enabled
    ) then 'whatsapp'
    when p_sms_opt and exists (
      select 1 from public.integrations
      where tenant_id = p_tenant and type = 'sms' and enabled
    ) then 'sms'
    else null
  end;
$$;

-- ═══════════════════════════════════════════════════════════════
-- RPC · generate_monthly_invoices
-- Idempotent: running it twice in a month creates nothing new.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.generate_monthly_invoices(
  p_tenant uuid,
  p_period text default null
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_period   text;
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

  select invoice_due_day into v_due_day
  from public.tenant_settings where tenant_id = p_tenant;
  v_due_day := coalesce(v_due_day, 10);

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

revoke all on function public.generate_monthly_invoices(uuid, text) from public;
grant execute on function public.generate_monthly_invoices(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- RPC · queue_reminders
-- Queues one message per unpaid invoice, deduplicated per day.
-- The actual send happens in the send-queue Edge Function.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.queue_reminders(
  p_tenant uuid,
  p_period text default null,
  p_force boolean default false
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_today   date := (now() at time zone 'Asia/Kolkata')::date;
  v_day     int := extract(day from (now() at time zone 'Asia/Kolkata'))::int;
  v_period  text := coalesce(p_period, to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'));
  v_days    int[];
  v_auto    boolean := true;
  v_created int := 0;
  v_skipped int := 0;
  v_ins     int := 0;
  v_channel text;
  r         record;
begin
  if coalesce(public.is_service_role()
             or public.is_super_admin()
             or (public.current_tenant_id() = p_tenant
                 and public.current_role() in ('sadar','secretary','khajanchi')), false) is not true then
    raise exception 'Not allowed to queue reminders for this tenant';
  end if;

  select reminder_days, auto_send_reminders
    into v_days, v_auto
  from public.tenant_settings where tenant_id = p_tenant;

  v_days := coalesce(v_days, '{3,7,10,15}');
  v_auto := coalesce(v_auto, true);

  if not v_auto and not public.is_service_role() then
    return jsonb_build_object('period', v_period, 'created', 0, 'reason', 'reminders_disabled');
  end if;
  if not p_force and not (v_day = any (v_days)) then
    return jsonb_build_object(
      'period', v_period, 'created', 0,
      'reason', 'not_a_reminder_day', 'day', v_day
    );
  end if;

  for r in
    select i.id as invoice_id,
           i.period,
           (i.amount_paise - i.paid_paise) as due_paise,
           i.due_date,
           m.id as member_id,
           m.name,
           m.phone,
           m.whatsapp_opt_in,
           m.sms_opt_in
    from public.invoices i
    join public.members m on m.id = i.member_id
    where i.tenant_id = p_tenant
      and i.period = v_period
      and i.status in ('pending','partial')
      and i.amount_paise > i.paid_paise
      and m.status = 'active'
      and m.phone is not null
  loop
    v_channel := public.pick_channel(p_tenant, r.whatsapp_opt_in, r.sms_opt_in);
    if v_channel is null then
      v_skipped := v_skipped + 1;
      continue;
    end if;

    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    values
      (p_tenant,
       v_channel,
       case when r.due_date < v_today then 'overdue_notice' else 'dues_reminder' end,
       r.phone,
       r.name,
       jsonb_build_object(
         'member_id', r.member_id,
         'member_name', r.name,
         'invoice_id', r.invoice_id,
         'period', r.period,
         'month_label', to_char(to_date(r.period || '-01', 'YYYY-MM-DD'), 'Mon YYYY'),
         'amount_paise', r.due_paise,
         'due_date', r.due_date,
         'overdue', r.due_date < v_today
       ),
       'reminder:' || r.invoice_id::text || ':' || v_period || ':' || v_day::text)
    on conflict do nothing;

    get diagnostics v_ins = row_count;
    if v_ins > 0 then
      v_created := v_created + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'period', v_period, 'created', v_created,
    'skipped', v_skipped, 'reason', 'queued'
  );
end $$;

revoke all on function public.queue_reminders(uuid, text, boolean) from public;
grant execute on function public.queue_reminders(uuid, text, boolean) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- Instant notice broadcast. A trigger, so publishing a notice from
-- any client (web or Android) always fans out the same way.
-- Audience is honoured: office-bearer notices never go to members.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.broadcast_notice(p_notice_id uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  n       public.notices;
  v_count int := 0;
  v_part  int := 0;
begin
  select * into n from public.notices where id = p_notice_id;
  if not found then
    return 0;
  end if;

  -- Scheduled notices wait for their publish time. The nightly job
  -- calls this function again once the time has passed.
  if n.published_at is not null and n.published_at > now() then
    return 0;
  end if;

  if n.audience = 'office_bearers' then
    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    select
      n.tenant_id,
      public.pick_channel(n.tenant_id, true, true),
      'notice_alert',
      p.phone,
      p.full_name,
      jsonb_build_object(
        'notice_id', n.id,
        'member_id', p.member_id,
        'member_name', p.full_name,
        'title', n.title,
        'body', n.body,
        'pinned', n.pinned
      ),
      'notice:' || n.id::text || ':p:' || p.id::text
    from public.profiles p
    where p.tenant_id = n.tenant_id
      and p.is_active
      and p.role in ('sadar','khajanchi','secretary','auditor')
      and p.phone is not null
      and public.pick_channel(n.tenant_id, true, true) is not null
    on conflict do nothing;
  else
    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    select
      n.tenant_id,
      public.pick_channel(n.tenant_id, m.whatsapp_opt_in, m.sms_opt_in),
      'notice_alert',
      m.phone,
      m.name,
      jsonb_build_object(
        'notice_id', n.id,
        'member_id', m.id,
        'member_name', m.name,
        'title', n.title,
        'body', n.body,
        'pinned', n.pinned
      ),
      'notice:' || n.id::text || ':m:' || m.id::text
    from public.members m
    where m.tenant_id = n.tenant_id
      and m.status = 'active'
      and m.phone is not null
      and public.pick_channel(n.tenant_id, m.whatsapp_opt_in, m.sms_opt_in) is not null
    on conflict do nothing;
  end if;

  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  return v_count;
end $$;

revoke all on function public.broadcast_notice(uuid) from public;
grant execute on function public.broadcast_notice(uuid) to service_role;

create or replace function public.queue_notice_broadcast()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.broadcast_notice(new.id);
  return new;
end $$;

drop trigger if exists notices_queue_broadcast on public.notices;
create trigger notices_queue_broadcast
  after insert on public.notices
  for each row execute function public.queue_notice_broadcast();

-- Scheduled notices that have come due since the last run.
create or replace function public.publish_due_notices()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  r       record;
  v_total int := 0;
begin
  if public.is_service_role() is not true then
    raise exception 'Only the scheduler can publish notices';
  end if;

  for r in
    select id from public.notices
    where published_at is not null
      and published_at <= now()
      and published_at > now() - interval '2 days'
  loop
    v_total := v_total + public.broadcast_notice(r.id);
  end loop;

  return v_total;
end $$;

revoke all on function public.publish_due_notices() from public;
grant execute on function public.publish_due_notices() to service_role;

-- ═══════════════════════════════════════════════════════════════
-- Instant receipt message after a payment is verified.
-- ═══════════════════════════════════════════════════════════════
create or replace function public.queue_payment_receipt()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_member  public.members;
  v_channel text;
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    select * into v_member from public.members where id = new.member_id;
    if v_member.id is null or v_member.phone is null then
      return new;
    end if;

    v_channel := public.pick_channel(new.tenant_id, v_member.whatsapp_opt_in, v_member.sms_opt_in);
    if v_channel is null then
      return new;
    end if;

    insert into public.notification_queue
      (tenant_id, channel, template, recipient, recipient_name, payload, dedupe_key)
    values
      (new.tenant_id, v_channel, 'receipt_issued', v_member.phone, v_member.name,
       jsonb_build_object(
         'member_id', new.member_id,
         'member_name', v_member.name,
         'payment_id', new.id,
         'receipt_no', new.receipt_no,
         'amount_paise', new.amount_paise
       ),
       'receipt:' || new.id::text)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists payments_queue_receipt on public.payments;
create trigger payments_queue_receipt
  after update of status on public.payments
  for each row execute function public.queue_payment_receipt();

-- ═══════════════════════════════════════════════════════════════
-- Payment allocation (single place where dues are settled)
-- ═══════════════════════════════════════════════════════════════

-- Overpayments are kept visible instead of being silently absorbed.
alter table public.payments
  add column if not exists unallocated_paise bigint not null default 0
  check (unallocated_paise >= 0);

-- One gateway order can produce exactly one payment row, even when a
-- webhook is delivered twice at the same moment.
create unique index if not exists payments_gateway_reference_unique
  on public.payments (tenant_id, reference)
  where method = 'gateway' and reference is not null;

-- The one function allowed to move a payment to `verified`.
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
begin
  select * into p from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Payment % not found', p_payment_id;
  end if;
  if p.status <> 'pending' then
    raise exception 'Payment is %, not pending', p.status;
  end if;

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
        verified_at = now(),
        unallocated_paise = v_left,
        note = coalesce(p_note, p.note)
    where id = p.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (p.tenant_id, current_date,
     case when p.method = 'cash' then 'Cash' else 'Bank' end,
     'Chanda received · ' || coalesce(p.reference, '')
       || case when v_left > 0 then ' · advance' else '' end,
     p.amount_paise, 0, 'payment', v_receipt, p_verified_by);

  return v_receipt;
end $$;

revoke all on function public.apply_verified_payment(uuid, uuid, text) from public;
grant execute on function public.apply_verified_payment(uuid, uuid, text) to service_role;

-- Human verification. Same rules as before, now delegating the
-- allocation + ledger work to the function above.
create or replace function public.verify_payment(p_payment_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  p        public.payments;
  v_role   app_role := public.current_role();
  v_tenant uuid := public.current_tenant_id();
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

  return public.apply_verified_payment(p_payment_id, auth.uid(), null);
end $$;

-- System verification, only for payments recorded by a signed
-- gateway webhook (entered_by is null). Never exposed to clients.
create or replace function public.verify_payment_auto(
  p_payment_id uuid,
  p_note text default 'auto-reconciled from gateway webhook'
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  p public.payments;
begin
  if public.is_service_role() is not true then
    raise exception 'Auto-verification is a server-only operation';
  end if;

  select * into p from public.payments where id = p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if p.entered_by is not null then
    raise exception 'Only gateway-recorded payments can be auto-verified';
  end if;
  if p.method is distinct from 'gateway' then
    raise exception 'Only gateway payments can be auto-verified';
  end if;

  return public.apply_verified_payment(p_payment_id, null, p_note);
end $$;

revoke all on function public.verify_payment_auto(uuid, text) from public;
grant execute on function public.verify_payment_auto(uuid, text) to service_role;

-- ── Reject a pending payment (money never entered the books) ────
create or replace function public.reject_payment(
  p_payment_id uuid,
  p_reason text default null
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  p public.payments;
begin
  if coalesce(public.current_role() in ('sadar','khajanchi','auditor'), false) is not true then
    raise exception 'Not allowed to reject payments';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if p.status <> 'pending' then raise exception 'Only a pending payment can be rejected'; end if;

  update public.payments
    set status = 'rejected',
        note = coalesce(p_reason, note)
    where id = p.id;
end $$;

revoke all on function public.reject_payment(uuid, text) from public;
grant execute on function public.reject_payment(uuid, text) to authenticated;

-- ── Reverse a verified payment (contra entry, never a delete) ───
-- Used when a cheque bounces, a UPI transfer is charged back, or the
-- office realises an entry was duplicated. The ledger keeps both
-- entries, so the history stays explainable.
create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  p       public.payments;
  v_alloc record;
  v_role  app_role := public.current_role();
begin
  if coalesce(v_role in ('sadar','auditor'), false) is not true then
    raise exception 'Only the sadar or auditor can reverse a payment';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required to reverse a payment';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if p.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if p.status <> 'verified' then raise exception 'Only a verified payment can be reversed'; end if;

  -- Un-settle the invoices this payment paid for.
  for v_alloc in
    select * from public.payment_allocations where payment_id = p.id
  loop
    update public.invoices
      set paid_paise = greatest(paid_paise - v_alloc.amount_paise, 0)
      where id = v_alloc.invoice_id;
  end loop;

  delete from public.payment_allocations where payment_id = p.id;

  insert into public.ledger_entries
    (tenant_id, entry_date, account, narration, debit_paise, credit_paise,
     ref_type, ref_no, created_by)
  values
    (p.tenant_id, current_date,
     case when p.method = 'cash' then 'Cash' else 'Bank' end,
     'Payment reversed · ' || coalesce(p.receipt_no, left(p.id::text, 8)) || ' · ' || p_reason,
     0, p.amount_paise, 'reversal', p.receipt_no, auth.uid());

  update public.payments
    set status = 'rejected',
        unallocated_paise = 0,
        note = coalesce(note || ' | ', '') || 'Reversed: ' || p_reason
    where id = p.id;
end $$;

revoke all on function public.reverse_payment(uuid, text) from public;
grant execute on function public.reverse_payment(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Financial guards
-- Nothing reaches "verified" / "approved" by a direct table write.
-- ═══════════════════════════════════════════════════════════════

-- Payments: inserts from a browser are always pending and receipt-less.
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
  return new;
end $$;

drop trigger if exists payments_guard_insert on public.payments;
create trigger payments_guard_insert
  before insert on public.payments
  for each row execute function public.guard_payment_insert();

-- Payments: money fields and workflow fields are immutable outside RPCs.
-- Notes and references may still be corrected while pending.
create or replace function public.guard_payment_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.tenant_id     is distinct from old.tenant_id
     or new.member_id  is distinct from old.member_id
     or new.amount_paise is distinct from old.amount_paise
     or new.method     is distinct from old.method
     or new.entered_by is distinct from old.entered_by
     or new.status     is distinct from old.status
     or new.receipt_no is distinct from old.receipt_no
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at
     or new.unallocated_paise is distinct from old.unallocated_paise then
    raise exception 'Use the verification workflow to change a payment';
  end if;

  return new;
end $$;

drop trigger if exists payments_guard_update on public.payments;
create trigger payments_guard_update
  before update on public.payments
  for each row execute function public.guard_payment_update();

-- Invoices: paid_paise only moves through a verified payment.
create or replace function public.guard_invoice_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.paid_paise is distinct from old.paid_paise then
    raise exception 'Invoice dues can only be settled by a verified payment';
  end if;

  if new.amount_paise is distinct from old.amount_paise
     or new.member_id is distinct from old.member_id
     or new.period is distinct from old.period
     or new.tenant_id is distinct from old.tenant_id then
    raise exception 'Invoice identity cannot be edited';
  end if;

  if new.status is distinct from old.status then
    if coalesce(new.status = 'waived'
                and public.current_role() in ('sadar','secretary')
                and new.waived_reason is not null
                and new.waived_by is not distinct from auth.uid(), false) is not true then
      raise exception 'Only a waiver can change invoice status directly';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists invoices_guard_update on public.invoices;
create trigger invoices_guard_update
  before update on public.invoices
  for each row execute function public.guard_invoice_update();

-- Expenses: a browser can only create a pending bill.
create or replace function public.guard_expense_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.status      := 'pending';
    new.approved_by := null;
    new.approved_at := null;
    new.entered_by  := coalesce(new.entered_by, auth.uid());
  end if;
  return new;
end $$;

drop trigger if exists expenses_guard_insert on public.expenses;
create trigger expenses_guard_insert
  before insert on public.expenses
  for each row execute function public.guard_expense_insert();

-- While a bill is still pending its maker may fix a typo. Once it
-- has been approved, nothing about the money may change.
create or replace function public.guard_expense_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.status      is distinct from old.status
     or new.approved_by is distinct from old.approved_by
     or new.approved_at is distinct from old.approved_at
     or new.entered_by  is distinct from old.entered_by then
    raise exception 'Use the approval workflow to change an expense';
  end if;

  if old.status <> 'pending'
     and (new.amount_paise is distinct from old.amount_paise
          or new.fund_id is distinct from old.fund_id) then
    raise exception 'An approved expense can no longer be edited';
  end if;

  return new;
end $$;

drop trigger if exists expenses_guard_update on public.expenses;
create trigger expenses_guard_update
  before update on public.expenses
  for each row execute function public.guard_expense_update();

-- Funds: balances only move through approved expenses.
create or replace function public.guard_fund_update()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context()
     and new.balance_paise is distinct from old.balance_paise then
    raise exception 'Fund balances only change through approved expenses';
  end if;
  return new;
end $$;

drop trigger if exists funds_guard_update on public.funds;
create trigger funds_guard_update
  before update on public.funds
  for each row execute function public.guard_fund_update();

-- Ledger and receipt sequences are written by RPCs only. Direct
-- writes from anon/authenticated are revoked, so a compromised
-- office-bearer token still cannot forge a receipt.
revoke insert, update, delete on public.ledger_entries from anon, authenticated;
revoke insert, update, delete on public.ledger_seals from anon, authenticated;
revoke insert, update, delete on public.receipt_sequences from anon, authenticated;
revoke insert, update, delete on public.payment_allocations from anon, authenticated;

-- Sealing must work even when the writing role is not the table
-- owner. (Re-created here so the revoked grants above do not break
-- the definer context.)
create or replace function public.ledger_append()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_prev text;
begin
  perform pg_advisory_xact_lock(hashtext('ledger:' || new.tenant_id::text));

  select hash into v_prev
  from public.ledger_entries
  where tenant_id = new.tenant_id
  order by seq desc
  limit 1;

  new.prev_hash := coalesce(v_prev, '0x' || repeat('0', 64));
  new.hash := public.ledger_hash(
    new.tenant_id, new.prev_hash, new.entry_date, new.account,
    new.narration, new.debit_paise, new.credit_paise,
    new.ref_type, new.ref_no
  );
  return new;
end $$;

create or replace function public.ledger_seal()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.ledger_seals (tenant_id, head_hash, entry_count, sealed_at)
  values (new.tenant_id, new.hash, 1, now())
  on conflict (tenant_id) do update
    set head_hash = excluded.head_hash,
        entry_count = public.ledger_seals.entry_count + 1,
        sealed_at = now();
  return new;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- Write policies by role
--
-- 0002 granted INSERT/UPDATE on every tenant table to every tenant
-- user, including plain members. That is fine for reading a
-- community notice board, but not for money. These policies replace
-- the blanket ones with an explicit role list.
-- ═══════════════════════════════════════════════════════════════

-- Tables that must never be written from a browser at all.
do $$
declare
  t text;
  tables text[] := array[
    'receipt_sequences','payment_allocations','ledger_entries','ledger_seals'
  ];
begin
  foreach t in array tables loop
    execute format('drop policy if exists %I_tenant_insert on public.%I', t, t);
    execute format('drop policy if exists %I_tenant_update on public.%I', t, t);
  end loop;
end $$;

-- ── Read policies: a member sees their own dues, not the village's ─
drop policy if exists invoices_tenant_read on public.invoices;
create policy invoices_tenant_read on public.invoices
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role()::text in ('sadar','khajanchi','secretary','auditor','collector'))
    or member_id in (
      select m.id from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
    )
  );

drop policy if exists payments_tenant_read on public.payments;
create policy payments_tenant_read on public.payments
  for select using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role()::text in ('sadar','khajanchi','secretary','auditor','collector'))
    or member_id in (
      select m.id from public.members m
      join public.profiles p on p.member_id = m.id
      where p.id = auth.uid()
    )
  );

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('members',       array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('fee_plans',     array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('fee_overrides', array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('invoices',      array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('payments',      array['sadar','secretary','khajanchi','collector'],
                        array[]::text[],                               false),
      ('funds',         array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('expenses',      array['sadar','secretary','khajanchi','auditor'],
                        array['sadar','secretary','khajanchi','auditor'], true),
      ('approvals',     array['sadar','secretary','khajanchi'],
                        array['sadar','secretary','khajanchi'],        true),
      ('complaints',    array['sadar','secretary','khajanchi','auditor','collector','member'],
                        array['sadar','secretary','khajanchi','auditor'], true),
      ('notices',       array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('prayer_days',   array['sadar','secretary'],
                        array['sadar','secretary'],                    true),
      ('integrations',  array['sadar','secretary'],
                        array['sadar','secretary'],                    true)
    ) as t(tbl, ins_roles, upd_roles, has_update)
  loop
    execute format('drop policy if exists %I_tenant_insert on public.%I', r.tbl, r.tbl);
    execute format(
      'create policy %I_tenant_insert on public.%I for insert
         with check (
           public.is_super_admin()
           or (tenant_id = public.current_tenant_id()
               and public.current_role()::text = any (%L::text[]))
         )',
      r.tbl, r.tbl, r.ins_roles
    );

    if r.has_update then
      execute format('drop policy if exists %I_tenant_update on public.%I', r.tbl, r.tbl);
      execute format(
        'create policy %I_tenant_update on public.%I for update
           using (
             public.is_super_admin()
             or (tenant_id = public.current_tenant_id()
                 and public.current_role()::text = any (%L::text[]))
           )
           with check (
             public.is_super_admin()
             or (tenant_id = public.current_tenant_id()
                 and public.current_role()::text = any (%L::text[]))
           )',
        r.tbl, r.tbl, r.upd_roles, r.upd_roles
      );
    end if;
  end loop;
end $$;

-- ── Column-level guards ─────────────────────────────────────────

-- A member may not give themselves a discount, change their type or
-- reactivate themselves. Only office bearers and the server can.
create or replace function public.guard_member_write()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.tenant_id   is distinct from old.tenant_id
     or new.code     is distinct from old.code
     or new.serial_no is distinct from old.serial_no
     or new.fee_paise is distinct from old.fee_paise
     or new.member_type is distinct from old.member_type
     or new.status   is distinct from old.status
     or new.joined_on is distinct from old.joined_on then
    raise exception 'Only the office can change membership or fee details';
  end if;

  return new;
end $$;

drop trigger if exists members_guard_write on public.members;
create trigger members_guard_write
  before update on public.members
  for each row execute function public.guard_member_write();

-- A browser-created invoice always starts unpaid and unwaived.
create or replace function public.guard_invoice_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.paid_paise    := 0;
    new.status        := 'pending';
    new.waived_reason := null;
    new.waived_by     := null;
  end if;
  return new;
end $$;

drop trigger if exists invoices_guard_insert on public.invoices;
create trigger invoices_guard_insert
  before insert on public.invoices
  for each row execute function public.guard_invoice_insert();

-- A new fund starts at zero. Opening balances are a server-side,
-- audited adjustment, never a number typed into a web form.
create or replace function public.guard_fund_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.balance_paise := 0;
  end if;
  return new;
end $$;

drop trigger if exists funds_guard_insert on public.funds;
create trigger funds_guard_insert
  before insert on public.funds
  for each row execute function public.guard_fund_insert();

-- Approvals are created pending; only a server-side decision RPC may
-- set them to approved/rejected.
create or replace function public.guard_approval_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.status      := 'pending';
    new.decided_by  := null;
    new.decided_at  := null;
    new.decision_note := null;
    new.step        := 1;
  end if;
  return new;
end $$;

drop trigger if exists approvals_guard_insert on public.approvals;
create trigger approvals_guard_insert
  before insert on public.approvals
  for each row execute function public.guard_approval_insert();

-- Fee overrides need a second pair of eyes: a client insert is always
-- pending, and an approved override is locked.
create or replace function public.guard_fee_override_insert()
returns trigger
language plpgsql
as $$
begin
  if not public.is_trusted_context() then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  return new;
end $$;

drop trigger if exists fee_overrides_guard_insert on public.fee_overrides;
create trigger fee_overrides_guard_insert
  before insert on public.fee_overrides
  for each row execute function public.guard_fee_override_insert();

create or replace function public.guard_fee_override_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if old.approved_by is not null then
    raise exception 'An approved fee override is locked';
  end if;

  new.approved_by := null;
  new.approved_at := null;
  return new;
end $$;

drop trigger if exists fee_overrides_guard_update on public.fee_overrides;
create trigger fee_overrides_guard_update
  before update on public.fee_overrides
  for each row execute function public.guard_fee_override_update();

-- A tenant administrator may edit their masjid's address, logo and
-- UPI handle — never their own subscription plan or expiry date.
create or replace function public.guard_tenant_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.code              is distinct from old.code
     or new.status          is distinct from old.status
     or new.plan_type       is distinct from old.plan_type
     or new.plan_amount_paise is distinct from old.plan_amount_paise
     or new.plan_cycle      is distinct from old.plan_cycle
     or new.expires_at      is distinct from old.expires_at
     or new.grace_days      is distinct from old.grace_days
     or new.member_limit    is distinct from old.member_limit
     or new.features        is distinct from old.features then
    raise exception 'Subscription settings can only be changed by the platform admin';
  end if;

  return new;
end $$;

drop trigger if exists tenants_guard_update on public.tenants;
create trigger tenants_guard_update
  before update on public.tenants
  for each row execute function public.guard_tenant_update();

-- An integration's identity (what it is, whose it is) is fixed at
-- creation. Only the keys and the enabled flag live in the panel.
create or replace function public.guard_integration_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.scope     is distinct from old.scope
     or new.tenant_id is distinct from old.tenant_id
     or new.type    is distinct from old.type
     or new.provider is distinct from old.provider then
    raise exception 'Create a new integration instead of changing its type';
  end if;

  return new;
end $$;

drop trigger if exists integrations_guard_update on public.integrations;
create trigger integrations_guard_update
  before update on public.integrations
  for each row execute function public.guard_integration_update();

-- ── RPC · approve_fee_override ──────────────────────────────────
create or replace function public.approve_fee_override(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  o public.fee_overrides;
begin
  if coalesce(public.current_role() in ('sadar','secretary') or public.is_super_admin(), false) is not true then
    raise exception 'Only the sadar or secretary can approve a fee override';
  end if;

  select * into o from public.fee_overrides where id = p_id for update;
  if not found then raise exception 'Fee override not found'; end if;
  if o.tenant_id is distinct from public.current_tenant_id() then raise exception 'Wrong tenant'; end if;
  if o.approved_by is not null then raise exception 'Already approved'; end if;

  update public.fee_overrides
    set approved_by = auth.uid(), approved_at = now()
    where id = o.id;
end $$;

revoke all on function public.approve_fee_override(uuid) from public;
grant execute on function public.approve_fee_override(uuid) to authenticated;

-- ── RPC · save_integration_secret ───────────────────────────────
-- The only way a key entered in the panel reaches the server-only
-- table. Nothing is ever returned to the browser.
create or replace function public.save_integration_secret(
  p_integration_id uuid,
  p_secret jsonb
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  i public.integrations;
begin
  select * into i from public.integrations where id = p_integration_id;
  if not found then raise exception 'Integration not found'; end if;

  if i.scope = 'platform' then
    if public.is_super_admin() is not true then
      raise exception 'Only the platform admin can edit platform keys';
    end if;
  elsif coalesce(public.is_super_admin()
                 or (i.tenant_id = public.current_tenant_id()
                     and public.current_role() in ('sadar','secretary')), false) is not true then
    raise exception 'Not allowed to edit this integration';
  end if;

  insert into public.integration_secrets (integration_id, tenant_id, secret, updated_at)
  values (i.id, i.tenant_id, coalesce(p_secret, '{}'::jsonb), now())
  on conflict (integration_id) do update
    set secret = excluded.secret,
        updated_at = now();

  update public.integrations
    set status = 'untested',
        last_tested_at = null
    where id = i.id;
end $$;

revoke all on function public.save_integration_secret(uuid, jsonb) from public;
grant execute on function public.save_integration_secret(uuid, jsonb) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- Queue worker primitives (service_role only)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.claim_notifications(p_limit int default 25)
returns setof public.notification_queue
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_service_role() is not true then
    raise exception 'Only the queue worker can claim notifications';
  end if;

  return query
  with picked as (
    select id from public.notification_queue
    where status = 'queued'
      and scheduled_at <= now()
    order by priority asc, scheduled_at asc
    limit greatest(1, least(coalesce(p_limit, 25), 200))
    for update skip locked
  )
  update public.notification_queue q
    set status = 'sending',
        locked_at = now(),
        attempts = q.attempts + 1
    from picked
    where q.id = picked.id
    returning q.*;
end $$;

revoke all on function public.claim_notifications(int) from public;
grant execute on function public.claim_notifications(int) to service_role;

create or replace function public.requeue_notifications()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
  v_part  int := 0;
begin
  if public.is_service_role() is not true then
    raise exception 'Only the queue worker can requeue notifications';
  end if;

  -- Exponential backoff: 10, 20, 40 minutes (capped at 60).
  update public.notification_queue
    set status = 'queued',
        scheduled_at = now()
          + make_interval(mins => least(60, 10 * power(2, greatest(attempts - 1, 0)))::int),
        error = null
    where status = 'failed'
      and attempts < max_attempts;
  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  -- A worker that died mid-send should not strand a message.
  update public.notification_queue
    set status = 'queued',
        scheduled_at = now()
    where status = 'sending'
      and locked_at < now() - interval '10 minutes'
      and attempts < max_attempts;
  get diagnostics v_part = row_count;
  v_count := v_count + v_part;

  return v_count;
end $$;

revoke all on function public.requeue_notifications() from public;
grant execute on function public.requeue_notifications() to service_role;

-- ── Cancel a queued message from the panel ──────────────────────
create or replace function public.cancel_notification(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  n public.notification_queue;
begin
  select * into n from public.notification_queue where id = p_id for update;
  if not found then raise exception 'Notification not found'; end if;

  if coalesce(public.is_super_admin()
              or (n.tenant_id = public.current_tenant_id()
                  and public.current_role() in ('sadar','secretary','khajanchi')), false) is not true then
    raise exception 'Not allowed to cancel this notification';
  end if;

  if n.status is null or n.status not in ('queued','failed') then
    raise exception 'A message that is % cannot be cancelled', coalesce(n.status, 'unknown');
  end if;

  update public.notification_queue set status = 'cancelled' where id = n.id;
end $$;

revoke all on function public.cancel_notification(uuid) from public;
grant execute on function public.cancel_notification(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════
-- RPC · dashboard_snapshot
-- The home screen asks one question: "what needs me today?"
-- ═══════════════════════════════════════════════════════════════
create or replace function public.dashboard_snapshot(p_tenant uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant      uuid := coalesce(p_tenant, public.current_tenant_id());
  v_month       text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  v_collected   bigint := 0;
  v_outstanding bigint := 0;
  v_pending_pay int := 0;
  v_pending_exp int := 0;
  v_high        int := 0;
  v_unallocated bigint := 0;
  v_broken      bigint;
begin
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;

  if coalesce(public.is_service_role()
              or public.is_super_admin()
              or (public.current_tenant_id() = v_tenant and public.is_office_bearer()), false) is not true then
    raise exception 'Not allowed to read this dashboard';
  end if;

  select coalesce(sum(amount_paise), 0) into v_collected
  from public.payments
  where tenant_id = v_tenant
    and status = 'verified'
    and to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = v_month;

  select coalesce(sum(amount_paise - paid_paise), 0) into v_outstanding
  from public.invoices
  where tenant_id = v_tenant and status in ('pending','partial');

  select count(*) into v_pending_pay
  from public.payments where tenant_id = v_tenant and status = 'pending';

  select count(*) into v_pending_exp
  from public.expenses where tenant_id = v_tenant and status = 'pending';

  select count(*) into v_high
  from public.complaints
  where tenant_id = v_tenant
    and priority = 'high'
    and status not in ('resolved','closed');

  select coalesce(sum(unallocated_paise), 0) into v_unallocated
  from public.payments
  where tenant_id = v_tenant and unallocated_paise > 0;

  v_broken := public.verify_ledger(v_tenant);

  return jsonb_build_object(
    'tenant_id', v_tenant,
    'period', v_month,
    'collected_paise', v_collected,
    'outstanding_paise', v_outstanding,
    'pending_payments', v_pending_pay,
    'pending_expenses', v_pending_exp,
    'high_priority_complaints', v_high,
    'unallocated_paise', v_unallocated,
    'ledger_ok', v_broken is null,
    'ledger_broken_at_seq', v_broken,
    'generated_at', now()
  );
end $$;

revoke all on function public.dashboard_snapshot(uuid) from public;
grant execute on function public.dashboard_snapshot(uuid) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════
-- RPC · expire_tenants (subscription lifecycle)
-- ═══════════════════════════════════════════════════════════════
create or replace function public.expire_tenants()
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
begin
  if public.is_service_role() is not true then
    raise exception 'Only the scheduler can expire tenants';
  end if;

  update public.tenants
    set status = 'read_only'
    where status in ('active','trial')
      and expires_at is not null
      and expires_at + make_interval(days => grace_days) < current_date;
  get diagnostics v_count = row_count;

  return v_count;
end $$;

revoke all on function public.expire_tenants() from public;
grant execute on function public.expire_tenants() to service_role;

-- ═══════════════════════════════════════════════════════════════
-- Seed: the demo tenant gets sensible automation settings.
-- ═══════════════════════════════════════════════════════════════
insert into public.tenant_settings
  (tenant_id, invoice_due_day, reminder_days, receipt_footer)
select id, 10, '{3,7,10,15}',
       'Jazak Allah khair. This is a computer-generated receipt.'
from public.tenants
on conflict (tenant_id) do nothing;
