# Ads & announcements

Platform-wide banner gallery shown at the top of every panel. A platform
admin uploads a 16:9 image (YouTube-thumbnail size) and chooses whether every
anjuman sees it or only selected ones, and whether it appears on the website,
the Android app, or both.

Migrations: `supabase/migrations/0046_ads.sql`,
`supabase/migrations/0047_ad_surfaces.sql`.

## Database

### `public.ads`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | PK |
| `title` | text | shown in admin list, also alt text |
| `image_url` | text | public R2 URL (`.../files/ads/...`) |
| `link_url` | text | optional click-through, `http(s)` only |
| `is_global` | boolean | `true` = every anjuman |
| `is_active` | boolean | paused ads are never returned |
| `show_web` | boolean | `true` = compact banner in the web panel |
| `show_app` | boolean | `true` = full 16:9 slide in the Android app |
| `sort_order` | integer | smaller number shows first |
| `starts_at` | timestamptz | optional |
| `ends_at` | timestamptz | optional |
| `impressions` | bigint | incremented by `record_ad_event` |
| `clicks` | bigint | incremented by `record_ad_event` |
| `created_by` | uuid | profile of the admin |
| `created_at` / `updated_at` | timestamptz | |

### `public.ad_targets`

`(ad_id, tenant_id)` — used only when `is_global = false`.

## RPCs (call these, never select the tables from a tenant client)

### `list_active_ads(p_surface text default 'web') returns setof ads`

Returns ads the signed-in user may see:

- `is_active`
- `show_web` when `p_surface = 'web'` (the default), `show_app` when
  `p_surface = 'app'`
- inside the optional `starts_at` / `ends_at` window
- `is_global = true` **or** the user's `current_tenant_id()` is in `ad_targets`

Ordered by `sort_order`, then `created_at`. Execute is granted to
`authenticated` only. Calling it with no arguments behaves exactly like
`p_surface => 'web'`, so older clients keep working.

### `record_ad_event(p_ad_id uuid, p_kind text)`

`p_kind` = `impression` or `click`. Silently ignores ads the caller cannot see.
Counters are informational, so the client may fire and forget.

## Row Level Security

- `ads` and `ad_targets`: platform admin (`is_super_admin()`) only for
  select / insert / update / delete.
- Tenant users reach ads exclusively through `list_active_ads()`.

## Uploads

- Worker: `POST https://r2-upload-gate.starservices0026.workers.dev/upload`
- Fields: `file`, `key`
- Header: `Authorization: Bearer <supabase access token>`
- Allowed key: `ads/<ad-id>/banner-<timestamp>.<ext>`
- **Super admin only.** Office bearers can upload `tenants/...` but not `ads/`.
- Max 5 MB, `image/*` only.
- Public read: `GET https://r2-upload-gate.starservices0026.workers.dev/files/<key>`

## Web behaviour

- Route: `/platform/ads/` (Platform → Ads & Announcements).
- Placement is chosen per ad: **Website + App** (default), **Website only**
  or **App only**.
- Banner appears above every page inside the app shell and only shows ads
  with `show_web = true`.
- Website layout: compact wide banner (`h-[132px]` / `158px` / `178px`),
  image fills the width (centre of the poster stays readable). The app keeps
  the full 16:9 image at YouTube-thumbnail size.
- Slide 1 = anjuman identity (logo, name, masjid / village) for 10 seconds.
- Then each live ad for 10 seconds, with a 3D `rotateY` flip.
- Progress bar at the bottom, dots to jump, `×` hides it for the session.
- When no ad is live the banner renders nothing (no empty space).
- Clicking an ad opens `link_url` in a new tab and increments `clicks`.
- Impressions count once per displayed ad slide, and only while the tab is
  visible. Platform-admin previews are not counted.
- Recommended image: **1280×720**. Client downscales to max 1600 px before
  upload to protect the R2 quota. On the website only the middle band of the
  16:9 poster is visible, so keep headline text centred; uploads made for the
  app can be reused as-is.

## Android app addendum

Paste this to the Android builder so the app matches the web:

```
Ads are now part of the backend. Do not create another ads table.

Read ads with the RPC list_active_ads(p_surface => 'app') — it already
filters by surface (web vs app), tenant, active flag, start/end window, and
global-vs-targeted. Order is sort_order, created_at. Never select public.ads
directly from a tenant client.

Fields: id, title, image_url, link_url, is_global, is_active, show_web,
show_app, sort_order, starts_at, ends_at, impressions, clicks.

The app only receives ads with show_app = true; the website only gets
show_web = true. So an ad can be exclusive to one surface.

Report counters with rpc("record_ad_event", { p_ad_id, p_kind }) where
p_kind is "impression" or "click". Fire and forget; ignore failures.

Top banner: show the anjuman identity slide (logo + name + masjid/village)
for 10 seconds, then each ad for 10 seconds with a 3D rotateY flip.
Use the same animation feel as the web. If there are no ads, show only the
anjuman identity (no empty banner). Clicking an ad opens link_url in the
custom tab / browser and records a click.

Ad images live on the R2 gate: GET .../files/<key>. Only the platform admin
uploads them (key prefix ads/). The Android app never uploads ads.

The admin gallery on the web already handles global and per-anjuman
targeting, placement (website / app / both), scheduling, ordering, pause and
delete. The app only displays.
```
