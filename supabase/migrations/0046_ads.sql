-- ═══════════════════════════════════════════════════════════════
-- 0046 · Ads / announcement gallery
--
-- A platform admin can upload YouTube-thumbnail sized images and
-- show them either to every anjuman (`is_global = true`) or only
-- to the tenants listed in `ad_targets`.
--
-- Read path for tenant users is the SECURITY DEFINER function
-- `list_active_ads()` — never a direct table select — so inactive
-- or not-yet-started ads can never leak into the panel.
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.ads (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Untitled',
  image_url   text not null,
  link_url    text,
  is_global   boolean not null default false,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  starts_at   timestamptz,
  ends_at     timestamptz,
  impressions bigint not null default 0,
  clicks      bigint not null default 0,
  created_by  uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.ad_targets (
  ad_id     uuid not null references public.ads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  primary key (ad_id, tenant_id)
);

create index if not exists ads_active_idx
  on public.ads (is_active, sort_order, created_at);

create index if not exists ad_targets_tenant_idx
  on public.ad_targets (tenant_id);

drop trigger if exists ads_touch_updated_at on public.ads;
create trigger ads_touch_updated_at
  before update on public.ads
  for each row execute function public.touch_updated_at();

-- ── Row Level Security ─────────────────────────────────────────
-- Tenant users read through list_active_ads(); only platform
-- admins touch the tables directly.
alter table public.ads        enable row level security;
alter table public.ad_targets enable row level security;

drop policy if exists ads_admin_all on public.ads;
create policy ads_admin_all on public.ads
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists ad_targets_admin_all on public.ad_targets;
create policy ad_targets_admin_all on public.ad_targets
  for all using (public.is_super_admin())
  with check (public.is_super_admin());

-- ── Active ads visible to the signed-in user's anjuman ────────
create or replace function public.list_active_ads()
returns setof public.ads
language sql
stable
security definer
set search_path = public
as $$
  select a.*
    from public.ads a
   where a.is_active
     and (a.starts_at is null or a.starts_at <= now())
     and (a.ends_at   is null or a.ends_at   >= now())
     and (
       a.is_global
       or exists (
         select 1
           from public.ad_targets t
          where t.ad_id = a.id
            and t.tenant_id = public.current_tenant_id()
       )
     )
   order by a.sort_order asc, a.created_at asc;
$$;

-- ── Impression / click counters ────────────────────────────────
-- Counters are informational only. The function silently ignores
-- ads the caller cannot see, and never exposes any other data.
create or replace function public.record_ad_event(p_ad_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_visible boolean;
begin
  if p_kind not in ('impression', 'click') then
    raise exception 'Invalid ad event: %', p_kind;
  end if;

  select exists (
    select 1
      from public.ads a
     where a.id = p_ad_id
       and a.is_active
       and (a.starts_at is null or a.starts_at <= now())
       and (a.ends_at   is null or a.ends_at   >= now())
       and (
         a.is_global
         or exists (
           select 1
             from public.ad_targets t
            where t.ad_id = a.id
              and t.tenant_id = public.current_tenant_id()
         )
       )
  ) into v_visible;

  if not v_visible then
    return;
  end if;

  if p_kind = 'impression' then
    update public.ads set impressions = impressions + 1 where id = p_ad_id;
  else
    update public.ads set clicks = clicks + 1 where id = p_ad_id;
  end if;
end $$;

revoke all on function public.list_active_ads() from public;
revoke all on function public.record_ad_event(uuid, text) from public;
grant execute on function public.list_active_ads() to authenticated;
grant execute on function public.record_ad_event(uuid, text) to authenticated;

comment on table public.ads is
  'Platform / tenant announcement banners shown at the top of every panel.';
comment on column public.ads.is_global is
  'true = every anjuman sees it; false = only the tenants in ad_targets.';
