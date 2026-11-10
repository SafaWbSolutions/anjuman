// ═══════════════════════════════════════════════════════════════
// Prayer-time calculation.
//
// Standard solar equations (the same ones PrayTimes uses), no
// dependency and no network call. The result is a normal timetable:
// the committee can still override any day or upload their own.
//
// Times are local wall-clock for the tenant's timezone offset. India
// has no daylight saving, so the default +5.5 is stable.
// ═══════════════════════════════════════════════════════════════

import type { PrayerDay } from "./types";

const DEG = Math.PI / 180;

const sin = (d: number) => Math.sin(d * DEG);
const cos = (d: number) => Math.cos(d * DEG);
const tan = (d: number) => Math.tan(d * DEG);
const asin = (x: number) => Math.asin(x) / DEG;
const acos = (x: number) => Math.acos(x) / DEG;
const atan = (x: number) => Math.atan(x) / DEG;
const atan2 = (y: number, x: number) => Math.atan2(y, x) / DEG;

export interface PrayerParams {
  latitude: number;
  longitude: number;
  /** Hours east of UTC, e.g. 5.5 for India. */
  timezoneOffset?: number;
  fajrAngle?: number;
  ishaAngle?: number;
  /** 1 = Shafi, 2 = Hanafi. */
  asrFactor?: number;
  iqamahOffset?: number;
}

export const DEFAULT_PRAYER_PARAMS: PrayerParams = {
  latitude: 26.0667,
  longitude: 83.1833,
  timezoneOffset: 5.5,
  fajrAngle: 18,
  ishaAngle: 18,
  asrFactor: 2,
  iqamahOffset: 10,
};

export const CALC_METHODS: Record<
  string,
  { label: string; fajr: number; isha: number }
> = {
  karachi: { label: "University of Islamic Sciences, Karachi", fajr: 18, isha: 18 },
  isna: { label: "ISNA (North America)", fajr: 15, isha: 15 },
  mwl: { label: "Muslim World League", fajr: 18, isha: 17 },
  egypt: { label: "Egyptian General Authority", fajr: 19.5, isha: 17.5 },
};

function julianDay(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5
  );
}

function normalizeHours(hours: number): number {
  return ((((hours + 12) % 24) + 24) % 24) - 12;
}

function sunPosition(jd: number): { decl: number; eqt: number } {
  const d = jd - 2451545.0;

  const g = 357.529 + 0.98560028 * d;
  const q = ((280.459 + 0.98564736 * d) % 360 + 360) % 360;
  const L = ((q + 1.915 * sin(g) + 0.02 * sin(2 * g)) % 360 + 360) % 360;
  const e = 23.439 - 0.00000036 * d;

  const ra = atan2(cos(e) * sin(L), cos(L));
  const decl = asin(sin(e) * sin(L));
  const eqt = normalizeHours(q / 15 - ra / 15);

  return { decl, eqt };
}

function hourAngle(
  altitude: number,
  latitude: number,
  decl: number
): number | null {
  const numerator = sin(altitude) - sin(latitude) * sin(decl);
  const denominator = cos(latitude) * cos(decl);
  if (Math.abs(denominator) < 1e-9) return null;

  const value = numerator / denominator;
  if (value < -1 || value > 1) return null;

  return acos(value) / 15;
}

function toTime(hours: number): string {
  if (!Number.isFinite(hours)) return "--:--";

  let minutes = Math.round((((hours % 24) + 24) % 24) * 60);
  minutes = ((minutes % 1440) + 1440) % 1440;

  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function hijriFor(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "";

  try {
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    const text = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date);
    return text.replace(/\s*AH$/i, "").trim();
  } catch {
    return "";
  }
}

export function calculatePrayerDay(
  iso: string,
  params: PrayerParams = DEFAULT_PRAYER_PARAMS
): PrayerDay {
  const p = { ...DEFAULT_PRAYER_PARAMS, ...params };
  const [year, month, day] = iso.split("-").map(Number);
  const jd = julianDay(year, month, day);
  const { decl, eqt } = sunPosition(jd);

  const dhuhr = 12 + (p.timezoneOffset ?? 5.5) - p.longitude / 15 - eqt;

  const fajrH = hourAngle(-(p.fajrAngle ?? 18), p.latitude, decl);
  const ishaH = hourAngle(-(p.ishaAngle ?? 18), p.latitude, decl);
  const riseH = hourAngle(-0.833, p.latitude, decl);

  const asrAltitude = atan(
    1 / ((p.asrFactor ?? 2) + tan(Math.abs(p.latitude - decl)))
  );
  const asrH = hourAngle(asrAltitude, p.latitude, decl);

  const weekday = new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
  const jumuah = weekday === 5 ? toTime(dhuhr + 22 / 60) : undefined;

  return {
    date: iso,
    hijri: hijriFor(iso),
    fajr: toTime(fajrH === null ? dhuhr - 1.5 : dhuhr - fajrH),
    zuhr: toTime(dhuhr),
    asr: toTime(asrH === null ? dhuhr + 3.5 : dhuhr + asrH),
    maghrib: toTime(riseH === null ? dhuhr + 6 : dhuhr + riseH),
    isha: toTime(ishaH === null ? dhuhr + 7.5 : dhuhr + ishaH),
    jumuah,
    iqamahOffset: p.iqamahOffset ?? 10,
    source: "calculated",
  };
}

/** Every day of the month that contains `iso` (YYYY-MM-DD). */
export function monthDates(iso: string): string[] {
  const [y, m] = iso.split("-").map(Number);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const d = String(i + 1).padStart(2, "0");
    return `${y}-${String(m).padStart(2, "0")}-${d}`;
  });
}

export function addMinutes(time: string, minutes: number): string {
  if (!/^\d{2}:\d{2}$/.test(time)) return time;
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
