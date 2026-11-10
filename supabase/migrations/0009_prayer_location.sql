-- ═══════════════════════════════════════════════════════════════
-- 0009 · Prayer-time location & method
--
-- The timetable cannot be calculated without knowing where the
-- masjid is. These columns hold the coordinates and the calculation
-- method; the panel fills them once and the timetable follows.
--
-- Depends on: 0001 (tenants), 0004 (tenant_settings).
-- ═══════════════════════════════════════════════════════════════

alter table public.tenants
  add column if not exists latitude  double precision,
  add column if not exists longitude double precision,
  add column if not exists timezone  text not null default 'Asia/Kolkata';

alter table public.tenant_settings
  add column if not exists calc_method   text not null default 'karachi',
  add column if not exists fajr_angle    numeric not null default 18,
  add column if not exists isha_angle    numeric not null default 18,
  add column if not exists asr_factor    int not null default 2,
  add column if not exists iqamah_offset int not null default 10,
  add column if not exists prayer_reminders boolean not null default true,
  add column if not exists jumuah_alert     boolean not null default true;
