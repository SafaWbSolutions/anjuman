-- ═══════════════════════════════════════════════════════════════
-- 0022 · Email-based login verification replaces hard TOTP gate
--
-- Office users found authenticator apps too heavy, so new-device
-- verification is done by email OTP in the panel. The previous
-- aal2 requirement is removed so a normal password + email step
-- can still verify money entries.
--
-- Maker–checker is untouched and still enforced in the database:
-- the person who entered a payment can never verify it.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  t text;
begin
  foreach t in array array['payments', 'donations', 'expenses', 'approvals', 'platform_invoices'] loop
    execute format('drop trigger if exists %I_sensitive_mfa on public.%I', t, t);
  end loop;
end $$;
