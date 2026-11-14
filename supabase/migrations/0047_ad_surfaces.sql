-- ═══════════════════════════════════════════════════════════════
-- 0047 · Ads: separate website and app placements
--
-- The website keeps its compact wide banner, while the Android app
-- shows the untouched 16:9 image (YouTube-thumbnail size). An ad can
-- therefore be published to the website, the app, or both.
--
-- `list_active_ads()` gains a surface argument:
--   'web' (default) → only ads with show_web = true
--   'app'           → only ads with show_app = true
-- Anything else falls back to the website set, so an older client
-- calling the RPC with no arguments keeps working.
-- ═══════════════════════════════════════════════════════════════

alter table public.ads
  add column if not exists show_web boolean not null default true;

alter table public.ads
  add column if not exists show_app boolean not null default true;

-- Old zero-argument signature would otherwise conflict with the new
-- default argument when called as list_active_ads().
drop function if exists public.list_active_ads();

create or replace function public.list_active_ads(p_surface text default 'web')
returns setof public.ads
language sql
stable
security definer
set search_path = public
as $$
  select a.*
    from public.ads a
   where a.is_active
     and case
           when lower(btrim(coalesce(p_surface, 'web'))) = 'app' then a.show_app
           else a.show_web
         end
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

revoke all on function public.list_active_ads(text) from public;
grant execute on function public.list_active_ads(text) to authenticated;

comment on column public.ads.show_web is
  'true = the compact banner at the top of the web panel shows this ad.';
comment on column public.ads.show_app is
  'true = the Android app shows this ad (full 16:9 image).';
comment on function public.list_active_ads(text) is
  'Active ads for the signed-in anjuman, filtered by surface (''web'' or ''app'').';
