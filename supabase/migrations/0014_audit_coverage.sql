-- ═══════════════════════════════════════════════════════════════
-- 0014 · Audit coverage for donations, members, tenants
--
-- Adds audit_log triggers so every change to these core tables
-- is recorded with actor, action, and before/after state.
-- ═══════════════════════════════════════════════════════════════

-- Donations audit
drop trigger if exists audit_donations on public.donations;
create trigger audit_donations after insert or update or delete on public.donations
  for each row execute function public.audit_row();

-- Members audit
drop trigger if exists audit_members on public.members;
create trigger audit_members after insert or update or delete on public.members
  for each row execute function public.audit_row();

-- Tenants audit
drop trigger if exists audit_tenants on public.tenants;
create trigger audit_tenants after insert or update on public.tenants
  for each row execute function public.audit_row();
