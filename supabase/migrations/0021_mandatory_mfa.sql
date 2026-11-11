-- ═══════════════════════════════════════════════════════════════
-- 0021 · Mandatory 2FA for money decisions
--
-- Supabase Auth issues an `aal` claim (aal1 = password only,
-- aal2 = password + TOTP). This migration makes every verification
-- / approval decision require aal2 for office roles. The check runs
-- in the database, so hiding the button in the UI is not enough —
-- a stolen password alone can never verify a payment.
--
-- Maker–checker stays as it is: `entered_by <> verified_by` already
-- blocks a sadar from verifying a payment they recorded themselves.
-- ═══════════════════════════════════════════════════════════════

-- ── Assurance level helpers ─────────────────────────────────────
create or replace function public.jwt_aal()
returns text
language sql
stable
as $$
  select coalesce(
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb) ->> 'aal',
    'aal1'
  );
$$;

create or replace function public.mfa_ok()
returns boolean
language sql
stable
as $$
  -- service_role is only used by trusted server code (webhooks/cron).
  -- SECURITY DEFINER RPCs run as postgres, so they must still pass the
  -- caller's `aal` claim — otherwise every verification would bypass 2FA.
  select current_user = 'service_role' or public.jwt_aal() = 'aal2';
$$;

-- ── Block sensitive status changes without 2FA ──────────────────
create or replace function public.guard_sensitive_mfa()
returns trigger
language plpgsql
as $$
begin
  if public.mfa_ok() then
    return new;
  end if;

  if tg_table_name = 'payments'
     and new.status::text = 'verified'
     and old.status::text is distinct from 'verified' then
    raise exception '2FA required: enable authenticator app before verifying a payment';
  end if;

  if tg_table_name = 'donations'
     and new.status::text = 'verified'
     and old.status::text is distinct from 'verified' then
    raise exception '2FA required: enable authenticator app before verifying a donation';
  end if;

  if tg_table_name = 'expenses'
     and new.status::text = 'approved'
     and old.status::text is distinct from 'approved' then
    raise exception '2FA required: enable authenticator app before approving an expense';
  end if;

  if tg_table_name = 'approvals'
     and new.status::text in ('approved', 'rejected')
     and old.status::text = 'pending' then
    raise exception '2FA required: enable authenticator app before deciding an approval';
  end if;

  if tg_table_name = 'platform_invoices'
     and new.status::text = 'paid'
     and old.status::text is distinct from 'paid' then
    raise exception '2FA required: enable authenticator app before marking a platform invoice paid';
  end if;

  return new;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['payments', 'donations', 'expenses', 'approvals', 'platform_invoices'] loop
    execute format('drop trigger if exists %I_sensitive_mfa on public.%I', t, t);
    execute format(
      'create trigger %I_sensitive_mfa before update of status on public.%I
         for each row execute function public.guard_sensitive_mfa()',
      t, t
    );
  end loop;
end $$;
