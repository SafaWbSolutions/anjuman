-- ═══════════════════════════════════════════════════════════════
-- 0032 · Login block reasons + Sadar → Admin contact messages
-- ═══════════════════════════════════════════════════════════════

-- Why did this email fail to sign in? Used after a failed password
-- attempt so a suspended user sees the real reason instead of
-- "Invalid login credentials". Returns NULL when the account exists
-- and is allowed (i.e. the password was simply wrong).
create or replace function public.login_block_reason(p_email text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  v_status text;
  v_active boolean;
begin
  select t.status, p.is_active
    into v_status, v_active
    from auth.users u
    join public.profiles p on p.id = u.id
    left join public.tenants t on t.id = p.tenant_id
   where lower(u.email) = lower(trim(p_email))
   limit 1;

  if not found then
    return null;
  end if;

  if v_active is false then
    return 'Aapka account deactivate kar diya gaya hai. Admin se contact karen.';
  end if;

  if v_status = 'suspended' then
    return 'Aapka Account Suspend kar diya gaya hai. Admin se contact karen.';
  end if;

  if v_status = 'read_only' then
    return 'Aapke Anjuman ka plan expire ho gaya hai. Renewal ke liye Admin se contact karen.';
  end if;

  return null;
end $$;

revoke all on function public.login_block_reason(text) from public;
grant execute on function public.login_block_reason(text) to anon, authenticated, service_role;

-- ── Contact / support messages from Sadar to the platform admin ──
create table if not exists public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete set null,
  profile_id  uuid references public.profiles(id) on delete set null,
  name        text,
  email       text,
  phone       text,
  subject     text not null,
  message     text not null,
  status      text not null default 'open' check (status in ('open','resolved')),
  created_at  timestamptz not null default now()
);

alter table public.support_messages enable row level security;

drop policy if exists support_messages_read on public.support_messages;
create policy support_messages_read on public.support_messages
  for select using (
    public.is_super_admin()
    or tenant_id = public.current_tenant_id()
  );

drop policy if exists support_messages_admin_write on public.support_messages;
create policy support_messages_admin_write on public.support_messages
  for all using (public.is_super_admin()) with check (public.is_super_admin());

create or replace function public.send_support_message(
  p_subject text,
  p_message text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_tenant uuid := public.current_tenant_id();
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Sign in required';
  end if;
  if v_tenant is null then
    raise exception 'No anjuman for this session';
  end if;
  if coalesce(trim(p_subject), '') = '' then
    raise exception 'Subject likho';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Message likho';
  end if;

  select * into v_profile from public.profiles where id = auth.uid();

  insert into public.support_messages
    (tenant_id, profile_id, name, email, phone, subject, message)
  values
    (v_tenant, auth.uid(), v_profile.full_name, v_profile.email,
     v_profile.phone, trim(p_subject), trim(p_message))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.send_support_message(text, text) from public, anon;
grant execute on function public.send_support_message(text, text) to authenticated, service_role;

-- Public contact form on the login screen: a suspended sadar cannot
-- sign in, so let them still reach the platform admin.
create or replace function public.send_public_support_message(
  p_email text,
  p_name text,
  p_subject text,
  p_message text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_profile public.profiles;
begin
  if coalesce(trim(p_email), '') = '' then
    raise exception 'Email daalo';
  end if;
  if coalesce(trim(p_message), '') = '' then
    raise exception 'Message likho';
  end if;

  select * into v_profile from public.profiles
   where lower(email) = lower(trim(p_email)) limit 1;

  insert into public.support_messages
    (tenant_id, profile_id, name, email, phone, subject, message)
  values
    (v_profile.tenant_id, v_profile.id,
     coalesce(nullif(trim(p_name), ''), v_profile.full_name, 'Login page'),
     trim(p_email), v_profile.phone,
     coalesce(nullif(trim(p_subject), ''), 'Login page request'),
     trim(p_message))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.send_public_support_message(text, text, text, text) from public;
grant execute on function public.send_public_support_message(text, text, text, text) to anon, authenticated, service_role;
