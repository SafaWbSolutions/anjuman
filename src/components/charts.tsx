"use client";

import { formatINR } from "@/lib/utils";

/** Lightweight SVG charts — no chart library, keeps the bundle tiny. */

export function BarPair({
  data,
  height = 180,
}: {
  data: { label: string; collected: number; spent: number }[];
  height?: number;
}) {
  const max = Math.max(...data.flatMap((d) => [d.collected, d.spent]), 1);
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height }}>
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-2">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-1/2 max-w-[18px] rounded-t-md bg-brand-500 transition-all"
                style={{ height: `${Math.max((d.collected / max) * 100, 2)}%` }}
                title={`Collected ${formatINR(d.collected)}`}
              />
              <div
                className="w-1/2 max-w-[18px] rounded-t-md bg-ink-300 transition-all"
                style={{ height: `${Math.max((d.spent / max) * 100, 2)}%` }}
                title={`Spent ${formatINR(d.spent)}`}
              />
            </div>
            <span className="text-[11px] font-medium text-ink-500">{d.label}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-4 text-[11.5px] text-ink-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-brand-500" /> Collected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-ink-300" /> Spent
        </span>
      </div>
    </div>
  );
}

export function Sparkline({
  values,
  className,
  stroke = "#059669",
}: {
  values: number[];
  className?: string;
  stroke?: string;
}) {
  if (!values.length) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1 || 1)) * 100;
      const y = 30 - ((v - min) / span) * 26 - 2;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg viewBox="0 0 100 32" className={className} preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  className,
}: {
  value: number;
  tone?: "brand" | "amber" | "red";
  className?: string;
}) {
  const color =
    tone === "brand" ? "bg-brand-500" : tone === "amber" ? "bg-amber-500" : "bg-red-500";
  return (
    <div className={`h-2 w-full overflow-hidden rounded-full bg-ink-100 ${className ?? ""}`}>
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(Math.max(value, 0), 100)}%` }}
      />
    </div>
  );
}

export function Donut({
  segments,
  size = 132,
  thickness = 16,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={thickness}
        />
        {segments.map((s) => {
          const len = (s.value / total) * c;
          const el = (
            <circle
              key={s.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="space-y-2 text-[12.5px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: s.color }}
            />
            <span className="text-ink-600">{s.label}</span>
            <span className="ml-auto font-medium text-ink-900">
              {formatINR(s.value, { compact: true })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
