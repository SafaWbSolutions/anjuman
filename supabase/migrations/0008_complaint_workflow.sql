-- ═══════════════════════════════════════════════════════════════
-- 0008 · Complaints
--
-- Problems:
--   · tracking_code is NOT NULL but nothing generated it, so every
--     complaint insert failed.
--   · the generic tenant-update policy let any member edit anyone's
--     complaint, including marking it resolved.
--
-- This adds a code generator, a small update guard and an
-- office-bearers-only update policy.
--
-- Depends on: 0001 (complaints), 0002 (RLS), 0004 (current_role).
-- ═══════════════════════════════════════════════════════════════

-- ── Tracking code: CMP-4X2Q9K ───────────────────────────────────
create or replace function public.assign_complaint_code()
returns trigger
language plpgsql
as $$
declare
  v_code text;
  v_try  int := 0;
begin
  if new.tracking_code is not null and btrim(new.tracking_code) <> '' then
    return new;
  end if;

  loop
    v_try := v_try + 1;
    v_code := 'CMP-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 6));

    exit when not exists (
      select 1 from public.complaints
      where tenant_id = new.tenant_id and tracking_code = v_code
    );

    if v_try > 10 then
      raise exception 'Could not allocate a complaint tracking code';
    end if;
  end loop;

  new.tracking_code := v_code;
  return new;
end $$;

drop trigger if exists complaints_assign_code on public.complaints;
create trigger complaints_assign_code
  before insert on public.complaints
  for each row execute function public.assign_complaint_code();

-- ── Update guard ────────────────────────────────────────────────
-- Identity of a complaint never changes. Resolution time follows
-- the status, so reports can trust it.
create or replace function public.guard_complaint_update()
returns trigger
language plpgsql
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;

  if new.tenant_id     is distinct from old.tenant_id
     or new.tracking_code is distinct from old.tracking_code
     or new.created_at  is distinct from old.created_at
     or new.member_id   is distinct from old.member_id
     or new.anonymous   is distinct from old.anonymous
     or new.subject     is distinct from old.subject
     or new.body        is distinct from old.body then
    raise exception 'A complaint can only change its status, priority or owner';
  end if;

  if new.status in ('resolved','closed') and new.resolved_at is null then
    new.resolved_at := now();
  elsif new.status not in ('resolved','closed') then
    new.resolved_at := null;
  end if;

  return new;
end $$;

drop trigger if exists complaints_guard_update on public.complaints;
create trigger complaints_guard_update
  before update on public.complaints
  for each row execute function public.guard_complaint_update();

-- ── Only office bearers may triage ──────────────────────────────
-- Replaces the generic tenant update policy created in 0002.
drop policy if exists complaints_tenant_update on public.complaints;
drop policy if exists complaints_office_update on public.complaints;
create policy complaints_office_update on public.complaints
  for update using (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector'))
  )
  with check (
    public.is_super_admin()
    or (tenant_id = public.current_tenant_id()
        and public.current_role() in ('sadar','secretary','khajanchi','auditor','collector'))
  );
