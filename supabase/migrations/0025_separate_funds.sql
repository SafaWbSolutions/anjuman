-- ═══════════════════════════════════════════════════════════════
-- 0025 · Separate Zakat / Sadqa / Gift funds
-- Donations were landing in General Fund because no dedicated fund
-- existed, so the three categories could not be tracked apart.
-- ═══════════════════════════════════════════════════════════════

insert into public.funds (tenant_id, code, name, restricted)
select t.id, v.code, v.name, v.restricted
from public.tenants t
cross join (
  values
    ('ZAKAT', 'Zakat Fund', true),
    ('SADQA', 'Sadqa Fund', true),
    ('GIFT',  'Gift / Donation Fund', false)
) as v(code, name, restricted)
on conflict (tenant_id, code) do nothing;
