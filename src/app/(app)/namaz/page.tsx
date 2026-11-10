"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BellRing,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CloudMoon,
  Download,
  FileSpreadsheet,
  MapPin,
  MoonStar,
  Pencil,
  RefreshCw,
  Sun,
  Sunrise,
  Sunset,
  Upload,
} from "lucide-react";
import { activeTenant } from "@/lib/mock";
import type { PrayerDay, Tenant } from "@/lib/types";
import {
  getCurrentTenant,
  getTenantSettings,
  listPrayerDays,
  savePrayerDay,
  savePrayerDays,
  saveTenantLocation,
  saveTenantSettings,
  type TenantSettings,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  addMinutes,
  CALC_METHODS,
  calculatePrayerDay,
  hijriFor,
  monthDates,
  todayIso,
  type PrayerParams,
} from "@/lib/prayer";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/utils";

const PRAYERS = [
  { key: "fajr", label: "Fajr", arabic: "الفجر", icon: Sunrise },
  { key: "zuhr", label: "Zuhr", arabic: "الظهر", icon: Sun },
  { key: "asr", label: "Asr", arabic: "العصر", icon: Sun },
  { key: "maghrib", label: "Maghrib", arabic: "المغرب", icon: Sunset },
  { key: "isha", label: "Isha", arabic: "العشاء", icon: CloudMoon },
] as const;

type PrayerKey = (typeof PRAYERS)[number]["key"];

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default function NamazPage() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [dbDays, setDbDays] = useState<PrayerDay[]>([]);
  const [month, setMonth] = useState(todayIso().slice(0, 7));
  const [view, setView] = useState<"week" | "month">("month");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PrayerDay | null>(null);

  // settings form
  const [method, setMethod] = useState("karachi");
  const [fajrAngle, setFajrAngle] = useState("18");
  const [ishaAngle, setIshaAngle] = useState("18");
  const [asrFactor, setAsrFactor] = useState("2");
  const [offset, setOffset] = useState("10");
  const [latitude, setLatitude] = useState("26.0667");
  const [longitude, setLongitude] = useState("83.1833");
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const canEdit = user?.role === "sadar" || user?.role === "secretary";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const first = `${month}-01`;
      const dates = monthDates(first);
      const last = dates[dates.length - 1];

      const [tenantRow, settingsRow, dayRows] = await Promise.all([
        getCurrentTenant(),
        getTenantSettings(),
        listPrayerDays(first, last),
      ]);

      setTenant(tenantRow);
      setSettings(settingsRow);
      setDbDays(dayRows);

      setMethod(settingsRow.calcMethod);
      setFajrAngle(String(settingsRow.fajrAngle));
      setIshaAngle(String(settingsRow.ishaAngle));
      setAsrFactor(String(settingsRow.asrFactor));
      setOffset(String(settingsRow.iqamahOffset));
      setLatitude(tenantRow?.latitude != null ? String(tenantRow.latitude) : "26.0667");
      setLongitude(tenantRow?.longitude != null ? String(tenantRow.longitude) : "83.1833");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Timetable load nahi ho saka");
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  const params: PrayerParams = useMemo(
    () => ({
      latitude: Number(latitude) || 26.0667,
      longitude: Number(longitude) || 83.1833,
      timezoneOffset: 5.5,
      fajrAngle: Number(fajrAngle) || 18,
      ishaAngle: Number(ishaAngle) || 18,
      asrFactor: Number(asrFactor) || 2,
      iqamahOffset: Number(offset) || 0,
    }),
    [latitude, longitude, fajrAngle, ishaAngle, asrFactor, offset]
  );

  const merged = useMemo(() => {
    const dbMap = new Map(dbDays.map((d) => [d.date, d]));
    return monthDates(`${month}-01`).map((date) => {
      const saved = dbMap.get(date);
      if (saved) return saved;
      return calculatePrayerDay(date, params);
    });
  }, [dbDays, month, params]);

  const todayKey = todayIso();
  const today =
    merged.find((d) => d.date === todayKey) ??
    calculatePrayerDay(todayKey, params);

  const visible = view === "week" ? merged.slice(0, 7) : merged;

  const savedCount = dbDays.length;
  const manualCount = dbDays.filter(
    (d) => d.source === "manual" || d.source === "excel"
  ).length;
  const todaySource = today.source ?? "calculated";

  async function saveSettings() {
    if (!canEdit) {
      toast("Only the sadar or secretary can change these settings", "error");
      return;
    }
    setSaving(true);
    try {
      await saveTenantSettings({
        calcMethod: method,
        fajrAngle: Number(fajrAngle) || 18,
        ishaAngle: Number(ishaAngle) || 18,
        asrFactor: Number(asrFactor) || 2,
        iqamahOffset: Number(offset) || 0,
      });
      await saveTenantLocation({
        latitude: latitude.trim() === "" ? null : Number(latitude),
        longitude: longitude.trim() === "" ? null : Number(longitude),
        timezone: "Asia/Kolkata",
      });
      toast("Timetable settings saved");
      if (!isDemoMode) await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Settings save nahi hui", "error");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReminder(key: "prayerReminders" | "jumuahAlert", value: boolean) {
    if (!settings) return;
    const previous = settings[key];
    setSettings({ ...settings, [key]: value });
    try {
      await saveTenantSettings({ [key]: value } as Partial<TenantSettings>);
      toast(value ? "Reminders on" : "Reminders off");
    } catch (e) {
      setSettings({ ...settings, [key]: previous });
      toast(e instanceof Error ? e.message : "Setting save nahi hui", "error");
    }
  }

  async function generateMonth() {
    try {
      const days = monthDates(`${month}-01`).map((date) =>
        calculatePrayerDay(date, params)
      );
      await savePrayerDays(days);
      toast(`${days.length} days saved to the timetable`);
      if (!isDemoMode) await load();
      else setDbDays(days);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Timetable save nahi hua", "error");
    }
  }

  function downloadCsv() {
    const head = "Date,Fajr,Zuhr,Asr,Maghrib,Isha,Jumuah";
    const body = merged.map((d) =>
      [d.date, d.fajr, d.zuhr, d.asr, d.maghrib, d.isha, d.jumuah ?? ""].join(",")
    );
    const blob = new Blob([[head, ...body].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `namaz-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Timetable downloaded");
  }

  async function importCsv(file: File) {
    try {
      const text = await file.text();
      const days = parseCsv(text, Number(offset) || 0);
      if (days.length === 0) {
        toast("No valid rows found. Check the template.", "error");
        return;
      }
      await savePrayerDays(days);
      toast(`${days.length} days imported from ${file.name}`);
      if (!isDemoMode) await load();
      else setDbDays(days);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Import fail ho gaya", "error");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Namaz & azan"
        description={`Auto-calculated for ${tenant?.village ?? activeTenant.village}, ${tenant?.district ?? activeTenant.district}. Override any day or upload the masjid's own timetable.`}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importCsv(f);
                e.target.value = "";
              }}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Import timetable
            </Button>
            <Button variant="secondary" onClick={downloadCsv}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        {/* ── Today's times ───────────────────────────────── */}
        <Card className="xl:col-span-2 overflow-hidden">
          <div className="relative bg-ink-900 p-6 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "radial-gradient(600px 320px at 85% 0%, rgba(16,185,129,.35), transparent 60%)",
              }}
            />
            <div className="relative flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider text-brand-300">
                  <MapPin className="h-3.5 w-3.5" />
                  {tenant?.masjid || activeTenant.masjid} · {tenant?.village ?? activeTenant.village}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {new Date(`${today.date}T12:00:00`).toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-ink-300">{today.hijri || hijriFor(today.date)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10.5px] uppercase tracking-wider text-ink-400">
                  Iqamah after azan
                </p>
                <p className="text-lg font-semibold">{today.iqamahOffset} min</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-ink-100 sm:grid-cols-5 sm:divide-x">
            {PRAYERS.map((p) => {
              const Icon = p.icon;
              const time = today[p.key as PrayerKey];
              return (
                <div key={p.key} className="flex flex-col items-center gap-1 border-b border-ink-100 px-3 py-4 last:border-b-0 sm:border-b-0">
                  <Icon className="h-4 w-4 text-brand-600" />
                  <p className="text-[12px] font-medium text-ink-700">{p.label}</p>
                  <p className="text-[19px] font-semibold tracking-tight text-ink-900">{time}</p>
                  <p className="text-[10px] text-ink-400">
                    iqamah {addMinutes(time, today.iqamahOffset)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-brand-50/50 px-5 py-3">
            <Badge tone="green" dot>
              {today.jumuah ? `Jumu'ah ${today.jumuah}` : "Jumu'ah on Friday"}
            </Badge>
            <span className="text-[11.5px] text-ink-500">
              {todaySource === "calculated"
                ? `Calculated · ${CALC_METHODS[method]?.label ?? method}`
                : `Masjid timetable · ${todaySource}`}
            </span>
            <button
              onClick={() => setEditing(today)}
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700"
            >
              <Pencil className="h-3 w-3" /> Manual override
            </button>
          </div>
        </Card>

        {/* ── Settings ────────────────────────────────────── */}
        <Card>
          <CardHeader title="Timetable settings" subtitle="Applied to the whole month" />
          <div className="space-y-4 p-5">
            <Field label="Calculation method">
              <Select
                value={method}
                onChange={(e) => {
                  const next = e.target.value;
                  setMethod(next);
                  if (CALC_METHODS[next]) {
                    setFajrAngle(String(CALC_METHODS[next].fajr));
                    setIshaAngle(String(CALC_METHODS[next].isha));
                  }
                }}
              >
                {Object.entries(CALC_METHODS).map(([key, m]) => (
                  <option key={key} value={key}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fajr angle">
                <Input value={fajrAngle} onChange={(e) => setFajrAngle(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Isha angle">
                <Input value={ishaAngle} onChange={(e) => setIshaAngle(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Asr method">
                <Select value={asrFactor} onChange={(e) => setAsrFactor(e.target.value)}>
                  <option value="2">Hanafi (shadow ×2)</option>
                  <option value="1">Shafi (shadow ×1)</option>
                </Select>
              </Field>
              <Field label="Iqamah offset (min)">
                <Input value={offset} onChange={(e) => setOffset(e.target.value)} inputMode="numeric" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude">
                <Input value={latitude} onChange={(e) => setLatitude(e.target.value)} inputMode="decimal" />
              </Field>
              <Field label="Longitude">
                <Input value={longitude} onChange={(e) => setLongitude(e.target.value)} inputMode="decimal" />
              </Field>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink-800">Push reminders</p>
                <p className="text-[11px] text-ink-500">15 min before azan</p>
              </div>
              <Switch
                checked={settings?.prayerReminders ?? true}
                onChange={(v) => void toggleReminder("prayerReminders", v)}
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink-800">Friday Jumu&apos;ah alert</p>
                <p className="text-[11px] text-ink-500">Thursday evening</p>
              </div>
              <Switch
                checked={settings?.jumuahAlert ?? true}
                onChange={(v) => void toggleReminder("jumuahAlert", v)}
              />
            </div>
            <Button
              className="w-full"
              size="sm"
              onClick={() => void saveSettings()}
              disabled={saving || !canEdit}
            >
              {saving ? "Saving…" : canEdit ? "Save settings" : "Only sadar / secretary can edit"}
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Special days ───────────────────────────────────── */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          { icon: MoonStar, title: "Ramadan 1448", date: "Starts ~18 Feb 2027", body: "Sehri & iftar times are added to the daily sheet automatically." },
          { icon: CalendarDays, title: "Eid al-Fitr", date: "~19 Mar 2027", body: "Eid Jamaat 07:30 · Takbeer from 06:45." },
          { icon: CloudMoon, title: "Eid al-Adha", date: "~27 May 2027", body: "Eid Jamaat 07:00 · Qurbani collection link ready." },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.title} className="p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <div>
                  <p className="text-[13px] font-semibold text-ink-900">{s.title}</p>
                  <p className="text-[11.5px] font-medium text-brand-700">{s.date}</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{s.body}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Timetable table ───────────────────────────────── */}
      <Card className="mt-5">
        <CardHeader
          title="Timetable"
          subtitle={`${tenant?.village ?? activeTenant.village} · ${monthLabel(month)} · ${savedCount} saved, ${manualCount} manual`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, -1))}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="inline-flex rounded-lg border border-ink-200 p-0.5">
                {(["week", "month"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-[11.5px] font-medium capitalize",
                      view === v ? "bg-ink-900 text-white" : "text-ink-600"
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setMonth(shiftMonth(month, 1))}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" onClick={() => void generateMonth()} disabled={loading || !canEdit}>
                <RefreshCw className="h-3.5 w-3.5" /> Save month
              </Button>
            </div>
          }
        />
        <TableWrap>
          <thead>
            <tr className="table-head">
              <Th>Date</Th>
              <Th>Hijri</Th>
              {PRAYERS.map((p) => (
                <Th key={p.key} className="text-center">{p.label}</Th>
              ))}
              <Th className="text-center">Jumu&apos;ah</Th>
              <Th>Source</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {visible.map((d) => (
              <tr
                key={d.date}
                className={cn("cursor-pointer hover:bg-ink-50/60", d.date === todayKey && "bg-brand-50/40")}
                onClick={() => setEditing(d)}
              >
                <Td className="whitespace-nowrap text-[12px] font-medium text-ink-800">
                  {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-IN", {
                    day: "2-digit",
                    month: "short",
                    weekday: "short",
                  })}
                </Td>
                <Td className="text-[11.5px] text-ink-500">{d.hijri || hijriFor(d.date)}</Td>
                {PRAYERS.map((p) => (
                  <Td key={p.key} className="text-center font-mono text-[12px] text-ink-700">
                    {d[p.key as PrayerKey]}
                  </Td>
                ))}
                <Td className="text-center">
                  {d.jumuah ? <Badge tone="brand">{d.jumuah}</Badge> : <span className="text-ink-300">—</span>}
                </Td>
                <Td>
                  <Badge tone={d.source === "manual" ? "amber" : d.source === "excel" ? "violet" : "slate"}>
                    {d.source ?? "calculated"}
                  </Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
            <BellRing className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium text-ink-800">Import format</p>
            <p className="text-[11.5px] text-ink-500">
              Columns: Date · Fajr · Zuhr · Asr · Maghrib · Isha · Jumu&apos;ah (optional).
              Save Excel as CSV first. Missing values fall back to calculated times.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={downloadCsv}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Template
          </Button>
        </div>
      </Card>

      <OverrideDrawer
        day={editing}
        offset={Number(offset) || 0}
        onClose={() => setEditing(null)}
        onSaved={async (day) => {
          setEditing(null);
          if (!isDemoMode) await load();
          else
            setDbDays((prev) => {
              const next = prev.filter((d) => d.date !== day.date);
              return [...next, day].sort((a, b) => a.date.localeCompare(b.date));
            });
        }}
      />
    </>
  );
}

/* ── Manual override ─────────────────────────────────────────── */

function OverrideDrawer({
  day,
  offset,
  onClose,
  onSaved,
}: {
  day: PrayerDay | null;
  offset: number;
  onClose: () => void;
  onSaved: (day: PrayerDay) => void | Promise<void>;
}) {
  const [times, setTimes] = useState<Record<PrayerKey, string>>({
    fajr: "05:00",
    zuhr: "12:00",
    asr: "15:00",
    maghrib: "17:30",
    isha: "19:00",
  });
  const [jumuah, setJumuah] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!day) return;
    setTimes({
      fajr: day.fajr,
      zuhr: day.zuhr,
      asr: day.asr,
      maghrib: day.maghrib,
      isha: day.isha,
    });
    setJumuah(day.jumuah ?? "");
  }, [day]);

  if (!day) return null;

  // Narrowed once for the closure below — `day` inside a function
  // declaration loses the null-check narrowing.
  const current: PrayerDay = day;

  async function save() {
    setSaving(true);
    try {
      const next: PrayerDay = {
        ...current,
        ...times,
        jumuah: jumuah || undefined,
        iqamahOffset: offset,
        source: "manual",
      };
      await savePrayerDay(next);
      toast("Day overridden — the rest of the month is untouched");
      await onSaved(next);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Override save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!day}
      onClose={onClose}
      title="Manual override"
      subtitle={`${new Date(`${day.date}T12:00:00`).toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })} · ${day.hijri || hijriFor(day.date)}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Save override"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {PRAYERS.map((p) => (
          <Field key={p.key} label={`${p.label} azan`}>
            <Input
              value={times[p.key]}
              onChange={(e) => setTimes({ ...times, [p.key]: e.target.value })}
              placeholder="HH:MM"
              inputMode="numeric"
            />
          </Field>
        ))}
        <Field label="Jumu'ah (Friday only)" hint="Leave blank on other days.">
          <Input
            value={jumuah}
            onChange={(e) => setJumuah(e.target.value)}
            placeholder="12:30"
            inputMode="numeric"
          />
        </Field>
      </div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-900">
        Saving this day marks it <strong>manual</strong>. Calculated days and other
        overrides are not touched, and the member app updates immediately.
      </div>
    </Drawer>
  );
}

/* ── CSV import ──────────────────────────────────────────────── */

function normalizeDate(raw: string): string | null {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;

  const dmy = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function normalizeTime(raw: string): string {
  const value = raw.trim().replace(/\./g, ":");
  const m = value.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return "";
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function parseCsv(text: string, offset: number): PrayerDay[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const days: PrayerDay[] = [];

  for (const line of lines) {
    const cells = line.split(/[,;\t]/).map((c) => c.trim().replace(/^"|"$/g, ""));
    const date = normalizeDate(cells[0] ?? "");
    if (!date) continue; // header or junk

    const [fajr, zuhr, asr, maghrib, isha] = cells.slice(1, 6).map(normalizeTime);
    if (!fajr || !zuhr || !asr || !maghrib || !isha) continue;

    days.push({
      date,
      hijri: hijriFor(date),
      fajr,
      zuhr,
      asr,
      maghrib,
      isha,
      jumuah: normalizeTime(cells[6] ?? "") || undefined,
      iqamahOffset: offset,
      source: "excel",
    });
  }

  return days;
}
