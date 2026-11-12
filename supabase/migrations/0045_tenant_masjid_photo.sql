-- ═══════════════════════════════════════════════════════════════
-- 0045 · Add masjid photo URL to tenants
-- ═══════════════════════════════════════════════════════════════

alter table public.tenants
add column if not exists masjid_photo_url text;

comment on column public.tenants.masjid_photo_url
is 'Optional masjid photo for branding on member app / home screen';