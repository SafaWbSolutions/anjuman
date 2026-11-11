-- ═══════════════════════════════════════════════════════════════
-- 0020 · Self-service profile editing + avatars
--
--  • profiles gains a photo_url (members already had one)
--  • update_my_profile() lets any signed-in user edit their own
--    name / mobile / email / photo. The mobile number is stored as
--    exactly 10 digits. When the profile is linked to a members row
--    the member card is kept in sync.
--  • update_member_details() lets the sadar / secretary / platform
--    admin edit a member's details from the panel.
--  • a public `avatars` storage bucket, scoped per user id.
-- ═══════════════════════════════════════════════════════════════

alter table public.profiles add column if not exists photo_url text;
alter table public.members  add column if not exists email text;

-- ── Helpers ─────────────────────────────────────────────────────
create or replace function public.only_digits(p text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '');
$$;

-- ── Self-service profile update ─────────────────────────────────
create or replace function public.update_my_profile(
  p_full_name text,
  p_phone     text,
  p_email     text,
  p_photo_url text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  digits  text := public.only_digits(p_phone);
  mail    text := nullif(lower(trim(coalesce(p_email, ''))), '');
  prof    public.profiles;
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(trim(p_full_name), '') = '' then
    raise exception 'Name is required';
  end if;
  if digits is not null and length(digits) <> 10 then
    raise exception 'Mobile number must be exactly 10 digits';
  end if;
  if mail is not null and position('@' in mail) < 2 then
    raise exception 'A valid email is required';
  end if;

  update public.profiles
     set full_name = trim(p_full_name),
         phone     = digits,
         email     = mail,
         photo_url = coalesce(nullif(p_photo_url, ''), photo_url)
   where id = uid
   returning * into prof;

  if prof.member_id is not null then
    update public.members
       set name      = prof.full_name,
           phone     = coalesce(prof.phone, phone),
           email     = coalesce(prof.email, email),
           photo_url = coalesce(nullif(p_photo_url, ''), photo_url),
           updated_at = now()
     where id = prof.member_id
       and tenant_id = prof.tenant_id;
  end if;

  return prof;
end $$;

revoke all on function public.update_my_profile(text, text, text, text) from public;
grant execute on function public.update_my_profile(text, text, text, text) to authenticated;

-- ── Office bearers edit a member ────────────────────────────────
create or replace function public.update_member_details(
  p_member_id   uuid,
  p_name        text,
  p_father_name text,
  p_phone       text,
  p_email       text,
  p_household   text,
  p_mohalla     text,
  p_photo_url   text,
  p_blood_group text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  me       public.profiles;
  owner    uuid;
  digits   text := public.only_digits(p_phone);
  mail     text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then
    raise exception 'Not signed in';
  end if;
  if me.role not in ('sadar', 'secretary', 'super_admin') then
    raise exception 'Only the sadar, secretary or platform admin can edit member details';
  end if;

  select tenant_id into owner from public.members where id = p_member_id;
  if owner is null then
    raise exception 'Member not found';
  end if;
  if me.role <> 'super_admin' and owner is distinct from me.tenant_id then
    raise exception 'Member does not belong to this anjuman';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Name is required';
  end if;
  if digits is not null and length(digits) <> 10 then
    raise exception 'Mobile number must be exactly 10 digits';
  end if;
  if mail is not null and position('@' in mail) < 2 then
    raise exception 'A valid email is required';
  end if;

  update public.members
     set name        = trim(p_name),
         father_name = nullif(trim(coalesce(p_father_name, '')), ''),
         phone       = digits,
         email       = mail,
         household   = nullif(trim(coalesce(p_household, '')), ''),
         mohalla     = nullif(trim(coalesce(p_mohalla, '')), ''),
         blood_group = nullif(trim(coalesce(p_blood_group, '')), ''),
         photo_url   = coalesce(nullif(p_photo_url, ''), photo_url),
         updated_at  = now()
   where id = p_member_id;

  -- Keep a linked login in sync with the member card.
  update public.profiles
     set full_name = trim(p_name),
         phone     = digits,
         email     = mail,
         photo_url = coalesce(nullif(p_photo_url, ''), photo_url)
   where member_id = p_member_id
     and tenant_id = owner;
end $$;

revoke all on function public.update_member_details(uuid, text, text, text, text, text, text, text, text) from public;
grant execute on function public.update_member_details(uuid, text, text, text, text, text, text, text, text) to authenticated;

-- ── Avatar storage ──────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_owner_insert on storage.objects;
create policy avatars_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_owner_update on storage.objects;
create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_owner_delete on storage.objects;
create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
