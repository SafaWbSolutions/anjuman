"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  HandCoins,
  Home,
  IdCard,
  Layers,
  MessageSquareWarning,
  ReceiptText,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  members,
  invoices,
  payments,
  expenses,
  approvals,
  complaints,
  notices,
  stats,
  monthlySeries,
  topDefaulters,
  pendingPayments,
  funds,
  tenants,
} from "@/lib/mock";
import {
  formatINR,
  formatDate,
  periodLabel,
  cn,
  currentPeriod,
} from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  StatCard,
  StatusPill,
  TableWrap,
  Td,
  Th,
} from "@/components/ui";
import { BarPair, Donut, ProgressBar } from "@/components/charts";
import { memberById } from "@/lib/mock";

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "super_admin") return <PlatformDashboard />;
  if (user.role === "member") return <MemberDashboard />;
  return <OfficeDashboard />;
}

/* ═══════════════════════════════════════════════════════════════
   Office bearers (sadar / khajanchi / secretary / auditor / collector)
   ═══════════════════════════════════════════════════════════════ */

function OfficeDashboard() {
  const { user } = useAuth();
  const isCollector = user?.role === "collector";
  const canApprove =
    user?.role === "sadar" || user?.role === "khajanchi" || user?.role === "auditor";

  const exceptions = useMemo(() => {
    const list: {
      icon: typeof AlertTriangle;
      tone: "amber" | "red" | "blue";
      title: string;
      detail: string;
      href: string;
      cta: string;
    }[] = [];

    if (pendingPayments.length) {
      list.push({
        icon: HandCoins,
        tone: "amber",
        title: `${pendingPayments.length} payments waiting for verification`,
        detail: pendingPayments
          .map((p) => `${memberById(p.memberId)?.name ?? "Member"} · ${formatINR(p.amountPaise)}`)
          .join(" · "),
        href: "/finance/collections/",
        cta: "Verify now",
      });
    }
    const pendingExp = expenses.filter((e) => e.status === "pending");
    if (pendingExp.length) {
      list.push({
        icon: Wallet,
        tone: "amber",
        title: `${pendingExp.length} expense${pendingExp.length > 1 ? "s" : ""} awaiting approval`,
        detail: `${formatINR(pendingExp.reduce((s, e) => s + e.amountPaise, 0))} total · ${pendingExp[0].category}`,
        href: "/approvals/",
        cta: "Review",
      });
    }
    const openHigh = complaints.filter(
      (c) => c.priority === "high" && c.status !== "resolved" && c.status !== "closed"
    );
    if (openHigh.length) {
      list.push({
        icon: MessageSquareWarning,
        tone: "red",
        title: `${openHigh.length} high-priority complaint${openHigh.length > 1 ? "s" : ""}`,
        detail: openHigh[0].subject,
        href: "/complaints/",
        cta: "Open",
      });
    }
    const brokenChain = false; // demo: chain verified
    if (brokenChain) {
      list.push({
        icon: AlertTriangle,
        tone: "red",
        title: "Ledger integrity check failed",
        detail: "A hash mismatch was detected. Run a full audit.",
        href: "/finance/ledger/",
        cta: "Audit",
      });
    }
    return list;
  }, []);

  return (
    <>
      <PageHeader
        eyebrow={`${periodLabel(currentPeriod())} · ${user?.tenantName ?? ""}`}
        title={`As-salamu alaykum, ${user?.name?.split(" ")[0] ?? "ji"}`}
        description={
          isCollector
            ? "Your collection route for today, plus anything that needs a receipt."
            : "Only things that need your attention are shown here. Everything else is running automatically."
        }
        actions={
          <>
            <Link href="/finance/collections/">
              <Button variant="secondary" size="md">
                <ReceiptText className="h-4 w-4" /> Collect payment
              </Button>
            </Link>
            <Link href="/members/">
              <Button size="md">
                <UserPlus className="h-4 w-4" /> Add member
              </Button>
            </Link>
          </>
        }
      />

      {/* ── KPI row ─────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected this month"
          value={formatINR(stats.collected)}
          sub={`${stats.verifiedPayments} verified receipts`}
          icon={HandCoins}
          tone="green"
          trend={`${stats.collectionRate}% of billed amount`}
        />
        <StatCard
          label="Outstanding dues"
          value={formatINR(stats.pending)}
          sub={`${topDefaulters.length}+ members pending`}
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="Spent this month"
          value={formatINR(stats.spent)}
          sub="Approved expenses only"
          icon={Wallet}
          tone="blue"
        />
        <StatCard
          label="Cash + bank balance"
          value={formatINR(stats.balance)}
          sub={`${funds.length} funds · reconciled`}
          icon={BookOpenCheck}
          tone="brand"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* ── Needs attention ─────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Needs your attention"
            subtitle="Everything else is automated — dues, reminders, receipts and reconciliation."
            action={
              exceptions.length === 0 ? (
                <Badge tone="green" dot>
                  All clear
                </Badge>
              ) : (
                <Badge tone="amber" dot>
                  {exceptions.length} item{exceptions.length > 1 ? "s" : ""}
                </Badge>
              )
            }
          />
          <div className="divide-y divide-ink-100">
            {exceptions.length === 0 && (
              <div className="flex items-center gap-3 px-5 py-8 text-sm text-ink-500">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Nothing pending. The ledger is balanced and all receipts are
                verified.
              </div>
            )}
            {exceptions.map((e) => {
              const Icon = e.icon;
              return (
                <div
                  key={e.title}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
                      e.tone === "amber" && "bg-amber-50 text-amber-600 ring-amber-200",
                      e.tone === "red" && "bg-red-50 text-red-600 ring-red-200",
                      e.tone === "blue" && "bg-blue-50 text-blue-600 ring-blue-200"
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium text-ink-900">
                      {e.title}
                    </p>
                    <p className="truncate text-[12px] text-ink-500">{e.detail}</p>
                  </div>
                  <Link
                    href={e.href}
                    className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700 hover:text-brand-800"
                  >
                    {e.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ── Collection rate donut ───────────────────────── */}
        <Card>
          <CardHeader title="Collection health" subtitle="Current billing cycle" />
          <div className="p-5">
            <Donut
              segments={[
                { label: "Collected", value: 100 - 100 + stats.collectionRate, color: "#10b981" },
                { label: "Pending", value: Math.max(100 - stats.collectionRate, 0), color: "#f59e0b" },
              ]}
              size={150}
            />
            <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-ink-500">Members active</span>
                  <span className="font-medium text-ink-900">
                    {stats.membersCount}
                  </span>
                </div>
                <ProgressBar value={100} />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-[12px]">
                  <span className="text-ink-500">Households covered</span>
                  <span className="font-medium text-ink-900">
                    {stats.households}
                  </span>
                </div>
                <ProgressBar value={82} tone="amber" />
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        {/* ── Chart ───────────────────────────────────────── */}
        <Card className="xl:col-span-2">
          <CardHeader
            title="Collections vs expenses"
            subtitle="Last 6 months"
            action={
              <Link
                href="/finance/reports/"
                className="inline-flex items-center gap-1 text-[12.5px] font-medium text-brand-700"
              >
                Full report <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <div className="p-5">
            <BarPair data={monthlySeries} height={200} />
          </div>
        </Card>

        {/* ── Pending approvals ───────────────────────────── */}
        <Card>
          <CardHeader
            title="Approvals"
            subtitle="Maker–checker queue"
            action={
              <Link
                href="/approvals/"
                className="text-[12.5px] font-medium text-brand-700"
              >
                View all
              </Link>
            }
          />
          <div className="divide-y divide-ink-100">
            {approvals.slice(0, 3).map((a) => (
              <div key={a.id} className="px-5 py-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[13px] font-medium text-ink-900">
                    {a.title}
                  </p>
                  <Badge tone="amber">
                    {a.step}/{a.totalSteps}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-[11.5px] text-ink-500">
                  {a.subtitle}
                </p>
                <p className="mt-1 text-[11px] text-ink-400">
                  {a.requestedBy} · {formatDate(a.requestedAt)}
                </p>
              </div>
            ))}
            {approvals.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-ink-500">
                No pending approvals
              </p>
            )}
          </div>
          {canApprove && (
            <div className="border-t border-ink-100 p-3">
              <Link href="/approvals/">
                <Button variant="soft" className="w-full" size="sm">
                  Review queue
                </Button>
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* ── Defaulters + recent ───────────────────────────── */}
      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Top pending dues"
            subtitle="Members with the highest outstanding balance"
            action={
              <Link
                href="/members/"
                className="text-[12.5px] font-medium text-brand-700"
              >
                All members
              </Link>
            }
          />
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Member</Th>
                <Th>Member ID</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {topDefaulters.slice(0, 5).map(({ member, due }) => (
                <tr key={member.id} className="hover:bg-ink-50/60">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={member.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink-900">
                          {member.name}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          {member.mohalla}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <span className="font-mono text-[11.5px] text-ink-600">
                      {member.code}
                    </span>
                  </Td>
                  <Td className="text-right">
                    <span className="font-medium text-amber-700">
                      {formatINR(due)}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader
            title="Recent receipts"
            subtitle="Latest verified collections"
            action={
              <Link
                href="/finance/collections/"
                className="text-[12.5px] font-medium text-brand-700"
              >
                Open
              </Link>
            }
          />
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Receipt</Th>
                <Th>Member</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {payments.slice(0, 5).map((p) => (
                <tr key={p.id} className="hover:bg-ink-50/60">
                  <Td>
                    <span className="font-mono text-[11.5px] text-ink-600">
                      {p.receiptNo}
                    </span>
                  </Td>
                  <Td>
                    <span className="text-[13px] text-ink-800">
                      {memberById(p.memberId)?.name ?? "—"}
                    </span>
                  </Td>
                  <Td>
                    <Badge tone="slate">{p.method.toUpperCase()}</Badge>
                  </Td>
                  <Td className="text-right font-medium">
                    {formatINR(p.amountPaise)}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Member portal
   ═══════════════════════════════════════════════════════════════ */

function MemberDashboard() {
  const { user } = useAuth();
  const me = members.find((m) => m.id === user?.id) ?? members[0];
  const myInvoices = invoices.filter((i) => i.memberId === me.id);
  const due = myInvoices
    .filter((i) => i.status !== "paid" && i.status !== "waived")
    .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
  const paid = myInvoices.reduce((s, i) => s + i.paidPaise, 0);
  const myPayments = payments.filter((p) => p.memberId === me.id);

  return (
    <>
      <PageHeader
        eyebrow="My account"
        title={`As-salamu alaykum, ${me.name.split(" ")[0]}`}
        description="Your membership, dues and receipts — always up to date."
        actions={
          <>
            <Link href="/id-cards/">
              <Button variant="secondary">
                <IdCard className="h-4 w-4" /> My ID card
              </Button>
            </Link>
            <Button>
              <CreditCard className="h-4 w-4" /> Pay dues
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="relative bg-ink-900 p-6 text-white">
            <div
              className="pointer-events-none absolute inset-0 opacity-50"
              style={{
                backgroundImage:
                  "radial-gradient(600px 300px at 80% 0%, rgba(16,185,129,.4), transparent 60%)",
              }}
            />
            <div className="relative flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <Avatar name={me.name} size="lg" />
                <div>
                  <p className="text-lg font-semibold">{me.name}</p>
                  <p className="text-[12.5px] text-ink-300">
                    {me.fatherName} · {me.mohalla}
                  </p>
                  <p className="mt-1 font-mono text-[11.5px] text-brand-300">
                    {me.code}
                  </p>
                </div>
              </div>
              <Badge tone="green" dot>
                Active member
              </Badge>
            </div>
            <div className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-[12px]">
              <div>
                <p className="text-ink-400">Monthly chanda</p>
                <p className="mt-0.5 text-base font-semibold">
                  {formatINR(me.feePaise)}
                </p>
              </div>
              <div>
                <p className="text-ink-400">Total paid</p>
                <p className="mt-0.5 text-base font-semibold">
                  {formatINR(paid)}
                </p>
              </div>
              <div>
                <p className="text-ink-400">Outstanding</p>
                <p
                  className={cn(
                    "mt-0.5 text-base font-semibold",
                    due > 0 ? "text-amber-300" : "text-brand-300"
                  )}
                >
                  {formatINR(due)}
                </p>
              </div>
            </div>
          </div>
          <div className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink-800">
                Payment history
              </p>
              <Link
                href="/finance/collections/"
                className="text-[12px] font-medium text-brand-700"
              >
                View all
              </Link>
            </div>
            <div className="space-y-2">
              {myPayments.slice(0, 4).map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border border-ink-100 px-3.5 py-2.5"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink-900">
                      {periodLabel(p.createdAt.slice(0, 7))} chanda
                    </p>
                    <p className="text-[11px] text-ink-500">
                      {p.receiptNo} · {p.method.toUpperCase()}
                    </p>
                  </div>
                  <span className="text-[13px] font-medium text-ink-900">
                    {formatINR(p.amountPaise)}
                  </span>
                </div>
              ))}
              {myPayments.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-500">
                  No payments recorded yet.
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Dues" subtitle="Pay before the 10th" />
            <div className="divide-y divide-ink-100">
              {myInvoices
                .filter((i) => i.status !== "paid" && i.status !== "waived")
                .slice(0, 4)
                .map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between px-5 py-3"
                  >
                    <div>
                      <p className="text-[13px] font-medium text-ink-900">
                        {periodLabel(i.period)}
                      </p>
                      <p className="text-[11px] text-ink-500">
                        Due {formatDate(i.dueDate)}
                      </p>
                    </div>
                    <span className="text-[13px] font-medium text-amber-700">
                      {formatINR(i.amountPaise - i.paidPaise)}
                    </span>
                  </div>
                ))}
              {due === 0 && (
                <div className="flex items-center gap-2 px-5 py-6 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> All dues cleared. Jazak
                  Allah khair.
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Notices" subtitle="From your committee" />
            <div className="divide-y divide-ink-100">
              {notices.slice(0, 3).map((n) => (
                <Link
                  key={n.id}
                  href="/notices/"
                  className="block px-5 py-3 hover:bg-ink-50/70"
                >
                  <div className="flex items-center gap-2">
                    {n.pinned && <Badge tone="brand">Pinned</Badge>}
                    <p className="text-[13px] font-medium text-ink-900">
                      {n.title}
                    </p>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] text-ink-500">
                    {n.body}
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Super admin — platform console
   ═══════════════════════════════════════════════════════════════ */

function PlatformDashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const mrr = tenants
    .filter((t) => t.status === "active")
    .reduce((s, t) => s + (t.planCycle === "yearly" ? t.planAmountPaise / 12 : t.planAmountPaise), 0);
  const totalMembers = tenants.reduce((s, t) => s + t.membersCount, 0);
  const expiring = tenants.filter((t) => t.status !== "active");

  return (
    <>
      <PageHeader
        eyebrow="Platform console"
        title="Anjuman network"
        description="Every registered committee, subscription status and integration health in one place."
        actions={
          <Link href="/platform/tenants/">
            <Button>
              <Building2 className="h-4 w-4" /> Manage anjumans
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered anjumans"
          value={String(tenants.length)}
          sub={`${tenants.filter((t) => t.status === "active").length} active · ${tenants.filter((t) => t.status === "trial").length} trial`}
          icon={Building2}
          tone="brand"
        />
        <StatCard
          label="Platform MRR"
          value={formatINR(Math.round(mrr))}
          sub="Recurring subscription revenue"
          icon={TrendingUp}
          tone="green"
          trend="+1 anjuman this month"
        />
        <StatCard
          label="Total members served"
          value={totalMembers.toLocaleString("en-IN")}
          sub="Across all committees"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Needs action"
          value={String(expiring.length)}
          sub="Expired or read-only accounts"
          icon={AlertTriangle}
          tone="amber"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Anjuman accounts"
            subtitle="Plan, status and expiry"
            action={
              <Link
                href="/platform/tenants/"
                className="text-[12.5px] font-medium text-brand-700"
              >
                Open console
              </Link>
            }
          />
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Anjuman</Th>
                <Th>Plan</Th>
                <Th>Members</Th>
                <Th>Status</Th>
                <Th className="text-right">Expiry</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-ink-50/60">
                  <Td>
                    <div>
                      <p className="text-[13px] font-medium text-ink-900">
                        {t.name}
                      </p>
                      <p className="text-[11px] text-ink-500">
                        {t.village}, {t.district}
                      </p>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={t.planType === "free" ? "slate" : "brand"}>
                      {t.planType === "free"
                        ? "Free"
                        : formatINR(t.planAmountPaise) + "/yr"}
                    </Badge>
                  </Td>
                  <Td>{t.membersCount}</Td>
                  <Td>
                    <StatusPill status={t.status} />
                  </Td>
                  <Td className="text-right text-[12px] text-ink-500">
                    {t.expiresAt ? formatDate(t.expiresAt) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Platform health" subtitle="Last 24 hours" />
            <div className="space-y-3.5 p-5 text-[12.5px]">
              {[
                { label: "Database (Supabase)", value: "99.98%", ok: true },
                { label: "API p95 latency", value: "142 ms", ok: true },
                { label: "Storage (R2)", value: "1.2 GB used", ok: true },
                { label: "Payment webhooks", value: "0 failures", ok: true },
                { label: "Backup (last run)", value: "Today 03:00", ok: true },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between">
                  <span className="text-ink-500">{r.label}</span>
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink-900">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Quick actions" />
            <div className="grid gap-2 p-4">
              {[
                { href: "/platform/tenants/", label: "Onboard new anjuman", icon: Building2 },
                { href: "/platform/plans/", label: "Edit plans & pricing", icon: Layers },
                { href: "/platform/billing/", label: "Billing gateway keys", icon: CreditCard },
                { href: "/finance/reports/", label: "Export platform report", icon: BarChart3 },
              ].map((a) => {
                const Icon = a.icon;
                return (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex items-center gap-2.5 rounded-xl border border-ink-100 px-3 py-2.5 text-[13px] text-ink-700 transition hover:border-brand-200 hover:bg-brand-50/50"
                  >
                    <Icon className="h-4 w-4 text-ink-400" />
                    {a.label}
                    <ArrowRight className="ml-auto h-3.5 w-3.5 text-ink-300" />
                  </Link>
                );
              })}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
