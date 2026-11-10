"use client";

import { useState } from "react";
import {
  BellRing,
  CalendarDays,
  Download,
  FileSpreadsheet,
  MapPin,
  MoonStar,
  Pencil,
  Sun,
  Sunrise,
  Sunset,
  Upload,
  CloudMoon,
} from "lucide-react";
import { prayerDays, activeTenant } from "@/lib/mock";
import {
  Badge,
  Button,
  Card,
  CardHeader,
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

export default function NamazPage() {
  const [offset, setOffset] = useState(10);
  const [autoRemind, setAutoRemind] = useState(true);
  const [manual, setManual] = useState(false);
  const [view, setView] = useState<"week" | "month">("week");
  const today = prayerDays[0];

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Namaz & azan"
        description={`Auto-calculated for ${activeTenant.village}, ${activeTenant.district}. Override any time or upload the masjid's own timetable.`}
        actions={
          <>
            <Button variant="secondary" onClick={() => toast("Choose a .xlsx file to import")}>
              <Upload className="h-4 w-4" /> Import Excel
            </Button>
            <Button variant="secondary" onClick={() => toast("Timetable downloaded")}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </>
        }
      />

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
                  {activeTenant.masjid} · {activeTenant.village}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {new Date("2026-11-10").toLocaleDateString("en-IN", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </h2>
                <p className="mt-0.5 text-[12.5px] text-ink-300">{today.hijri}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-right">
                <p className="text-[10.5px] uppercase tracking-wider text-ink-400">
                  Iqamah after azan
                </p>
                <p className="text-lg font-semibold">{offset} min</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 divide-ink-100 sm:grid-cols-5 sm:divide-x">
            {PRAYERS.map((p) => {
              const Icon = p.icon;
              const time = today[p.key];
              return (
                <div key={p.key} className="flex flex-col items-center gap-1 border-b border-ink-100 px-3 py-4 last:border-b-0 sm:border-b-0">
                  <Icon className="h-4 w-4 text-brand-600" />
                  <p className="text-[12px] font-medium text-ink-700">{p.label}</p>
                  <p className="text-[19px] font-semibold tracking-tight text-ink-900">{time}</p>
                  <p className="text-[10px] text-ink-400">
                    iqamah {addMinutes(time, offset)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 bg-brand-50/50 px-5 py-3">
            <Badge tone="green" dot>Jumu&apos;ah 12:30</Badge>
            <span className="text-[11.5px] text-ink-500">
              Khutbah starts 12:15 · calculated via ISNA method
            </span>
            <button
              onClick={() => setManual((v) => !v)}
              className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700"
            >
              <Pencil className="h-3 w-3" /> {manual ? "Editing enabled" : "Manual override"}
            </button>
          </div>
        </Card>

        {/* ── Settings ────────────────────────────────────── */}
        <Card>
          <CardHeader title="Timetable settings" subtitle="Applied to the whole month" />
          <div className="space-y-4 p-5">
            <Field label="Calculation method">
              <Select defaultValue="isna">
                <option value="isna">ISNA (North America)</option>
                <option value="karachi">University of Islamic Sciences, Karachi</option>
                <option value="mwl">Muslim World League</option>
                <option value="egypt">Egyptian General Authority</option>
                <option value="manual">Manual / masjid timetable</option>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fajr angle">
                <Input defaultValue="15" inputMode="numeric" />
              </Field>
              <Field label="Isha angle">
                <Input defaultValue="15" inputMode="numeric" />
              </Field>
            </div>
            <Field label="Iqamah offset (minutes)" hint="Added to every azan time.">
              <Input
                value={offset}
                onChange={(e) => setOffset(Number(e.target.value) || 0)}
                inputMode="numeric"
              />
            </Field>
            <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink-800">Push reminders</p>
                <p className="text-[11px] text-ink-500">15 min before azan</p>
              </div>
              <Switch checked={autoRemind} onChange={(v) => { setAutoRemind(v); toast(v ? "Reminders on" : "Reminders off"); }} />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink-800">Friday Jumu&apos;ah alert</p>
                <p className="text-[11px] text-ink-500">Thursday evening</p>
              </div>
              <Switch checked onChange={() => undefined} />
            </div>
            <Button className="w-full" size="sm" onClick={() => toast("Timetable settings saved")}>
              Save settings
            </Button>
          </div>
        </Card>
      </div>

      {/* ── Special days ───────────────────────────────────── */}
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        {[
          { icon: MoonStar, title: "Ramadan 1448", date: "Starts ~18 Feb 2027", body: "Sehri & iftar times auto-added to the daily sheet." },
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
          subtitle={`${activeTenant.village} · November 2026`}
          action={
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
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {(view === "week" ? prayerDays : [...prayerDays, ...prayerDays, ...prayerDays].slice(0, 21)).map((d, i) => (
              <tr key={`${d.date}-${i}`} className={cn("hover:bg-ink-50/60", i === 0 && "bg-brand-50/40")}>
                <Td className="whitespace-nowrap text-[12px] font-medium text-ink-800">
                  {new Date(d.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", weekday: "short" })}
                </Td>
                <Td className="text-[11.5px] text-ink-500">{d.hijri}</Td>
                {PRAYERS.map((p) => (
                  <Td key={p.key} className="text-center font-mono text-[12px] text-ink-700">
                    {d[p.key]}
                  </Td>
                ))}
                <Td className="text-center">
                  {d.jumuah ? <Badge tone="brand">{d.jumuah}</Badge> : <span className="text-ink-300">—</span>}
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
            <p className="text-[12.5px] font-medium text-ink-800">Excel upload format</p>
            <p className="text-[11.5px] text-ink-500">
              Columns: Date · Fajr · Zuhr · Asr · Maghrib · Isha · Jumu&apos;ah (optional). Missing values fall back to calculated times.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => toast("Template downloaded")}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Template
          </Button>
        </div>
      </Card>
    </>
  );
}

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
