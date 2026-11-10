"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { Button, Input, toast } from "@/components/ui";
import { cn } from "@/lib/utils";

const ROLE_CARDS: {
  role: Role;
  icon: typeof Users;
  desc: string;
  tone: string;
}[] = [
  {
    role: "sadar",
    icon: ShieldCheck,
    desc: "Full oversight, approvals & reports",
    tone: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  {
    role: "khajanchi",
    icon: BookOpenCheck,
    desc: "Collections, expenses & ledger",
    tone: "bg-sky-50 text-sky-700 ring-sky-200",
  },
  {
    role: "collector",
    icon: Users,
    desc: "Field collection with receipts",
    tone: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  {
    role: "member",
    icon: BadgeCheck,
    desc: "My dues, notices & complaints",
    tone: "bg-violet-50 text-violet-700 ring-violet-200",
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, ready, demoMode, signIn } = useAuth();
  const [busy, setBusy] = useState<Role | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (ready && user) router.replace("/dashboard/");
  }, [ready, user, router]);

  async function pick(role: Role) {
    setBusy(role);
    try {
      await signIn(role);
      router.replace("/dashboard/");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sign in failed", "error");
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy("member");
    try {
      await signIn("member", email, password);
      router.replace("/dashboard/");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Sign in failed", "error");
      setBusy(null);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Brand panel ─────────────────────────────────────── */}
      <div className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-ink-900 p-10 text-white lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(900px 500px at 10% 0%, rgba(16,185,129,.35), transparent 60%), radial-gradient(700px 500px at 90% 100%, rgba(5,150,105,.25), transparent 60%)",
          }}
        />
        <div className="relative">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold shadow-lg shadow-brand-500/30">
              ا
            </span>
            <div>
              <p className="text-lg font-semibold">Anjuman</p>
              <p className="text-[11px] uppercase tracking-[0.18em] text-ink-400">
                Community OS
              </p>
            </div>
          </div>

          <h1 className="mt-16 max-w-md text-4xl font-semibold leading-tight tracking-tight">
            Every rupee{" "}
            <span className="text-brand-400">accounted for.</span>
          </h1>
          <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-ink-300">
            Membership, monthly chanda, expenses and audits — built for village
            anjumans and masjid committees. Tamper-evident ledger, zero hidden
            money.
          </p>

          <ul className="mt-10 space-y-3 text-sm text-ink-300">
            {[
              "Hash-chained ledger — nothing can be silently edited",
              "Maker–checker approvals protect the khajanchi",
              "Unique member ID + Aadhaar-style ID cards",
              "Auto dues, reminders & reconciliation",
            ].map((t) => (
              <li key={t} className="flex items-start gap-2.5">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
          <Building2 className="h-5 w-5 text-brand-400" />
          <div className="text-[12.5px]">
            <p className="font-medium text-white">One platform, every anjuman</p>
            <p className="text-ink-400">
              Each committee&apos;s data is isolated at the database level.
            </p>
          </div>
        </div>
      </div>

      {/* ── Auth panel ──────────────────────────────────────── */}
      <div className="flex flex-1 items-center justify-center bg-ink-50 px-5 py-10">
        <div className="w-full max-w-[460px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
              ا
            </span>
            <div>
              <p className="font-semibold text-ink-900">Anjuman</p>
              <p className="text-[11px] uppercase tracking-wider text-ink-500">
                Community OS
              </p>
            </div>
          </div>

          <h2 className="text-2xl font-semibold tracking-tight text-ink-900">
            Welcome back
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {demoMode
              ? "Demo mode — choose a role to explore the panel. No password needed."
              : "Sign in with the email your anjuman secretary registered."}
          </p>

          {demoMode ? (
            <>
              <div className="mt-6 grid gap-2.5">
                {ROLE_CARDS.map(({ role, icon: Icon, desc, tone }) => (
                  <button
                    key={role}
                    onClick={() => pick(role)}
                    disabled={busy !== null}
                    className="group flex items-center gap-3 rounded-2xl border border-ink-200 bg-white p-3.5 text-left transition hover:border-brand-300 hover:shadow-[var(--shadow-card)] disabled:opacity-60"
                  >
                    <span
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                        tone
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink-900">
                        {ROLE_LABEL[role]}
                      </span>
                      <span className="block text-[12.5px] text-ink-500">
                        {desc}
                      </span>
                    </span>
                    {busy === role ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
                    ) : (
                      <ArrowRight className="h-4 w-4 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    )}
                  </button>
                ))}

                <button
                  onClick={() => pick("super_admin")}
                  disabled={busy !== null}
                  className="mt-1 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-ink-300 bg-white/60 px-3 py-3 text-[13px] font-medium text-ink-600 transition hover:border-brand-300 hover:text-brand-700 disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4 text-brand-500" />
                  Enter as Platform Admin
                  {busy === "super_admin" && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  )}
                </button>
              </div>

              <p className="mt-6 text-center text-[11.5px] leading-relaxed text-ink-400">
                This is a live demo running on sample data.
                <br />
                Nothing you enter is saved to a server.
              </p>
            </>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div>
                <label className="label">Email</label>
                <Input
                  icon={Mail}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="label">Password</label>
                <Input
                  icon={Lock}
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
              <Button type="submit" size="lg" className="w-full" loading={busy !== null}>
                Sign in
              </Button>
              <p className="text-center text-[12.5px] text-ink-500">
                Forgot password? Ask your anjuman secretary to reset it from
                Settings → Roles &amp; Access.
              </p>
            </form>
          )}

          <div className="mt-8 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400">
            <Lock className="h-3 w-3" />
            <span>Your data is isolated per anjuman. We never share it.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
