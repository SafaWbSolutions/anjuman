"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  ChevronsUpDown,
  Command,
  LogOut,
  Menu,
  Search,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import * as Icons from "lucide-react";
import { useAuth, roleLabel } from "@/lib/auth";
import { navForRole } from "@/lib/nav";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { cn, ensurePrintRoot } from "@/lib/utils";
import { members, complaints, approvals } from "@/lib/mock";
import { Avatar, Badge, Toaster } from "@/components/ui";

const iconFor = (name: string): LucideIcon =>
  (Icons[name as keyof typeof Icons] as LucideIcon) ?? Icons.Circle;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, ready, signOut, demoMode, switchRole } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (ready && !user) router.replace("/login/");
  }, [ready, user, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Ctrl+P and the browser's own Print menu skip the app's Print buttons;
  // isolate the printable area there as well so the full page never prints.
  useEffect(() => {
    const onBeforePrint = () => ensurePrintRoot();
    window.addEventListener("beforeprint", onBeforePrint);
    return () => window.removeEventListener("beforeprint", onBeforePrint);
  }, []);

  if (!ready || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <div className="flex flex-col items-center gap-3 text-ink-400">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-brand-600/80" />
          <p className="text-sm">Preparing your workspace…</p>
        </div>
      </div>
    );
  }

  const pendingApprovals = approvals.filter((a) => a.status === "pending").length;
  const sections = navForRole(user.role).map((s) => ({
    ...s,
    items: s.items.map((i) =>
      i.href === "/approvals/"
        ? { ...i, badge: pendingApprovals ? String(pendingApprovals) : undefined }
        : i
    ),
  }));
  const pendingCount =
    (user.role === "sadar" || user.role === "khajanchi" || user.role === "auditor"
      ? approvals.filter((a) => a.status === "pending").length
      : 0) +
    (user.role === "member" || user.role === "sadar"
      ? complaints.filter((c) => c.status === "open").length
      : 0);

  return (
    <div className="min-h-screen bg-ink-50">
      {/* ── Sidebar (desktop) ─────────────────────────────── */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col bg-ink-900 lg:flex">
        <SidebarContent
          sections={sections}
          pathname={pathname}
          tenantName={user.tenantName}
          role={user.role}
          onSignOut={signOut}
          userName={user.name}
        />
      </aside>

      {/* ── Sidebar (mobile) ──────────────────────────────── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex h-full w-[280px] flex-col bg-ink-900 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-2 text-ink-400 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent
              sections={sections}
              pathname={pathname}
              tenantName={user.tenantName}
              role={user.role}
              onSignOut={signOut}
              userName={user.name}
            />
          </aside>
        </div>
      )}

      {/* ── Main ──────────────────────────────────────────── */}
      <div className="lg:pl-[264px]">
        <header className="sticky top-0 z-30 border-b border-ink-200/80 bg-white/85 backdrop-blur-md">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden h-9 w-full max-w-sm items-center gap-2 rounded-xl border border-ink-200 bg-ink-50/70 px-3 text-left text-sm text-ink-400 transition hover:border-ink-300 hover:bg-white sm:flex"
            >
              <Search className="h-4 w-4" />
              <span>Search members, receipts, pages…</span>
              <kbd className="ml-auto hidden rounded-md border border-ink-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-ink-400 md:block">
                ⌘K
              </kbd>
            </button>

            <div className="ml-auto flex items-center gap-2">
              {demoMode && (
                <div className="hidden items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-2.5 py-1.5 md:flex">
                  <Sparkles className="h-3.5 w-3.5 text-brand-600" />
                  <span className="text-[11.5px] font-medium text-brand-700">Demo</span>
                  <select
                    value={user.role}
                    onChange={(e) => switchRole(e.target.value as Role)}
                    className="rounded-md border border-brand-200 bg-white px-1.5 py-1 text-[11.5px] font-medium text-ink-700 outline-none"
                    aria-label="Switch demo role"
                  >
                    {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <Link
                href="/notices/"
                className="relative rounded-xl p-2 text-ink-500 hover:bg-ink-100"
                aria-label="Notifications"
              >
                <Bell className="h-5 w-5" />
                {pendingCount > 0 && (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                    {pendingCount}
                  </span>
                )}
              </Link>

              <div className="hidden items-center gap-2.5 border-l border-ink-200 pl-3 sm:flex">
                <Avatar name={user.name} size="sm" />
                <div className="hidden leading-tight xl:block">
                  <p className="text-[13px] font-semibold text-ink-900">{user.name}</p>
                  <p className="text-[11px] text-ink-500">{roleLabel(user.role)}</p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="rounded-xl p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
                aria-label="Sign out"
              >
                <LogOut className="h-4.5 w-4.5" />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  );
}

function SidebarContent({
  sections,
  pathname,
  tenantName,
  role,
  onSignOut,
  userName,
}: {
  sections: ReturnType<typeof navForRole>;
  pathname: string;
  tenantName: string;
  role: Role;
  onSignOut: () => void;
  userName: string;
}) {
  return (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-500 text-[15px] font-bold text-white shadow-lg shadow-brand-500/30">
          ا
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-white">Anjuman</p>
          <p className="text-[10.5px] uppercase tracking-wider text-ink-400">
            Community OS
          </p>
        </div>
      </div>

      <div className="px-3 pt-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-ink-300">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-white">
              {role === "super_admin" ? "Platform Console" : tenantName}
            </p>
            <p className="truncate text-[10.5px] text-ink-400">
              {ROLE_LABEL[role]}
            </p>
          </div>
          <ChevronsUpDown className="h-3.5 w-3.5 text-ink-500" />
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="mb-1.5 px-3 text-[10.5px] font-semibold uppercase tracking-wider text-ink-500">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = iconFor(item.icon);
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard/" && pathname.startsWith(item.href));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-brand-500/15 text-white"
                          : "text-ink-300 hover:bg-white/5 hover:text-white"
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0",
                          active ? "text-brand-400" : "text-ink-400 group-hover:text-ink-200"
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                      {item.badge && (
                        <span className="ml-auto flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand-500 px-1.5 text-[10px] font-semibold text-white">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
          <Avatar name={userName} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-medium text-white">{userName}</p>
            <p className="truncate text-[10.5px] text-ink-400">{ROLE_LABEL[role]}</p>
          </div>
          <button
            onClick={onSignOut}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-white/10 hover:text-white"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </>
  );
}

function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const nav = user
      ? navForRole(user.role).flatMap((s) => s.items.map((i) => ({ ...i, kind: "Page" })))
      : [];
    const people = members
      .filter(
        (m) =>
          !term ||
          m.name.toLowerCase().includes(term) ||
          m.code.toLowerCase().includes(term) ||
          m.phone.includes(term)
      )
      .slice(0, 6)
      .map((m) => ({
        label: m.name,
        href: "/members/",
        icon: "User",
        kind: m.code,
        roles: [],
      }));
    const pages = nav
      .filter((i) => !term || i.label.toLowerCase().includes(term.toLowerCase()))
      .slice(0, 8);
    return { pages, people };
  }, [q, user]);

  if (!open) return null;

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4">
          <Search className="h-4 w-4 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, members, member ID…"
            className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-400"
          />
          <kbd className="rounded-md border border-ink-200 px-1.5 py-0.5 text-[10px] text-ink-400">
            ESC
          </kbd>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.people.length > 0 && (
            <>
              <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
                Members
              </p>
              {results.people.map((p) => (
                <button
                  key={p.label}
                  onClick={() => go(p.href)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-50"
                >
                  <Avatar name={p.label} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-ink-800">{p.label}</p>
                    <p className="text-[11px] text-ink-500">{p.kind}</p>
                  </div>
                  <Command className="ml-auto h-3.5 w-3.5 text-ink-300" />
                </button>
              ))}
            </>
          )}
          <p className="px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-ink-400">
            Pages
          </p>
          {results.pages.map((p) => {
            const Icon = iconFor(p.icon);
            return (
              <button
                key={p.href}
                onClick={() => go(p.href)}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-ink-50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-ink-500">
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-[13px] text-ink-800">{p.label}</span>
                <span className="ml-auto text-[10.5px] text-ink-400">{p.kind}</span>
              </button>
            );
          })}
          {results.pages.length === 0 && results.people.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-ink-500">
              No results for “{q}”
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
