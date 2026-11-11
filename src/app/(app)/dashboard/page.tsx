"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpenCheck,
  Building2,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  HandCoins,
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
import type {
  Approval,
  Complaint,
  Expense,
  Fund,
  Invoice,
  Member,
  Notice,
  Payment,
  Tenant,
} from "@/lib/types";
import {
  getCurrentTenant,
  getDashboard,
  getWorkQueue,
  listApprovals,
  listComplaints,
  listExpenses,
  listFunds,
  listInvoices,
  listMembers,
  listNotices,
  listPayments,
  listTenants,
  submitAdvancePayment,
  type WorkItem,
  type WorkQueue,
} from "@/lib/repo";
import { formatINR, formatDate, periodLabel, cn } from "@/lib/utils";
import { activeTenant } from "@/lib/mock";
import { ReceiptDrawer, receiptOf, type ReceiptInfo } from "@/components/receipt";
import { FinanceOverview } from "@/components/finance-overview";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusPill,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { BarPair, Donut, ProgressBar } from "@/components/charts";

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

export default function DashboardPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (user.role === "super_admin") return <PlatformDashboard />;
  if (user.role === "member") return <MemberDashboard />;
  return <OfficeDashboard />;
}

function LoadingCard() {
  return (
    <Card>
      <div className="p-10 text-center text-[12.5px] text-ink-500">
        Dashboard load ho raha hai…
      </div>
    </Card>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="flex-1">{message}</span>
      <button className="font-semibold underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Office bearers (sadar / khajanchi / secretary / auditor / collector)
   ═══════════════════════════════════════════════════════════════ */

function OfficeDashboard() {
  const { user } = useAuth();
  const isCollector = user?.role === "collector";
  const canApprove =
    user?.role === "sadar" || user?.role === "khajanchi" || user?.role === "auditor";

  const [members, setMembers] = useState<Member[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof getDashboard>> | null>(null);
  const [queue, setQueue] = useState<WorkQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [membersR, invoicesR, paymentsR, expensesR, approvalsR, complaintsR, fundsR, snapR, queueR] =
        await Promise.all([
          listMembers(),
          listInvoices(),
          listPayments(),
          listExpenses(),
          listApprovals(),
          listComplaints(),
          listFunds(),
          getDashboard(),
          getWorkQueue(),
        ]);
      setMembers(membersR);
      setInvoices(invoicesR);
      setPayments(paymentsR);
      setExpenses(expensesR);
      setApprovals(approvalsR);
      setComplaints(complaintsR);
      setFunds(fundsR);
      setSnapshot(snapR);
      setQueue(queueR);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dashboard load nahi ho saka");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");
  const pendingExpenses = expenses.filter((e) => e.status === "pending");

  const topDefaulters = useMemo(() => {
    const totals = new Map<string, number>();
    for (const i of invoices) {
      if (i.status !== "pending" && i.status !== "partial") continue;
      totals.set(i.memberId, (totals.get(i.memberId) ?? 0) + (i.amountPaise - i.paidPaise));
    }
    return [...totals.entries()]
      .map(([memberId, due]) => ({ member: memberMap.get(memberId), due }))
      .filter((x): x is { member: Member; due: number } => Boolean(x.member) && x.due > 0 && x.member?.status === "active")
      .sort((a, b) => b.due - a.due)
      .slice(0, 5);
  }, [invoices, memberMap]);

  const recentReceipts = payments.filter((p) => p.status === "verified").slice(0, 5);

  const monthly = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return {
        label: d.toLocaleString("en-IN", { month: "short" }),
        collected: payments
          .filter((p) => p.status === "verified" && p.createdAt.startsWith(key))
          .reduce((s, p) => s + p.amountPaise, 0),
        spent: expenses
          .filter((e) => e.status === "approved" && e.createdAt.startsWith(key))
          .reduce((s, e) => s + e.amountPaise, 0),
      };
    });
  }, [payments, expenses]);

  const totalBilled = invoices.reduce((s, i) => s + i.amountPaise, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidPaise, 0);
  const collectionRate = totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0;
  const spentThisMonth = expenses
    .filter((e) => e.status === "approved" && e.createdAt.startsWith(CURRENT_MONTH))
    .reduce((s, e) => s + e.amountPaise, 0);
  const balance = funds.reduce((s, f) => s + f.balancePaise, 0);
  const activeMembers = members.filter((m) => m.status === "active").length;
  const households = new Set(members.map((m) => m.household).filter(Boolean)).size;

  const exceptions = useMemo(() => {
    const list: {
      icon: typeof AlertTriangle;
      tone: "amber" | "red" | "blue";
      title: string;
      detail: string;
      href: string;
      cta: string;
    }[] = [];

    const paymentItems = (queue?.items ?? []).filter((i: WorkItem) => i.kind === "payment");
    const pendingPayments = queue?.pendingPayments ?? 0;
    if (pendingPayments > 0) {
      list.push({
        icon: HandCoins,
        tone: "amber",
        title: `${pendingPayments} payment${pendingPayments > 1 ? "s" : ""} waiting for verification`,
        detail:
          paymentItems.length > 0
            ? paymentItems.slice(0, 2).map((i) => `${i.title} · ${i.subtitle}`).join(" · ")
            : "Open collections to match them with the bank statement.",
        href: "/finance/collections/",
        cta: "Verify now",
      });
    }

    if (pendingExpenses.length > 0) {
      list.push({
        icon: Wallet,
        tone: "amber",
        title: `${pendingExpenses.length} expense${pendingExpenses.length > 1 ? "s" : ""} awaiting approval`,
        detail: `${formatINR(pendingExpenses.reduce((s, e) => s + e.amountPaise, 0))} total · ${pendingExpenses[0].category}`,
        href: "/approvals/",
        cta: "Review",
      });
    }

    if (pendingApprovals.length > 0) {
      list.push({
        icon: Clock,
        tone: "blue",
        title: `${pendingApprovals.length} approval${pendingApprovals.length > 1 ? "s" : ""} in the queue`,
        detail: pendingApprovals.slice(0, 2).map((a) => a.title).join(" · "),
        href: "/approvals/",
        cta: "Open queue",
      });
    }

    const openHigh = complaints.filter(
      (c) => c.priority === "high" && c.status !== "resolved" && c.status !== "closed"
    );
    if (openHigh.length > 0) {
      list.push({
        icon: MessageSquareWarning,
        tone: "red",
        title: `${openHigh.length} high-priority complaint${openHigh.length > 1 ? "s" : ""}`,
        detail: openHigh[0].subject,
        href: "/complaints/",
        cta: "Open",
      });
    }

    if (queue && queue.unallocatedPaise > 0) {
      list.push({
        icon: AlertTriangle,
        tone: "red",
        title: `${formatINR(queue.unallocatedPaise)} unallocated`,
        detail: "A verified payment is not fully matched to invoices.",
        href: "/finance/collections/",
        cta: "Fix",
      });
    }

    if (snapshot && !snapshot.ledgerOk) {
      list.push({
        icon: AlertTriangle,
        tone: "red",
        title: "Ledger integrity check failed",
        detail: `Hash mismatch at entry #${snapshot.ledgerBrokenAtSeq}. Run a full audit.`,
        href: "/finance/ledger/",
        cta: "Audit",
      });
    }

    return list;
  }, [queue, pendingExpenses, pendingApprovals, complaints, snapshot]);

  return (
    <>
      <PageHeader
        eyebrow={`${periodLabel(CURRENT_MONTH)} · ${user?.tenantName ?? ""}`}
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

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <FinanceOverview />

      {loading && !snapshot ? (
        <LoadingCard />
      ) : (
        <>
          {/* ── KPI row ─────────────────────────────────────────── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Collected this month"
              value={formatINR(snapshot?.collectedPaise ?? 0)}
              sub={`${payments.filter((p) => p.status === "verified").length} verified receipts`}
              icon={HandCoins}
              tone="green"
              trend={`${collectionRate}% of billed amount`}
            />
            <StatCard
              label="Outstanding dues"
              value={formatINR(snapshot?.outstandingPaise ?? 0)}
              sub={`${topDefaulters.length}+ members pending`}
              icon={Clock}
              tone="amber"
            />
            <StatCard
              label="Spent this month"
              value={formatINR(spentThisMonth)}
              sub="Approved expenses only"
              icon={Wallet}
              tone="blue"
            />
            <StatCard
              label="Cash + bank balance"
              value={formatINR(balance)}
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
                    { label: "Collected", value: totalPaid, color: "#10b981" },
                    { label: "Pending", value: Math.max(totalBilled - totalPaid, 0), color: "#f59e0b" },
                  ]}
                  size={150}
                />
                <div className="mt-5 space-y-3 border-t border-ink-100 pt-4">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-ink-500">Members active</span>
                      <span className="font-medium text-ink-900">{activeMembers}</span>
                    </div>
                    <ProgressBar value={100} />
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between text-[12px]">
                      <span className="text-ink-500">Households covered</span>
                      <span className="font-medium text-ink-900">{households}</span>
                    </div>
                    <ProgressBar value={Math.min(100, households * 4)} tone="amber" />
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
                <BarPair data={monthly} height={200} />
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
                {pendingApprovals.slice(0, 3).map((a) => (
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
                {pendingApprovals.length === 0 && (
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
                  {topDefaulters.map(({ member, due }) => (
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
                  {topDefaulters.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-ink-500">
                        No pending dues — all clear.
                      </td>
                    </tr>
                  )}
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
                  {recentReceipts.map((p) => (
                    <tr key={p.id} className="hover:bg-ink-50/60">
                      <Td>
                        <span className="font-mono text-[11.5px] text-ink-600">
                          {p.receiptNo}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[13px] text-ink-800">
                          {memberMap.get(p.memberId)?.name ?? "—"}
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
                  {recentReceipts.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-8 text-center text-ink-500">
                        No verified receipts yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </TableWrap>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Member portal
   ═══════════════════════════════════════════════════════════════ */

function MemberDashboard() {
  const { user } = useAuth();
  const [member, setMember] = useState<Member | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [advAmount, setAdvAmount] = useState("");
  const [advMethod, setAdvMethod] = useState<Payment["method"]>("upi");
  const [advRef, setAdvRef] = useState("");
  const [advBusy, setAdvBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [memberRows, invoiceRows, paymentRows, noticeRows, tenantRow] = await Promise.all([
        listMembers(),
        listInvoices(),
        listPayments(),
        listNotices(),
        getCurrentTenant(),
      ]);
      const me =
        memberRows.find((m) => m.id === user?.memberId) ??
        memberRows.find((m) => m.phone && m.phone === user?.phone) ??
        (user?.role === "member" ? memberRows[0] ?? null : null);
      setMember(me);
      setTenant(tenantRow);
      if (me) {
        setInvoices(invoiceRows.filter((i) => i.memberId === me.id));
        setPayments(paymentRows.filter((p) => p.memberId === me.id));
      }
      setNotices(noticeRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aapka account load nahi ho saka");
    } finally {
      setLoading(false);
    }
  }, [user?.memberId, user?.phone, user?.role]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingCard />;
  if (!member) {
    return (
      <Card>
        <div className="p-10 text-center">
          <Users className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-2 text-[13.5px] font-medium text-ink-800">
            Aapka member record nahi mila
          </p>
          <p className="mt-1 text-[12px] text-ink-500">
            Sadar se sampark karein taake aapka account member list se link ho jaye.
          </p>
        </div>
      </Card>
    );
  }

  const due = invoices
    .filter((i) => i.status !== "paid" && i.status !== "waived")
    .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
  const paid = invoices.reduce((s, i) => s + i.paidPaise, 0);

  async function submitAdvance() {
    if (!member) return;
    const paise = Math.round((Number(advAmount) || 0) * 100);
    if (paise <= 0) {
      toast("Amount daalo", "error");
      return;
    }
    setAdvBusy(true);
    try {
      await submitAdvancePayment({
        memberId: member.id,
        amountPaise: paise,
        method: advMethod,
        reference: advRef,
        note: "Advance payment",
      });
      toast("Payment submit ho gayi — Sadar aur Khajanchi dono approve karenge");
      setAdvAmount("");
      setAdvRef("");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment submit nahi hui", "error");
    } finally {
      setAdvBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="My account"
        title={`As-salamu alaykum, ${member.name.split(" ")[0]}`}
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

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      <FinanceOverview allowMemberList={false} />

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
                <Avatar name={member.name} size="lg" />
                <div>
                  <p className="text-lg font-semibold">{member.name}</p>
                  <p className="text-[12.5px] text-ink-300">
                    {member.fatherName} · {member.mohalla}
                  </p>
                  <p className="mt-1 font-mono text-[11.5px] text-brand-300">
                    {member.code}
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
                  {formatINR(member.feePaise)}
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
                Payment history ({payments.length})
              </p>
              <p className="text-[11.5px] text-ink-400">Slip dobara download karo</p>
            </div>
            <div className="space-y-2">
              {payments.map((p) => (
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
                  {p.status === "verified" && (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-[11.5px] font-medium text-brand-700 hover:bg-brand-50"
                      onClick={() => setReceipt(receiptOf({ ...p, member }))}
                      title="Download / share receipt"
                    >
                      <Download className="h-3.5 w-3.5" /> Slip
                    </button>
                  )}
                </div>
              ))}
              {payments.length === 0 && (
                <p className="py-6 text-center text-sm text-ink-500">
                  No payments recorded yet.
                </p>
              )}
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Advance payment"
              subtitle="Apni taraf se payment — Sadar + Khajanchi approve karenge"
            />
            <div className="space-y-3 p-5">
              <Field label="Amount (₹)">
                <Input
                  value={advAmount}
                  onChange={(e) => setAdvAmount(e.target.value.replace(/[^\d.]/g, ""))}
                  inputMode="decimal"
                  placeholder="500"
                />
              </Field>
              <Field label="Method">
                <Select
                  value={advMethod}
                  onChange={(e) => setAdvMethod(e.target.value as Payment["method"])}
                >
                  <option value="upi">UPI</option>
                  <option value="cash">Cash</option>
                  <option value="cheque">Cheque</option>
                  <option value="gateway">Gateway</option>
                </Select>
              </Field>
              <Field label="Reference / note">
                <Input
                  value={advRef}
                  onChange={(e) => setAdvRef(e.target.value)}
                  placeholder="UPI transaction id"
                />
              </Field>
              <Button
                className="w-full"
                onClick={() => void submitAdvance()}
                loading={advBusy}
              >
                <CreditCard className="h-4 w-4" /> Submit for approval
              </Button>
              <p className="text-[11px] leading-relaxed text-ink-500">
                Pending rahegi jab tak Sadar aur Khajanchi dono approve na karein.
                Receipt sirf verify hone ke baad banti hai.
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Dues" subtitle="Pay before the 10th" />
            <div className="divide-y divide-ink-100">
              {invoices
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
              {notices.length === 0 && (
                <p className="px-5 py-6 text-sm text-ink-500">No notices yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <ReceiptDrawer
        receipt={receipt}
        tenant={tenant ?? activeTenant}
        onClose={() => setReceipt(null)}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Super admin — platform console
   ═══════════════════════════════════════════════════════════════ */

function PlatformDashboard() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tenantRows, memberRows] = await Promise.all([listTenants(), listMembers()]);
      setTenants(tenantRows);
      setMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Platform data load nahi ho saka");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memberCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of members) {
      if (m.status !== "active") continue;
      map.set(m.tenantId, (map.get(m.tenantId) ?? 0) + 1);
    }
    return map;
  }, [members]);

  const countOf = (t: Tenant) => memberCounts.get(t.id) ?? t.membersCount;

  const mrr = tenants
    .filter((t) => t.status === "active")
    .reduce((s, t) => s + (t.planCycle === "yearly" ? t.planAmountPaise / 12 : t.planAmountPaise), 0);
  const totalMembers = tenants.reduce((s, t) => s + countOf(t), 0);
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

      {error && <ErrorBanner message={error} onRetry={() => void load()} />}

      {loading && tenants.length === 0 ? (
        <LoadingCard />
      ) : (
        <>
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
                            : `${formatINR(t.planAmountPaise)}/${t.planCycle === "monthly" ? "mo" : "yr"}`}
                        </Badge>
                      </Td>
                      <Td>{countOf(t)}</Td>
                      <Td>
                        <StatusPill status={t.status} />
                      </Td>
                      <Td className="text-right text-[12px] text-ink-500">
                        {t.expiresAt ? formatDate(t.expiresAt) : "—"}
                      </Td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-ink-500">
                        No anjumans registered yet.
                      </td>
                    </tr>
                  )}
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
      )}
    </>
  );
}
