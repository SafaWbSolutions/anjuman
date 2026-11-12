-- ═══════════════════════════════════════════════════════════════
-- 0046 · Tenant branding bucket (logos, masjid photos)
-- ═══════════════════════════════════════════════════════════════

-- Create a dedicated bucket for tenant branding assets
insert into storage.buckets (id, name, public)
values ('tenant-branding', 'tenant-branding', true)
on conflict (id) do update set public = true;

-- Public read access for all branding assets
drop policy if exists tenant_branding_public_read on storage.objects;
create policy tenant_branding_public_read on storage.objects
  for select using (bucket_id = 'tenant-branding');

-- Only office bearers of the tenant can upload/update/delete their branding
-- Path format: <tenant-id>/logo.png or <tenant-id>/masjid-photo.jpg
drop policy if exists tenant_branding_office_insert on storage.objects;
create policy tenant_branding_office_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'tenant-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('sadar', 'khajanchi', 'secretary', 'super_admin')
        and p.tenant_id = (storage.foldername(name))[1]::uuid
    )
  );

drop policy if exists tenant_branding_office_update on storage.objects;
create policy tenant_branding_office_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'tenant-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('sadar', 'khajanchi', 'secretary', 'super_admin')
        and p.tenant_id = (storage.foldername(name))[1]::uuid
    )
  )
  with check (
    bucket_id = 'tenant-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('sadar', 'khajanchi', 'secretary', 'super_admin')
        and p.tenant_id = (storage.foldername(name))[1]::uuid
    )
  );

drop policy if exists tenant_branding_office_delete on storage.objects;
create policy tenant_branding_office_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'tenant-branding'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('sadar', 'khajanchi', 'secretary', 'super_admin')
        and p.tenant_id = (storage.foldername(name))[1]::uuid
    )
  );

-- Super admin can manage any tenant's branding
drop policy if exists tenant_branding_super_admin_all on storage.objects;
create policy tenant_branding_super_admin_all on storage.objects
  for all to authenticated
  using (
    bucket_id = 'tenant-branding'
    and public.is_super_admin()
  )
  with check (
    bucket_id = 'tenant-branding'
    and public.is_super_admin()
  );