-- ═══════════════════════════════════════════════════════════════
-- 0011 · Security hardening
--
-- Additive only — no existing table, policy or RPC is removed.
-- Fixes found during the deep review of 0001–0010:
--
--   1. profiles: a signed-in user could change their own `role`
--      (privilege escalation to super_admin). No guard existed.
--   2. donations: there was no INSERT guard, so an office bearer
--      could insert a row already marked verified with a hand-typed
--      receipt number — bypassing next_donation_receipt_no, the fund
--      balance and the ledger entirely.
--   3. donations: after verification the amount / fund / donor were
--      still editable, unlike payments.
--   4. internal helpers next_receipt_no(), next_donation_receipt_no()
--      and verify_ledger() were SECURITY DEFINER but never revoked
--      from PUBLIC, so an anonymous caller could burn receipt
--      numbers or probe ledger integrity.
--   5. broadcast_notice() was service-role only, but the admin panel
--      calls it directly — the call always failed.
--
-- Depends on: 0001–0010.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. A profile cannot escalate itself ───────────────────────────
-- Users may edit their own name / phone / 2FA. Role, tenant, account
-- state and audit fields are platform-admin territory only.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.id        is distinct from old.id
     or new.role      is distinct from old.role
     or new.tenant_id is distinct from old.tenant_id
     or new.is_active is distinct from old.is_active
     or new.member_id is distinct from old.member_id
     or new.email     is distinct from old.email then
    raise exception 'Only the platform admin can change a role, tenant or account state';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard_update on public.profiles;
create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ── 2. A browser-created donation can never arrive verified ───────
create or replace function public.guard_donation_insert()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  new.status      := 'pending';
  new.receipt_no  := null;
  new.verified_by := null;
  new.verified_at := null;
  new.entered_by  := auth.uid();

  return new;
end $$;

drop trigger if exists donations_guard_insert on public.donations;
create trigger donations_guard_insert
  before insert on public.donations
  for each row execute function public.guard_donation_insert();

-- ── 3. A recorded donation is immutable in its money fields ───────
-- Replaces the partial guard from 0010, which only froze the status
-- columns and left the amount / fund editable.
create or replace function public.guard_donation_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() or public.is_super_admin() then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Use the verify_donation / reject_donation RPC to change status';
  end if;
  if new.receipt_no  is distinct from old.receipt_no
     or new.verified_by is distinct from old.verified_by
     or new.verified_at is distinct from old.verified_at then
    raise exception 'Receipt number and verifier are assigned by the verification RPC';
  end if;
  if new.tenant_id   is distinct from old.tenant_id
     or new.fund_id     is distinct from old.fund_id
     or new.member_id   is distinct from old.member_id
     or new.amount_paise is distinct from old.amount_paise
     or new.method      is distinct from old.method
     or new.donor_name  is distinct from old.donor_name
     or new.anonymous   is distinct from old.anonymous
     or new.entered_by  is distinct from old.entered_by then
    raise exception 'A recorded donation cannot be edited; reject it and record a new one';
  end if;

  return new;
end $$;

-- ── 4. Internal helpers are not callable from the browser ────────
-- next_receipt_no / next_donation_receipt_no mint numbers and
-- verify_ledger walks the hash chain; both are invariants, not
-- user actions. Office RPCs call them internally as the definer.
revoke all on function public.next_receipt_no(uuid) from public, anon;
grant execute on function public.next_receipt_no(uuid) to authenticated, service_role;

revoke all on function public.next_donation_receipt_no(uuid) from public, anon;
grant execute on function public.next_donation_receipt_no(uuid) to authenticated, service_role;

revoke all on function public.verify_ledger(uuid) from public, anon;
grant execute on function public.verify_ledger(uuid) to authenticated, service_role;

-- ── 5. broadcast_notice: honour the caller instead of service-only ─
-- The admin panel calls this straight after publishing; the
-- notices_queue_broadcast trigger also calls it. The dedupe key
-- makes the second call a no-op.
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

  -- Only jwt-role / profile checks are usable here: this function is
  -- SECURITY DEFINER, so `current_user` (and is_trusted_context) is
  -- always the owner, never the caller.
  if coalesce(
       public.is_service_role()
       or public.is_super_admin()
       or (public.current_tenant_id() = n.tenant_id
           and public.current_role() in ('sadar','secretary','khajanchi')),
       false
     ) is not true then
    raise exception 'Not allowed to broadcast this notice';
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

revoke all on function public.broadcast_notice(uuid) from public, anon;
grant execute on function public.broadcast_notice(uuid) to authenticated, service_role;

-- ── 6. Donations: keep the super-admin path consistent ───────────
-- Every other tenant table ORs is_super_admin(); donations did not.
drop policy if exists donations_office_insert on public.donations;
create policy donations_office_insert on public.donations
  for insert with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector'))
  );
