-- ═══════════════════════════════════════════════════════════════
-- 0037 · Scoped payment settings write
--
-- The Payments page is used by sadar, secretary AND khajanchi, but
-- `tenants_self_update` only lets sadar/secretary write the tenant
-- row. Khajanchi changes would silently fail.
--
-- This RPC writes only the payment / bank columns, so the khajanchi
-- can do their job without being able to rename the anjuman or
-- change subscription fields.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.save_payment_settings(
  p_upi_id          text,
  p_upi_qr_url      text,
  p_upi_enabled     boolean,
  p_auto_verify_upi boolean,
  p_bank_name       text,
  p_bank_account_name text,
  p_bank_account_no text,
  p_bank_ifsc       text,
  p_bank_branch     text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
  v_role   app_role := public.current_role();
begin
  if v_tenant is null then
    raise exception 'No tenant for this session';
  end if;
  if coalesce(v_role in ('sadar','secretary','khajanchi'), false) is not true then
    raise exception 'Not allowed to change payment settings';
  end if;

  update public.tenants
     set upi_id          = nullif(btrim(coalesce(p_upi_id, '')), ''),
         upi_qr_url      = nullif(btrim(coalesce(p_upi_qr_url, '')), ''),
         upi_enabled     = coalesce(p_upi_enabled, false),
         auto_verify_upi = coalesce(p_auto_verify_upi, false),
         bank_name       = nullif(btrim(coalesce(p_bank_name, '')), ''),
         bank_account_name = nullif(btrim(coalesce(p_bank_account_name, '')), ''),
         bank_account_no = nullif(btrim(coalesce(p_bank_account_no, '')), ''),
         bank_ifsc       = nullif(upper(btrim(coalesce(p_bank_ifsc, ''))), ''),
         bank_branch     = nullif(btrim(coalesce(p_bank_branch, '')), '')
   where id = v_tenant;
end $$;

revoke all on function public.save_payment_settings(
  text, text, boolean, boolean, text, text, text, text, text
) from public, anon;
grant execute on function public.save_payment_settings(
  text, text, boolean, boolean, text, text, text, text, text
) to authenticated, service_role;
