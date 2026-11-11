-- ═══════════════════════════════════════════════════════════════
-- 0018 · Daily maintenance + keepalive (pg_cron)
--
-- Why this exists:
--   · Supabase Free pauses a project after ~7 days with no activity.
--     A daily pg_cron job writes to job_runs, which keeps it awake.
--   · The nightly Edge Function may not be deployed yet. These jobs
--     run the same automation directly in SQL, so chanda invoices,
--     reminders, overdue notices, expiry and queue retries all work
--     with zero external services.
--
-- Everything here is idempotent and safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── Daily maintenance ───────────────────────────────────────────
create or replace function public.run_daily_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period   text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  v_tenant   record;
  v_inv      jsonb;
  v_rem      jsonb;
  v_ledger   boolean;
  v_results  jsonb := '[]'::jsonb;
  v_job      uuid;
  v_notes    int := 0;
  v_expired  int := 0;
  v_requeued int := 0;
begin
  -- Act as a trusted scheduler for the duration of this transaction.
  -- Only this SECURITY DEFINER function can set it; the execute grant
  -- is limited to service_role, and pg_cron runs as the owner.
  perform set_config('request.jwt.claim.role', 'service_role', true);

  insert into public.job_runs (job, status, stats)
  values ('daily-maintenance', 'running', jsonb_build_object('period', v_period))
  returning id into v_job;

  for v_tenant in
    select id, code from public.tenants where status in ('active', 'trial')
  loop
    begin
      v_inv := public.generate_monthly_invoices(v_tenant.id, v_period);
    exception when others then
      v_inv := jsonb_build_object('error', sqlerrm);
    end;

    begin
      v_rem := public.queue_reminders(v_tenant.id, v_period, false);
    exception when others then
      v_rem := jsonb_build_object('error', sqlerrm);
    end;

    begin
      v_ledger := public.verify_ledger(v_tenant.id);
    exception when others then
      v_ledger := null;
    end;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'tenant', v_tenant.code,
      'invoices', v_inv,
      'reminders', v_rem,
      'ledger_ok', v_ledger
    ));
  end loop;

  begin
    v_notes := public.publish_due_notices();
  exception when others then
    v_notes := -1;
  end;

  begin
    v_expired := public.expire_tenants();
  exception when others then
    v_expired := -1;
  end;

  begin
    v_requeued := public.requeue_notifications();
  exception when others then
    v_requeued := -1;
  end;

  update public.job_runs
     set status      = 'success',
         finished_at = now(),
         stats       = jsonb_build_object(
           'period', v_period,
           'notices_published', v_notes,
           'expired_tenants', v_expired,
           'requeued_messages', v_requeued,
           'tenants', v_results
         )
   where id = v_job;

  return jsonb_build_object(
    'period', v_period,
    'notices_published', v_notes,
    'expired_tenants', v_expired,
    'requeued_messages', v_requeued,
    'tenants', v_results
  );
exception when others then
  if v_job is not null then
    update public.job_runs
       set status = 'failed', finished_at = now(), error = sqlerrm
     where id = v_job;
  end if;
  raise;
end $$;

revoke all on function public.run_daily_maintenance() from public, anon, authenticated;
grant execute on function public.run_daily_maintenance() to service_role;

-- ── Lightweight keepalive ───────────────────────────────────────
-- Touches the database so a Free-plan project never goes idle.
create or replace function public.keepalive()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ts timestamptz := now();
begin
  insert into public.job_runs (job, status, started_at, finished_at, stats)
  values ('keepalive', 'success', v_ts, v_ts, jsonb_build_object('source', 'pg_cron'));
  return v_ts;
end $$;

revoke all on function public.keepalive() from public, anon, authenticated;
grant execute on function public.keepalive() to service_role;

-- ── Notification retry worker ───────────────────────────────────
-- Same guard problem: requeue_notifications() needs a service claim.
create or replace function public.run_requeue()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);
  v_count := public.requeue_notifications();
  return v_count;
end $$;

revoke all on function public.run_requeue() from public, anon, authenticated;
grant execute on function public.run_requeue() to service_role;

-- ── Schedules (idempotent) ──────────────────────────────────────
do $$ begin perform cron.unschedule('anjuman-daily-maintenance'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('anjuman-keepalive');         exception when others then null; end $$;
do $$ begin perform cron.unschedule('anjuman-requeue');           exception when others then null; end $$;

-- 20:30 UTC = 02:00 IST — invoices, reminders, notices, expiry, ledger check
select cron.schedule(
  'anjuman-daily-maintenance',
  '30 20 * * *',
  'select public.run_daily_maintenance();'
);

-- Every 6 hours — guarantees the project never looks idle to Supabase
select cron.schedule(
  'anjuman-keepalive',
  '0 */6 * * *',
  'select public.keepalive();'
);

-- Every 15 minutes — puts failed messages back in the queue
select cron.schedule(
  'anjuman-requeue',
  '*/15 * * * *',
  'select public.run_requeue();'
);
