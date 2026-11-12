"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileSpreadsheet,
  FileText,
  Landmark,
  Loader2,
  Printer,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { Donation, Expense, Fund, Invoice, LedgerEntry, Member, Payment } from "@/lib/types";
import {
  listDonations,
  listExpenses,
  listFunds,
  listInvoices,
  listLedger,
  listMembers,
  listPayments,
  queueReminders,
} from "@/lib/repo";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Select,
  StatCard,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { BarPair } from "@/components/charts";
import {
  cn,
  currentPeriod,
  downloadCSV,
  formatDate,
  formatINR,
  periodLabel,
  printArea,
  shiftPeriod,
} from "@/lib/utils";

type ReportId = "monthly" | "fund" | "ageing" | "expense" | "audit" | "annual";

const REPORTS: { id: ReportId; name: string; desc: string; icon: typeof FileText }[] = [
  { id: "monthly", name: "Monthly collection statement", desc: "Billed vs collected vs outstanding for a month", icon: FileText },
  { id: "fund", name: "Fund-wise statement", desc: "Receipts, payments and closing per fund", icon: Landmark },
  { id: "ageing", name: "Dues ageing", desc: "Members grouped by 0–30 / 31–60 / 61–90 / 90+ days", icon: Users },
  { id: "expense", name: "Expense register", desc: "Category-wise expenses with bill references", icon: Wallet },
  { id: "audit", name: "Audit pack", desc: "Every ledger entry with its hash, in order", icon: FileSpreadsheet },
  { id: "annual", name: "Annual report", desc: "Month-by-month summary for the general body", icon: TrendingUp },
];

/** Whole days between an ISO date and today (never negative). */
function daysSince(iso: string) {
  const d = new Date(iso).getTime();
  if (Number.isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d) / 86_400_000));
}

/** Fallback due date when an invoice row has none: the 10th of its month. */
function invoiceDue(inv: Invoice) {
  return inv.dueDate || `${inv.period}-10`;
}

const AGE_BUCKETS = [
  { label: "0–30 days", max: 30, tone: "bg-emerald-500" },
  { label: "31–60 days", max: 60, tone: "bg-amber-500" },
  { label: "61–90 days", max: 90, tone: "bg-orange-500" },
  { label: "90+ days", max: Infinity, tone: "bg-red-500" },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [funds, setFunds] = useState<Fund[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [f, i, p, e, m, d, l] = await Promise.all([
        listFunds(),
        listInvoices(),
        listPayments(),
        listExpenses(),
        listMembers(),
        listDonations(),
        listLedger(1000),
      ]);
      setFunds(f);
      setInvoices(i);
      setPayments(p);
      setExpenses(e);
      setMembers(m);
      setDonations(d);
      setLedger(l);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reports load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  // ── Period options: what the data actually contains + current ────
  const periodOptions = useMemo(() => {
    const set = new Set<string>([currentPeriod(), period]);
    for (const i of invoices) set.add(i.period);
    for (const p of payments) set.add((p.settledAt ?? p.createdAt).slice(0, 7));
    for (const d of donations) set.add((d.verifiedAt ?? d.createdAt).slice(0, 7));
    for (const e of expenses) set.add((e.approvedAt ?? e.createdAt).slice(0, 7));
    return [...set].filter(Boolean).sort().reverse().slice(0, 14);
  }, [invoices, payments, donations, expenses, period]);

  // ── Money in / out for a period ──────────────────────────────────
  const collectedFor = useCallback(
    (p: string) =>
      payments
        .filter(
          (x) =>
            x.status === "verified" &&
            (x.settledAt ?? x.createdAt).startsWith(p)
        )
        .reduce((s, x) => s + x.amountPaise, 0) +
      donations
        .filter(
          (x) =>
            x.status === "verified" &&
            (x.verifiedAt ?? x.createdAt).startsWith(p)
        )
        .reduce((s, x) => s + x.amountPaise, 0),
    [payments, donations]
  );
  const spentFor = useCallback(
    (p: string) =>
      expenses
        .filter(
          (x) =>
            x.status === "approved" &&
            (x.approvedAt ?? x.createdAt).startsWith(p)
        )
        .reduce((s, x) => s + x.amountPaise, 0),
    [expenses]
  );

  const billedFor = useMemo(
    () => invoices.filter((i) => i.period === period && i.status !== "waived").reduce((s, i) => s + i.amountPaise, 0),
    [invoices, period]
  );
  const collected = collectedFor(period);
  const spent = spentFor(period);

  const totalBilled = invoices.filter((i) => i.status !== "waived").reduce((s, i) => s + i.amountPaise, 0);
  const totalPaid = invoices.reduce((s, i) => s + i.paidPaise, 0);

  const monthlySeries = useMemo(
    () =>
      Array.from({ length: 6 }, (_, idx) => {
        const p = shiftPeriod(currentPeriod(), idx - 5);
        return {
          label: periodLabel(p).split(" ")[0],
          collected: collectedFor(p),
          spent: spentFor(p),
        };
      }),
    [collectedFor, spentFor]
  );

  // ── Outstanding dues, bucketed by age ────────────────────────────
  const outstanding = useMemo(
    () =>
      invoices
        .filter((i) => i.status !== "waived" && memberMap.get(i.memberId)?.status === "active")
        .map((i) => ({ invoice: i, due: Math.max(0, i.amountPaise - i.paidPaise) }))
        .filter((x) => x.due > 0),
    [invoices, memberMap]
  );

  const ageing = useMemo(() => {
    const total = outstanding.reduce((s, x) => s + x.due, 0) || 1;
    return AGE_BUCKETS.map((b, idx) => {
      const min = idx === 0 ? -1 : AGE_BUCKETS[idx - 1].max;
      const amount = outstanding
        .filter((x) => {
          const days = daysSince(invoiceDue(x.invoice));
          return days > min && days <= b.max;
        })
        .reduce((s, x) => s + x.due, 0);
      return { ...b, amount, pct: Math.round((amount / total) * 100) };
    });
  }, [outstanding]);

  const topOutstanding = useMemo(() => {
    const byMember = new Map<string, { due: number; oldest: string }>();
    for (const { invoice, due } of outstanding) {
      const cur = byMember.get(invoice.memberId);
      if (!cur) byMember.set(invoice.memberId, { due, oldest: invoice.period });
      else {
        cur.due += due;
        if (invoice.period < cur.oldest) cur.oldest = invoice.period;
      }
    }
    return [...byMember.entries()]
      .map(([memberId, v]) => ({ member: memberMap.get(memberId), ...v }))
      .filter((x) => x.member)
      .sort((a, b) => b.due - a.due)
      .slice(0, 6);
  }, [outstanding, memberMap]);

  const totalOutstanding = outstanding.reduce((s, x) => s + x.due, 0);

  // ── CSV export per report ────────────────────────────────────────
  function rowsFor(id: ReportId): (string | number)[][] {
    switch (id) {
      case "monthly":
        return [
          ["Period", "Billed", "Collected", "Outstanding"],
          ...periodOptions.map((p) => {
            const billed = invoices.filter((i) => i.period === p && i.status !== "waived").reduce((s, i) => s + i.amountPaise, 0);
            const coll = collectedFor(p);
            const due = invoices
              .filter((i) => i.period === p && i.status !== "waived")
              .reduce((s, i) => s + Math.max(0, i.amountPaise - i.paidPaise), 0);
            return [periodLabel(p), billed / 100, coll / 100, due / 100];
          }),
        ];
      case "fund":
        return [
          ["Fund", "Restricted", "Receipts", "Payments", "Closing"],
          ...funds.map((f) => {
            const donationIn = donations
              .filter((d) => d.status === "verified" && d.fundId === f.id)
              .reduce((s, d) => s + d.amountPaise, 0);
            const feeIn =
              f.code === "GEN"
                ? payments
                    .filter((p) => p.status === "verified")
                    .reduce((s, p) => s + p.amountPaise, 0)
                : 0;
            const spent = expenses
              .filter((e) => e.status === "approved" && e.fundId === f.id)
              .reduce((s, e) => s + e.amountPaise, 0);
            return [
              f.name,
              f.restricted ? "Yes" : "No",
              (donationIn + feeIn) / 100,
              spent / 100,
              f.balancePaise / 100,
            ];
          }),
        ];
      case "ageing":
        return [
          ["Bucket", "Amount", "Share %"],
          ...ageing.map((b) => [b.label, b.amount / 100, b.pct]),
        ];
      case "expense":
        return [
          ["Date", "Category", "Fund", "Vendor", "Status", "Amount"],
          ...expenses.map((e) => [
            e.createdAt.slice(0, 10),
            e.category,
            e.fundName,
            e.vendor,
            e.status,
            e.amountPaise / 100,
          ]),
        ];
      case "audit":
        return [
          ["Seq", "Date", "Account", "Narration", "Debit", "Credit", "Ref", "Hash"],
          ...[...ledger].reverse().map((l) => [
            l.refNo,
            l.date,
            l.account,
            l.narration,
            l.debitPaise / 100,
            l.creditPaise / 100,
            l.refType,
            l.hash,
          ]),
        ];
      case "annual":
        return [
          ["Month", "Collected", "Spent", "Net"],
          ...monthlySeries.map((m, idx) => {
            const p = shiftPeriod(currentPeriod(), idx - 5);
            return [periodLabel(p), m.collected / 100, m.spent / 100, (m.collected - m.spent) / 100];
          }),
        ];
    }
  }

  function exportReport(id: ReportId, name: string, format: "csv" | "print") {
    if (format === "print") {
      printArea();
      return;
    }
    setBusy(`${id}-csv`);
    try {
      downloadCSV(`anjuman-${id}-${period}.csv`, rowsFor(id));
      toast(`${name} — Excel (CSV) download ho gaya`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Export failed", "error");
    } finally {
      setBusy(null);
    }
  }

  async function sendReminders() {
    setBusy("reminders");
    try {
      const r = await queueReminders(period, true);
      if (r.reason === "demo_mode") {
        toast("Demo mode — reminders queue nahi hote");
      } else if (r.reason === "reminders_disabled") {
        toast("Reminders settings me band hain", "error");
      } else {
        toast(`${r.created} reminder${r.created === 1 ? "" : "s"} queue ho gaye`);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reminders queue nahi ho sake", "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Finance" title="Reports" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-16 text-[13px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Reports taiyaar ho rahe hain…
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Reports"
        description="One-click statements for the committee, the auditor and the general body. Every number ties back to the ledger."
        actions={
          <Select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-auto py-2 text-[12.5px]"
          >
            {periodOptions.map((p) => (
              <option key={p} value={p}>
                {periodLabel(p)}
              </option>
            ))}
          </Select>
        }
      />

      {/* ── Printable statement ───────────────────────────── */}
      <div className="print-area">
        <div className="hidden print:block">
          <div className="mb-3 border-b-2 border-black pb-2">
            <p className="text-[15px] font-bold">Anjuman — Financial statement</p>
            <p className="text-[11px]">
              {periodLabel(period)} · generated {formatDate(new Date().toISOString(), true)}
            </p>
          </div>
        </div>

      {error && (
        <div className="no-print mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label={`Billed · ${periodLabel(period)}`}
          value={formatINR(billedFor)}
          sub={`${invoices.filter((i) => i.period === period).length} invoices`}
          icon={FileText}
          tone="slate"
        />
        <StatCard
          label={`Collected · ${periodLabel(period)}`}
          value={formatINR(collected)}
          sub="Chanda + donations"
          icon={Wallet}
          tone="green"
        />
        <StatCard
          label={`Spent · ${periodLabel(period)}`}
          value={formatINR(spent)}
          sub="Approved expenses"
          icon={TrendingUp}
          tone="blue"
        />
        <StatCard
          label="Collection rate"
          value={`${billedFor ? Math.round((collected / billedFor) * 100) : 0}%`}
          sub="Collected ÷ billed"
          icon={Users}
          tone="brand"
        />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Monthly trend"
            subtitle="Collections vs expenses"
            action={<Badge tone="brand">Last 6 months</Badge>}
          />
          <div className="p-5">
            <BarPair data={monthlySeries} height={220} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Fund position" subtitle="Closing balances" />
          <div className="divide-y divide-ink-100">
            {funds.length === 0 ? (
              <p className="px-5 py-6 text-center text-[12.5px] text-ink-400">Koi fund nahi</p>
            ) : (
              funds.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-800">{f.name}</p>
                    <p className="text-[10.5px] text-ink-400">
                      {f.restricted ? "Restricted" : "Unrestricted"}
                    </p>
                  </div>
                  <span className="text-[12.5px] font-medium text-ink-900">{formatINR(f.balancePaise)}</span>
                </div>
              ))
            )}
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/60 px-5 py-3">
            <span className="text-[12.5px] font-semibold text-ink-700">Total</span>
            <span className="text-[13px] font-semibold text-ink-900">
              {formatINR(funds.reduce((s, f) => s + f.balancePaise, 0))}
            </span>
          </div>
        </Card>
      </div>

      <div className="no-print mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Card key={r.id} className="flex flex-col p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
                <Icon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[13.5px] font-semibold text-ink-900">{r.name}</p>
              <p className="mt-1 flex-1 text-[12px] leading-relaxed text-ink-500">{r.desc}</p>
              <div className="mt-3 flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="flex-1"
                  loading={busy === `${r.id}-csv`}
                  onClick={() => exportReport(r.id, r.name, "csv")}
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => exportReport(r.id, r.name, "print")}>
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Dues ageing"
            subtitle="How old the outstanding money is"
            action={<Badge tone={totalOutstanding > 0 ? "amber" : "green"}>{formatINR(totalOutstanding)} pending</Badge>}
          />
          <div className="p-5">
            {ageing.map((b) => (
              <div key={b.label} className="mb-3">
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="text-ink-600">{b.label}</span>
                  <span className="font-medium text-ink-900">
                    {b.pct}% · {formatINR(b.amount, { compact: true })}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className={cn("h-full rounded-full", b.tone)} style={{ width: `${b.pct}%` }} />
                </div>
              </div>
            ))}
            <p className="mt-4 text-[11.5px] text-ink-500">
              Members above 90 days are escalated automatically to the sadar with a
              suggested waiver/hardship review.
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Top outstanding"
            subtitle="Sorted by amount"
            action={
              <Button variant="ghost" size="sm" loading={busy === "reminders"} onClick={() => void sendReminders()} className="no-print">
                Send reminders
              </Button>
            }
          />
          {topOutstanding.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Koi dues baaki nahi"
              description="Sab members ne poora chanda de diya hai."
            />
          ) : (
            <TableWrap>
              <thead>
                <tr className="table-head">
                  <Th>Member</Th>
                  <Th>Since</Th>
                  <Th className="text-right">Due</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {topOutstanding.map(({ member, due, oldest }) => (
                  <tr key={member!.id}>
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={member!.name} size="sm" />
                        <div>
                          <p className="text-[12.5px] font-medium text-ink-800">{member!.name}</p>
                          <p className="font-mono text-[10px] text-ink-400">{member!.code}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[12px] text-ink-500">{periodLabel(oldest)}</Td>
                    <Td className="text-right font-medium text-amber-700">{formatINR(due)}</Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>

      <Card className="no-print mt-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-[12.5px] text-ink-600">
            Need a printed statement for the general body meeting?
          </p>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => printArea()}>
            <Printer className="h-3.5 w-3.5" /> Print current view
          </Button>
        </div>
      </Card>

      <p className="mt-4 text-[11px] text-ink-400">
        All-time billed {formatINR(totalBilled)} · lifetime collected {formatINR(totalPaid + donations.filter((d) => d.status === "verified").reduce((s, d) => s + d.amountPaise, 0))} ·
        ledger entries loaded {ledger.length}
      </p>
      </div>
    </>
  );
}
