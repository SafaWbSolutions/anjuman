-- ═══════════════════════════════════════════════════════════════
-- 0036 · Payment QR upload, bank details, registration requests
-- ═══════════════════════════════════════════════════════════════

-- ── A. Tenant payment + bank fields ─────────────────────────────
alter table public.tenants
  add column if not exists upi_qr_url        text,
  add column if not exists upi_enabled       boolean not null default false,
  add column if not exists auto_verify_upi   boolean not null default false,
  add column if not exists bank_name         text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_no   text,
  add column if not exists bank_ifsc         text,
  add column if not exists bank_branch       text;

-- ── B. Public registration requests ─────────────────────────────
create table if not exists public.registration_requests (
  id                uuid primary key default gen_random_uuid(),
  anjuman_name      text not null,
  address           text not null,
  district          text,
  state             text,
  pincode           text,
  total_members     int,
  is_registered     boolean not null default false,
  reg_no            text,
  sadar_name        text not null,
  sadar_phone       text not null,
  sadar_email       text,
  sadar_kyc_url     text,
  khajanchi_name    text,
  khajanchi_phone   text,
  khajanchi_email   text,
  khajanchi_kyc_url text,
  proof_url         text,
  contact_email     text,
  note              text,
  status            text not null default 'pending'
                    check (status in ('pending','approved','rejected')),
  decision_note     text,
  decided_by        uuid references public.profiles(id),
  decided_at        timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists registration_requests_status_idx
  on public.registration_requests (status, created_at desc);

alter table public.registration_requests enable row level security;

create or replace function public.submit_registration_request(p_data jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if coalesce(nullif(btrim(p_data ->> 'anjuman_name'), ''), '') = '' then
    raise exception 'Anjuman ka naam likho';
  end if;
  if coalesce(nullif(btrim(p_data ->> 'address'), ''), '') = '' then
    raise exception 'Address likho';
  end if;
  if coalesce(nullif(btrim(p_data ->> 'sadar_name'), ''), '') = '' then
    raise exception 'Sadar ka naam likho';
  end if;
  if coalesce(p_data ->> 'sadar_phone', '') !~ '^[0-9]{10}$' then
    raise exception 'Sadar ka mobile 10 digit hona chahiye';
  end if;

  insert into public.registration_requests
    (anjuman_name, address, district, state, pincode, total_members,
     is_registered, reg_no, sadar_name, sadar_phone, sadar_email,
     sadar_kyc_url, khajanchi_name, khajanchi_phone, khajanchi_email,
     khajanchi_kyc_url, proof_url, contact_email, note)
  values
    (btrim(p_data ->> 'anjuman_name'), btrim(p_data ->> 'address'),
     nullif(btrim(coalesce(p_data ->> 'district', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'state', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'pincode', '')), ''),
     nullif(p_data ->> 'total_members', '')::int,
     coalesce((p_data ->> 'is_registered')::boolean, false),
     nullif(btrim(coalesce(p_data ->> 'reg_no', '')), ''),
     btrim(p_data ->> 'sadar_name'), btrim(p_data ->> 'sadar_phone'),
     nullif(btrim(coalesce(p_data ->> 'sadar_email', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'sadar_kyc_url', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'khajanchi_name', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'khajanchi_phone', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'khajanchi_email', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'khajanchi_kyc_url', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'proof_url', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'contact_email', '')), ''),
     nullif(btrim(coalesce(p_data ->> 'note', '')), ''))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.submit_registration_request(jsonb) from public;
grant execute on function public.submit_registration_request(jsonb) to anon, authenticated, service_role;

create or replace function public.list_registration_requests()
returns setof public.registration_requests
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not allowed';
  end if;
  return query
    select * from public.registration_requests
     order by case status when 'pending' then 0 else 1 end,
              created_at desc
     limit 500;
end $$;

revoke all on function public.list_registration_requests() from public, anon;
grant execute on function public.list_registration_requests() to authenticated, service_role;

create or replace function public.decide_registration_request(
  p_id uuid,
  p_status text,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not allowed';
  end if;
  if p_status not in ('approved','rejected','pending') then
    raise exception 'Invalid status';
  end if;

  update public.registration_requests
     set status = p_status,
         decision_note = p_note,
         decided_by = case when p_status = 'pending' then null else auth.uid() end,
         decided_at = case when p_status = 'pending' then null else now() end
   where id = p_id;
end $$;

revoke all on function public.decide_registration_request(uuid, text, text) from public, anon;
grant execute on function public.decide_registration_request(uuid, text, text)
  to authenticated, service_role;

-- ── C. Private bucket for KYC / proof uploads ──────────────────
insert into storage.buckets (id, name, public)
values ('registration-docs', 'registration-docs', false)
on conflict (id) do nothing;

drop policy if exists registration_docs_insert on storage.objects;
create policy registration_docs_insert on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'registration-docs');

drop policy if exists registration_docs_admin_read on storage.objects;
create policy registration_docs_admin_read on storage.objects
  for select to authenticated
  using (bucket_id = 'registration-docs' and public.is_super_admin());

-- ── D. Public avatars bucket: allow tenant QR uploads ──────────
-- Profile photos are scoped to <user-id>/…; the anjuman's payment
-- QR lives under qr/<tenant-id>/… and is readable by everyone.
drop policy if exists avatars_qr_insert on storage.objects;
create policy avatars_qr_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'qr'
  );

drop policy if exists avatars_qr_update on storage.objects;
create policy avatars_qr_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'qr'
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = 'qr'
  );
