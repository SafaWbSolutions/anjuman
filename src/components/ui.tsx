"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  ChevronDown,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";

/* ── Button ─────────────────────────────────────────────────── */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft" | "dark";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20 border border-transparent",
  secondary:
    "bg-white text-ink-700 border border-ink-200 hover:bg-ink-50 hover:border-ink-300",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100 border border-transparent",
  danger:
    "bg-red-600 text-white hover:bg-red-700 border border-transparent shadow-sm",
  soft: "bg-brand-50 text-brand-700 border border-brand-100 hover:bg-brand-100",
  dark: "bg-ink-900 text-white hover:bg-ink-800 border border-transparent",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-xl",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
  icon: "h-9 w-9 rounded-lg justify-center",
};

export function buttonClasses(
  variant: Variant = "primary",
  size: Size = "md",
  className?: string
) {
  return cn(
    "inline-flex items-center justify-center font-medium transition-colors focus-ring disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
    VARIANTS[variant],
    SIZES[size],
    className
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={props.disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ── Card ───────────────────────────────────────────────────── */

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("card", className)} {...props}>
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-4",
        className
      )}
    >
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
        {subtitle && (
          <p className="mt-0.5 text-[13px] text-ink-500">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Badge ──────────────────────────────────────────────────── */

export type Tone =
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "slate"
  | "violet"
  | "brand";

const TONES: Record<Tone, string> = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  red: "bg-red-50 text-red-700 ring-red-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  slate: "bg-ink-100 text-ink-600 ring-ink-500/20",
  violet: "bg-violet-50 text-violet-700 ring-violet-600/20",
  brand: "bg-brand-50 text-brand-700 ring-brand-600/20",
};

export function Badge({
  children,
  tone = "slate",
  dot,
  className,
}: {
  children: React.ReactNode;
  tone?: Tone;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        TONES[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: Tone; label: string }> = {
    paid: { tone: "green", label: "Paid" },
    verified: { tone: "green", label: "Verified" },
    approved: { tone: "green", label: "Approved" },
    active: { tone: "green", label: "Active" },
    resolved: { tone: "green", label: "Resolved" },
    connected: { tone: "green", label: "Connected" },
    pending: { tone: "amber", label: "Pending" },
    partial: { tone: "amber", label: "Partial" },
    trial: { tone: "blue", label: "Trial" },
    in_progress: { tone: "blue", label: "In progress" },
    assigned: { tone: "blue", label: "Assigned" },
    open: { tone: "amber", label: "Open" },
    pending_verification: { tone: "amber", label: "To verify" },
    read_only: { tone: "amber", label: "Read only" },
    not_configured: { tone: "slate", label: "Not configured" },
    inactive: { tone: "slate", label: "Inactive" },
    waived: { tone: "violet", label: "Waived" },
    rejected: { tone: "red", label: "Rejected" },
    suspended: { tone: "red", label: "Suspended" },
    error: { tone: "red", label: "Error" },
    disputed: { tone: "red", label: "Disputed" },
  };
  const s = map[status] ?? { tone: "slate" as Tone, label: status };
  return (
    <Badge tone={s.tone} dot>
      {s.label}
    </Badge>
  );
}

/* ── Avatar ─────────────────────────────────────────────────── */

const AVATAR_COLORS = [
  "bg-emerald-100 text-emerald-700",
  "bg-sky-100 text-sky-700",
  "bg-violet-100 text-violet-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

export function Avatar({
  name,
  size = "md",
  className,
  photoUrl,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  photoUrl?: string | null;
}) {
  const idx = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length;
  const sizeClass =
    size === "sm" ? "h-8 w-8" : size === "md" ? "h-10 w-10" : "h-14 w-14";

  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        className={cn("inline-flex shrink-0 rounded-full object-cover", sizeClass, className)}
      />
    );
  }

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        size === "sm" && "h-8 w-8 text-[11px]",
        size === "md" && "h-10 w-10 text-[13px]",
        size === "lg" && "h-14 w-14 text-lg",
        AVATAR_COLORS[idx],
        className
      )}
    >
      {initials(name)}
    </span>
  );
}

/* ── Inputs ─────────────────────────────────────────────────── */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-[12px] text-ink-500">{hint}</p>}
    </div>
  );
}

export function Input({
  className,
  icon: Icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon?: LucideIcon }) {
  if (!Icon) return <input className={cn("input", className)} {...props} />;
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input className={cn("input pl-9", className)} {...props} />
    </div>
  );
}

/* Indian mobile input: fixed +91, digits only, hard-locked to 10. */
export function PhoneInput({
  value,
  onChange,
  className,
  placeholder = "98765 43210",
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded-xl border border-ink-200 bg-white transition focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
        disabled && "bg-ink-50 opacity-70",
        className
      )}
    >
      <span className="flex items-center border-r border-ink-200 bg-ink-50 px-3 text-[13px] font-medium text-ink-600">
        +91
      </span>
      <input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={10}
        value={digits}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent px-3 py-2.5 text-[14px] tracking-wide text-ink-900 outline-none placeholder:tracking-normal placeholder:text-ink-400"
      />
      <span className="flex items-center pr-3 text-[11px] tabular-nums text-ink-400">
        {digits.length}/10
      </span>
    </div>
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={cn("select", className)} {...props}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input pl-9"
      />
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2.5 focus-ring rounded-full"
    >
      <span
        className={cn(
          "flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors",
          checked ? "justify-end bg-brand-600" : "justify-start bg-ink-300"
        )}
      >
        <span className="h-5 w-5 rounded-full bg-white shadow-sm ring-1 ring-black/5 transition-all" />
      </span>
      {label && <span className="text-sm text-ink-700">{label}</span>}
    </button>
  );
}

/* ── Drawer / Modal ─────────────────────────────────────────── */

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = "max-w-xl",
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  width?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className={cn(
          "relative flex h-full w-full flex-col bg-white shadow-[var(--shadow-pop)] sm:m-3 sm:h-[calc(100%-1.5rem)] sm:rounded-2xl",
          width
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 truncate text-[13px] text-ink-500">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="border-t border-ink-100 px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ── Table helpers ──────────────────────────────────────────── */

export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th className={cn("table-head px-4 py-2.5 font-semibold", className)}>
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("table-cell", className)}>{children}</td>;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        <Icon className="h-6 w-6" />
      </div>
      <p className="text-[15px] font-semibold text-ink-800">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────── */

/** Bold, multi-colour card skins — one per tone, used by StatCard. */
const STAT_SKINS: Record<
  Tone,
  { card: string; glow: string; icon: string; label: string; value: string; chip: string }
> = {
  green: {
    card: "from-emerald-500/[0.09] via-white to-white border-emerald-200/70 hover:border-emerald-300",
    glow: "bg-emerald-400/25",
    icon: "from-emerald-500 to-teal-600 shadow-emerald-500/35",
    label: "text-emerald-800/70",
    value: "text-emerald-950",
    chip: "bg-emerald-100 text-emerald-700",
  },
  amber: {
    card: "from-amber-500/[0.10] via-white to-white border-amber-200/70 hover:border-amber-300",
    glow: "bg-amber-400/25",
    icon: "from-amber-500 to-orange-600 shadow-amber-500/35",
    label: "text-amber-900/70",
    value: "text-amber-950",
    chip: "bg-amber-100 text-amber-800",
  },
  red: {
    card: "from-rose-500/[0.09] via-white to-white border-rose-200/70 hover:border-rose-300",
    glow: "bg-rose-400/25",
    icon: "from-rose-500 to-red-600 shadow-rose-500/35",
    label: "text-rose-900/70",
    value: "text-rose-950",
    chip: "bg-rose-100 text-rose-800",
  },
  blue: {
    card: "from-sky-500/[0.09] via-white to-white border-sky-200/70 hover:border-sky-300",
    glow: "bg-sky-400/25",
    icon: "from-sky-500 to-blue-600 shadow-sky-500/35",
    label: "text-sky-900/70",
    value: "text-sky-950",
    chip: "bg-sky-100 text-sky-800",
  },
  violet: {
    card: "from-violet-500/[0.09] via-white to-white border-violet-200/70 hover:border-violet-300",
    glow: "bg-violet-400/25",
    icon: "from-violet-500 to-purple-600 shadow-violet-500/35",
    label: "text-violet-900/70",
    value: "text-violet-950",
    chip: "bg-violet-100 text-violet-800",
  },
  brand: {
    card: "from-brand-500/[0.10] via-white to-white border-brand-200/70 hover:border-brand-300",
    glow: "bg-brand-400/25",
    icon: "from-brand-500 to-emerald-600 shadow-brand-500/35",
    label: "text-brand-900/70",
    value: "text-brand-950",
    chip: "bg-brand-100 text-brand-800",
  },
  slate: {
    card: "from-slate-500/[0.08] via-white to-white border-slate-200 hover:border-slate-300",
    glow: "bg-slate-400/20",
    icon: "from-slate-600 to-ink-800 shadow-slate-500/30",
    label: "text-slate-600",
    value: "text-ink-900",
    chip: "bg-slate-100 text-slate-700",
  },
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "brand",
  trend,
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: Tone;
  trend?: string;
  onClick?: () => void;
}) {
  const skin = STAT_SKINS[tone];
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-2xl border bg-gradient-to-br p-5 text-left shadow-sm transition-all duration-200",
        skin.card,
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-lg"
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full blur-2xl transition-opacity duration-200",
          skin.glow,
          onClick && "group-hover:opacity-90"
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-[10.5px] font-bold uppercase tracking-[0.09em]",
              skin.label
            )}
          >
            {label}
          </p>
          <p
            className={cn(
              "mt-1.5 truncate text-[26px] font-extrabold leading-none tracking-tight",
              skin.value
            )}
          >
            {value}
          </p>
          {sub && (
            <p className="mt-1.5 truncate text-[11.5px] font-medium text-ink-500">
              {sub}
            </p>
          )}
        </div>
        <span
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg transition-transform duration-200",
            skin.icon,
            onClick && "group-hover:scale-105"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      {trend && (
        <p className="relative mt-3 inline-flex items-center gap-1 rounded-full bg-white/80 px-2 py-0.5 text-[11.5px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">
          <Check className="h-3.5 w-3.5" /> {trend}
        </p>
      )}
    </Tag>
  );
}

/* ── Page header ────────────────────────────────────────────── */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-brand-600">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-900">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-ink-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ── Toaster ────────────────────────────────────────────────── */

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export function toast(message: string, kind: ToastKind = "success") {
  window.dispatchEvent(
    new CustomEvent("anjuman:toast", { detail: { message, kind } })
  );
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    let n = 0;
    const handler = (e: Event) => {
      const { message, kind } = (e as CustomEvent).detail as {
        message: string;
        kind: ToastKind;
      };
      const id = ++n;
      setItems((prev) => [...prev, { id, message, kind }]);
      setTimeout(
        () => setItems((prev) => prev.filter((i) => i.id !== id)),
        4200
      );
    };
    window.addEventListener("anjuman:toast", handler);
    return () => window.removeEventListener("anjuman:toast", handler);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-full max-w-sm flex-col gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className={cn(
            "pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-[var(--shadow-pop)]",
            i.kind === "success" && "border-emerald-200 bg-white text-ink-800",
            i.kind === "error" && "border-red-200 bg-white text-ink-800",
            i.kind === "info" && "border-ink-200 bg-white text-ink-800"
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
              i.kind === "success" && "bg-emerald-500",
              i.kind === "error" && "bg-red-500",
              i.kind === "info" && "bg-ink-500"
            )}
          >
            {i.kind === "error" ? (
              <X className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </span>
          {i.message}
        </div>
      ))}
    </div>
  );
}
