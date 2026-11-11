-- ═══════════════════════════════════════════════════════════════
-- Bootstrap the FIRST anjuman + its first Sadar.
-- Run this in Supabase Studio → SQL Editor AFTER:
--   1. supabase/apply-all.sql has run, and
--   2. you created the user in Authentication → Users → Add user
--      (tick "Auto Confirm User").
--
-- EDIT the 8 values in the `declare` block below, then Run.
-- Safe to run more than once.
-- ═══════════════════════════════════════════════════════════════

do $$
declare
  -- ── EDIT THESE ─────────────────────────────────────────────
  v_tenant_code   text := 'BHR';                          -- 2-4 capital letters
  v_tenant_name   text := 'Bharauli Masjid Committee';
  v_village       text := 'Bharauli';
  v_district      text := 'Azamgarh';
  v_state         text := 'Uttar Pradesh';
  v_pincode       text := '276001';
  v_masjid        text := 'Jama Masjid Bharauli';
  v_reg_no        text := 'UP/AZM/2011/0442';
  v_sadar_email   text := 'sadar@example.com';            -- email of the auth user you created

  v_tenant_id uuid;
begin
  -- 1) Anjuman / masjid record
  insert into public.tenants
    (code, name, village, district, state, pincode, masjid, reg_no,
     status, plan_type, plan_amount_paise, plan_cycle, features)
  values
    (v_tenant_code, v_tenant_name, v_village, v_district, v_state, v_pincode,
     v_masjid, v_reg_no, 'trial', 'free', 0, 'yearly',
     '{"payments":true,"whatsapp":true,"idCards":true,"multiMasjid":false,"auditPack":true}'::jsonb)
  on conflict (code) do update
    set name = excluded.name,
        village = excluded.village,
        district = excluded.district,
        state = excluded.state,
        pincode = excluded.pincode,
        masjid = excluded.masjid,
        reg_no = excluded.reg_no
  returning id into v_tenant_id;

  -- `returning` is empty on the update path, so fetch again when needed.
  if v_tenant_id is null then
    select id into v_tenant_id from public.tenants where code = v_tenant_code;
  end if;

  -- 2) Default funds (renamable later from the panel)
  insert into public.funds (tenant_id, code, name, restricted, balance_paise)
  values
    (v_tenant_id, 'GEN', 'General Fund', false, 0),
    (v_tenant_id, 'IMS', 'Imam Salary Fund', true, 0),
    (v_tenant_id, 'MST', 'Masjid Maintenance', true, 0),
    (v_tenant_id, 'JNZ', 'Janaza / Funeral Fund', true, 0)
  on conflict do nothing;

  -- 3) A starting monthly chanda plan (₹500) and the dues generator
  insert into public.fee_plans (tenant_id, name, amount_paise, cycle, due_day)
  select v_tenant_id, 'Standard monthly chanda', 50000, 'monthly', 10
  where not exists (
    select 1 from public.fee_plans where tenant_id = v_tenant_id
  );

  -- 4) Give the first user the Sadar role in this anjuman.
  --    Supabase creates the auth user; we create the panel profile that
  --    links it to this tenant with the Sadar role.
  insert into public.profiles (id, tenant_id, full_name, phone, email, role, is_active)
  select u.id, v_tenant_id, 'Sadar', '', u.email, 'sadar', true
    from auth.users u
   where lower(u.email) = lower(v_sadar_email)
  on conflict (id) do update
    set tenant_id = excluded.tenant_id,
        role = 'sadar',
        is_active = true,
        email = excluded.email;

  if not found then
    raise exception 'No auth user found with email %. Create it in Authentication → Users first.', v_sadar_email;
  end if;

  raise notice 'Anjuman % ready. Sadar % can sign in.', v_tenant_code, v_sadar_email;
end $$;
