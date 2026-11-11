"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  FileText,
  HandCoins,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  X,
} from "lucide-react";
import { activeTenant } from "@/lib/mock";
import type { Invoice, Member, Payment, PaymentMethod, Tenant } from "@/lib/types";
import {
  createPayment,
  getCurrentTenant,
  listInvoices,
  listMembers,
  listPayments,
  rejectPayment,
  verifyPayment,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import {
  amountInWords,
  cn,
  formatDate,
  formatINR,
  periodLabel,
  printArea,
} from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  EmptyState,
  Field,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { ProgressBar } from "@/components/charts";

type Tab = "verify" | "receipts";

interface ReceiptInfo {
  receiptNo: string;
  member: Member;
  amount: number;
  method: PaymentMethod;
  months: string[];
  reference: string;
  date: string;
}

function methodLabel(method: PaymentMethod): string {
  switch (method) {
    case "upi":
      return "UPI transfer";
    case "gateway":
      return "Payment gateway";
    case "cheque":
      return "Cheque";
    case "adjustment":
      return "Adjustment";
    default:
      return "Cash";
  }
}

export default function CollectionsPage() {
  const [tab, setTab] = useState<Tab>("verify");
  const [q, setQ] = useState("");
  const [collectOpen, setCollectOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [memberRows, paymentRows, invoiceRows, tenantRow] = await Promise.all([
        listMembers(),
        listPayments(),
        listInvoices(),
        getCurrentTenant(),
      ]);
      setMembers(memberRows);
      setPayments(paymentRows);
      setInvoices(invoiceRows);
      setTenant(tenantRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Collections load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const duesFor = useCallback(
    (memberId: string) =>
      invoices
        .filter(
          (i) =>
            i.memberId === memberId &&
            (i.status === "pending" || i.status === "partial")
        )
        .sort((a, b) => a.period.localeCompare(b.period)),
    [invoices]
  );

  const dueTotalOf = useCallback(
    (memberId: string) =>
      duesFor(memberId).reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0),
    [duesFor]
  );

  const pendingPayments = useMemo(
    () => payments.filter((p) => p.status === "pending"),
    [payments]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return payments.filter((p) => {
      if (!term) return true;
      const m = memberMap.get(p.memberId);
      return (
        p.receiptNo.toLowerCase().includes(term) ||
        p.reference.toLowerCase().includes(term) ||
        (m?.name.toLowerCase().includes(term) ?? false) ||
        (m?.code.toLowerCase().includes(term) ?? false)
      );
    });
  }, [payments, q, memberMap]);

  const monthKey = new Date().toISOString().slice(0, 7);
  const collectedThisMonth = payments
    .filter((p) => p.status === "verified" && p.createdAt.startsWith(monthKey))
    .reduce((s, p) => s + p.amountPaise, 0);
  const verifiedTotal = payments
    .filter((p) => p.status === "verified")
    .reduce((s, p) => s + p.amountPaise, 0);
  const pendingTotal = pendingPayments.reduce((s, p) => s + p.amountPaise, 0);

  async function onVerify(p: Payment, m: Member) {
    setBusyId(p.id);
    try {
      const receiptNo = await verifyPayment(p.id);
      setPayments((prev) =>
        prev.map((x) =>
          x.id === p.id
            ? { ...x, status: "verified", receiptNo, settledAt: new Date().toISOString() }
            : x
        )
      );
      setReceipt({
        receiptNo,
        member: m,
        amount: p.amountPaise,
        method: p.method,
        months: p.createdAt ? [p.createdAt.slice(0, 7)] : [monthKey],
        reference: p.reference,
        date: new Date().toISOString(),
      });
      toast(`Verified ${formatINR(p.amountPaise)} · ${receiptNo}`);
      if (!isDemoMode) await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment verify nahi hua", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(p: Payment) {
    const reason = window.prompt("Payment reject karne ki wajah likhein:", "");
    if (reason === null) return;

    setBusyId(p.id);
    try {
      await rejectPayment(p.id, reason.trim() || "Rejected by office");
      setPayments((prev) =>
        prev.map((x) => (x.id === p.id ? { ...x, status: "rejected" } : x))
      );
      toast("Payment rejected and returned to collector", "error");
      if (!isDemoMode) await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment reject nahi hua", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Collections"
        description="Record member chanda, verify UPI/gateway payments and print receipts. Every entry is written to the tamper-evident ledger."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button
              onClick={() => {
                setCollectOpen(true);
              }}
            >
              <HandCoins className="h-4 w-4" /> Collect payment
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Collected this month"
          value={formatINR(collectedThisMonth)}
          sub={periodLabel(monthKey)}
          icon={Banknote}
          tone="green"
        />
        <StatCard
          label="All-time verified"
          value={formatINR(verifiedTotal)}
          sub={`${payments.filter((p) => p.status === "verified").length} receipts`}
          icon={ShieldCheck}
          tone="brand"
        />
        <StatCard
          label="Awaiting verification"
          value={formatINR(pendingTotal)}
          sub={`${pendingPayments.length} entries`}
          icon={Clock}
          tone="amber"
        />
        <StatCard
          label="Pending dues pool"
          value={formatINR(members.reduce((s, m) => s + dueTotalOf(m.id), 0))}
          sub="Across all members"
          icon={Wallet}
          tone="slate"
        />
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="mt-6 mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl border border-ink-200 bg-white p-1">
          {(
            [
              { id: "verify" as Tab, label: "Pending verification", count: pendingPayments.length },
              { id: "receipts" as Tab, label: "All receipts", count: payments.length },
            ]
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition",
                tab === t.id
                  ? "bg-ink-900 text-white"
                  : "text-ink-600 hover:bg-ink-50"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px]",
                  tab === t.id ? "bg-white/15" : "bg-ink-100 text-ink-500"
                )}
              >
                {t.count}
              </span>
            </button>
          ))}
        </div>
        <div className="ml-auto w-full sm:w-72">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Receipt no, member or reference…"
          />
        </div>
      </div>

      {loading ? (
        <Card>
          <div className="p-10 text-center text-[12.5px] text-ink-500">
            Collections load ho rahe hain…
          </div>
        </Card>
      ) : tab === "verify" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {pendingPayments.map((p) => {
            const m = memberMap.get(p.memberId);
            if (!m) return null;
            return (
              <Card key={p.id} className="overflow-hidden">
                <div className="flex items-start gap-3 border-b border-ink-100 p-4">
                  <Avatar name={m.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-ink-900">
                      {m.name}
                    </p>
                    <p className="font-mono text-[11px] text-ink-500">{m.code}</p>
                    <p className="mt-1 text-[11.5px] text-ink-400">
                      {formatDate(p.createdAt, true)}
                      {p.enteredBy ? ` · entered by ${p.enteredBy}` : ""}
                    </p>
                  </div>
                  <Badge tone="amber" dot>
                    To verify
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-3 p-4 text-[12.5px]">
                  <div>
                    <p className="text-ink-400">Amount</p>
                    <p className="mt-0.5 text-base font-semibold text-ink-900">
                      {formatINR(p.amountPaise)}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-400">Method</p>
                    <p className="mt-0.5 flex items-center gap-1.5 font-medium text-ink-800">
                      {p.method === "upi" ? (
                        <Smartphone className="h-3.5 w-3.5" />
                      ) : (
                        <CreditCard className="h-3.5 w-3.5" />
                      )}
                      {methodLabel(p.method)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-ink-400">Reference</p>
                    <p className="mt-0.5 font-mono text-[12px] text-ink-700">
                      {p.reference || "—"}
                    </p>
                  </div>
                  {p.note && (
                    <div className="col-span-2">
                      <p className="text-ink-400">Note</p>
                      <p className="mt-0.5 text-[12px] text-ink-700">{p.note}</p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 border-t border-ink-100 bg-ink-50/50 p-3">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="flex-1"
                    disabled={busyId === p.id}
                    onClick={() => void onReject(p)}
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    disabled={busyId === p.id}
                    onClick={() => void onVerify(p, m)}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {busyId === p.id ? "Saving…" : "Verify & receipt"}
                  </Button>
                </div>
              </Card>
            );
          })}
          {pendingPayments.length === 0 && (
            <Card className="lg:col-span-2">
              <EmptyState
                icon={CheckCircle2}
                title="Nothing to verify"
                description="All incoming payments have been matched and receipted."
              />
            </Card>
          )}

          <Card className="lg:col-span-2">
            <CardHeader
              title="How verification protects the khajanchi"
              subtitle="Maker–checker: the person who records a payment never approves their own entry."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-3">
              {[
                {
                  icon: HandCoins,
                  title: "1. Collector records",
                  body: "Cash, UPI screenshot or gateway event creates a pending entry — no receipt yet.",
                },
                {
                  icon: ShieldCheck,
                  title: "2. Second person verifies",
                  body: "Sadar or khajanchi matches the reference against the bank/UPI statement.",
                },
                {
                  icon: FileText,
                  title: "3. Receipt + ledger",
                  body: "On approval a numbered receipt is issued and a hash-chained ledger row is written.",
                },
              ].map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.title} className="rounded-xl border border-ink-100 p-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <p className="mt-2.5 text-[13px] font-semibold text-ink-900">
                      {s.title}
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-ink-500">
                      {s.body}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : (
        <Card>
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Receipt</Th>
                <Th>Member</Th>
                <Th>Date</Th>
                <Th>Method</Th>
                <Th>Entered by</Th>
                <Th>Status</Th>
                <Th className="text-right">Amount</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.slice(0, 40).map((p) => {
                const m = memberMap.get(p.memberId);
                return (
                  <tr key={p.id} className="hover:bg-ink-50/60">
                    <Td>
                      <span className="font-mono text-[11.5px] text-ink-700">
                        {p.receiptNo}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <Avatar name={m?.name ?? "?"} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[12.5px] font-medium text-ink-800">
                            {m?.name ?? "Unknown"}
                          </p>
                          <p className="font-mono text-[10px] text-ink-400">
                            {m?.code}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[12px] text-ink-500">
                      {formatDate(p.createdAt)}
                    </Td>
                    <Td>
                      <Badge tone="slate">
                        {p.method === "upi"
                          ? "UPI"
                          : p.method === "gateway"
                            ? "Gateway"
                            : p.method === "cash"
                              ? "Cash"
                              : p.method.toUpperCase()}
                      </Badge>
                    </Td>
                    <Td className="text-[12px] text-ink-500">{p.enteredBy}</Td>
                    <Td>
                      <StatusPill status={p.status} />
                    </Td>
                    <Td className="text-right font-medium">
                      {formatINR(p.amountPaise)}
                    </Td>
                    <Td className="text-right">
                      <button
                        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40"
                        disabled={!m || p.status !== "verified"}
                        onClick={() => {
                          if (!m) return;
                          setReceipt({
                            receiptNo: p.receiptNo,
                            member: m,
                            amount: p.amountPaise,
                            method: p.method,
                            months: [p.createdAt.slice(0, 7)],
                            reference: p.reference,
                            date: p.createdAt,
                          });
                        }}
                      >
                        <Printer className="h-3.5 w-3.5" /> Receipt
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        </Card>
      )}

      <CollectDrawer
        open={collectOpen}
        members={members}
        duesFor={duesFor}
        dueTotalOf={dueTotalOf}
        onClose={() => setCollectOpen(false)}
        onSaved={async (payment) => {
          setCollectOpen(false);
          setPayments((prev) => (prev.some((x) => x.id === payment.id) ? prev : [payment, ...prev]));
          setTab("verify");
          if (!isDemoMode) await load();
        }}
      />

      <ReceiptDrawer receipt={receipt} tenant={tenant ?? activeTenant} onClose={() => setReceipt(null)} />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Collect payment drawer — 1 / 2 / all months, no arbitrary months
   ═══════════════════════════════════════════════════════════════ */

function CollectDrawer({
  open,
  members,
  duesFor,
  dueTotalOf,
  onClose,
  onSaved,
}: {
  open: boolean;
  members: Member[];
  duesFor: (memberId: string) => Invoice[];
  dueTotalOf: (memberId: string) => number;
  onClose: () => void;
  onSaved: (payment: Payment) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [mode, setMode] = useState<"1" | "2" | "all">("1");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const dues = member ? duesFor(member.id) : [];
  const months =
    mode === "1" ? dues.slice(0, 1) : mode === "2" ? dues.slice(0, 2) : dues;
  const total = months.reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);

  const results = q.trim()
    ? members
        .filter(
          (m) =>
            m.name.toLowerCase().includes(q.toLowerCase()) ||
            m.code.toLowerCase().includes(q.toLowerCase()) ||
            m.phone.includes(q)
        )
        .slice(0, 6)
    : [];

  function reset() {
    setQ("");
    setMember(null);
    setMode("1");
    setMethod("cash");
    setReference("");
    setNote("");
  }

  async function submit() {
    if (!member) return toast("Select a member first", "error");
    if (total <= 0) return toast("No dues to collect", "error");
    if (method === "upi" || method === "gateway") {
      if (!reference.trim())
        return toast("Reference number is required for UPI/gateway", "error");
    }

    setSaving(true);
    try {
      const payment = await createPayment({
        memberId: member.id,
        amountPaise: total,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      const monthText = months.map((i) => periodLabel(i.period)).join(" + ");
      toast(
        `Recorded ${formatINR(total)} from ${member.name} (${monthText}) — pending verification`,
        "info"
      );
      reset();
      await onSaved(payment);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Payment save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Collect payment"
      subtitle="Record chanda — receipt is issued after verification"
      width="max-w-xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-ink-400">
              Collecting
            </p>
            <p className="text-lg font-semibold text-ink-900">{formatINR(total)}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving || !member}>
              <CheckCircle2 className="h-4 w-4" />
              {saving ? "Saving…" : "Record payment"}
            </Button>
          </div>
        </div>
      }
    >
      {/* member picker */}
      {!member ? (
        <>
          <label className="label">Find member</label>
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Name, member ID or mobile…"
          />
          <div className="mt-3 divide-y divide-ink-100 rounded-xl border border-ink-100">
            {(results.length ? results : members.slice(0, 6)).map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setMember(m);
                  setQ("");
                }}
                className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-ink-50"
              >
                <Avatar name={m.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12.5px] font-medium text-ink-800">
                    {m.name}
                  </p>
                  <p className="font-mono text-[10.5px] text-ink-400">{m.code}</p>
                </div>
                <span
                  className={cn(
                    "text-[11.5px] font-medium",
                    dueTotalOf(m.id) > 0 ? "text-amber-700" : "text-emerald-600"
                  )}
                >
                  {dueTotalOf(m.id) > 0 ? formatINR(dueTotalOf(m.id)) : "Clear"}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-ink-300" />
              </button>
            ))}
            {results.length === 0 && q && (
              <p className="px-3 py-6 text-center text-[12.5px] text-ink-500">
                No member found for “{q}”
              </p>
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-ink-400">
            <Search className="h-3 w-3" /> Tip: scanning a member ID card fills
            this automatically.
          </p>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3 rounded-xl border border-ink-100 bg-ink-50/60 p-3">
            <Avatar name={member.name} size="md" />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-ink-900">{member.name}</p>
              <p className="font-mono text-[11px] text-ink-500">{member.code}</p>
            </div>
            <button
              onClick={() => setMember(null)}
              className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 hover:bg-white"
            >
              Change
            </button>
          </div>

          {/* dues */}
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[12.5px] font-semibold text-ink-800">
                Pending months
              </p>
              <p className="text-[11.5px] text-ink-500">
                {dues.length} month{dues.length === 1 ? "" : "s"} unpaid
              </p>
            </div>
            {dues.length === 0 ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> No pending dues. Nothing to
                collect.
              </div>
            ) : (
              <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
                {dues.map((i, idx) => {
                  const on = months.some((x) => x.id === i.id);
                  return (
                    <div
                      key={i.id}
                      className={cn(
                        "flex items-center justify-between px-3.5 py-2.5",
                        on && "bg-brand-50/50"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className={cn(
                            "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
                            on
                              ? "bg-brand-600 text-white"
                              : "bg-ink-100 text-ink-500"
                          )}
                        >
                          {on ? "✓" : idx + 1}
                        </span>
                        <div>
                          <p className="text-[12.5px] font-medium text-ink-800">
                            {periodLabel(i.period)}
                          </p>
                          <p className="text-[10.5px] text-ink-400">
                            Due {formatDate(i.dueDate)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[12.5px] font-medium text-ink-900">
                        {formatINR(i.amountPaise - i.paidPaise)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* how many months */}
          <div className="mt-4">
            <label className="label">How many months is the member paying?</label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: "1", label: "1 month", sub: dues[0] ? formatINR(dues[0].amountPaise) : "—" },
                  { id: "2", label: "2 months", sub: dues[1] ? formatINR((dues[0]?.amountPaise ?? 0) + dues[1].amountPaise) : "Not available" },
                  { id: "all", label: `All ${dues.length}`, sub: formatINR(dues.reduce((s, i) => s + i.amountPaise, 0)) },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  onClick={() => setMode(o.id)}
                  disabled={o.id === "2" && dues.length < 2}
                  className={cn(
                    "rounded-xl border px-2 py-2.5 text-center transition disabled:opacity-40",
                    mode === o.id
                      ? "border-brand-500 bg-brand-50 ring-2 ring-brand-500/20"
                      : "border-ink-200 hover:border-ink-300"
                  )}
                >
                  <p className="text-[12.5px] font-semibold text-ink-900">
                    {o.label}
                  </p>
                  <p className="text-[10.5px] text-ink-500">{o.sub}</p>
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-400">
              Custom month ranges are intentionally not allowed — this keeps dues
              and reports clean.
            </p>
          </div>

          {/* method */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Payment method">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI (manual verify)</option>
                <option value="gateway">Payment gateway</option>
                <option value="cheque">Cheque</option>
              </Select>
            </Field>
            <Field
              label={method === "cash" ? "Note (optional)" : "Reference number"}
              hint={method === "cash" ? undefined : "From the UPI / gateway statement"}
            >
              {method === "cash" ? (
                <input
                  className="input"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. paid at masjid"
                />
              ) : (
                <input
                  className="input font-mono"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="UPI/123456 / pay_R…"
                />
              )}
            </Field>
          </div>

          <div className="mt-4 rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-ink-500">
                {months.length
                  ? months.map((m) => periodLabel(m.period)).join(" + ")
                  : "No month selected"}
              </span>
              <span className="font-semibold text-ink-900">{formatINR(total)}</span>
            </div>
            <p className="mt-1 text-[11px] capitalize text-ink-400">
              {amountInWords(total)}
            </p>
            <div className="mt-2">
              <ProgressBar value={total ? 100 : 0} />
            </div>
          </div>

          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-900">
            This entry is saved as <strong>pending verification</strong>. A numbered
            receipt is issued only after a second office bearer matches it — so no
            one can quietly add or duplicate a collection.
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Receipt preview (thermal 58mm / 80mm)
   ═══════════════════════════════════════════════════════════════ */

function ReceiptDrawer({
  receipt,
  tenant,
  onClose,
}: {
  receipt: ReceiptInfo | null;
  tenant: Tenant;
  onClose: () => void;
}) {
  const [size, setSize] = useState<"58" | "80">("80");
  if (!receipt) return null;
  const { member, amount, months } = receipt;

  return (
    <Drawer
      open={!!receipt}
      onClose={onClose}
      title="Receipt"
      subtitle={receipt.receiptNo}
      width="max-w-md"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            Close
          </Button>
          <Button className="flex-1" onClick={() => printArea()}>
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="text-[12px] text-ink-500">Paper size</span>
        <div className="inline-flex rounded-lg border border-ink-200 p-0.5">
          {(["58", "80"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={cn(
                "rounded-md px-2 py-1 text-[11.5px] font-medium",
                size === s ? "bg-ink-900 text-white" : "text-ink-600"
              )}
            >
              {s} mm
            </button>
          ))}
        </div>
        <Badge tone="green" dot className="ml-auto">
          Verified
        </Badge>
      </div>

      <div className="flex justify-center rounded-xl bg-ink-50 p-4">
        <div
          className={cn(
            "print-area bg-white p-3 shadow-sm",
            size === "58" ? "receipt-58" : "receipt-80"
          )}
        >
          <div className="text-center">
            <p className="text-[13px] font-bold tracking-wide">
              {tenant.name}
            </p>
            <p className="text-[9px]">
              {tenant.masjid}, {tenant.village}
            </p>
            <p className="text-[9px]">
              {tenant.district}, {tenant.state} — {tenant.pincode}
            </p>
            <p className="text-[9px]">Reg: {tenant.regNo}</p>
            <div className="my-1.5 border-t border-dashed border-black" />
            <p className="text-[11px] font-bold">PAYMENT RECEIPT</p>
            <div className="my-1.5 border-t border-dashed border-black" />
          </div>

          <div className="space-y-0.5 text-[9.5px]">
            <Row label="Receipt" value={receipt.receiptNo} />
            <Row label="Date" value={formatDate(receipt.date, true)} />
            <Row label="Member" value={member.name} />
            <Row label="Member ID" value={member.code} />
            <Row label="House" value={`#${member.household}, ${member.mohalla}`} />
            <Row label="Period" value={months.map(periodLabel).join(", ")} />
            <Row label="Method" value={receipt.method.toUpperCase()} />
            <Row label="Reference" value={receipt.reference} />
          </div>

          <div className="my-1.5 border-t border-dashed border-black" />
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] font-bold">AMOUNT PAID</span>
            <span className="text-[14px] font-bold">{formatINR(amount)}</span>
          </div>
          <p className="mt-0.5 text-[8.5px] capitalize">
            {amountInWords(amount)}
          </p>
          <div className="my-1.5 border-t border-dashed border-black" />
          <p className="text-center text-[8px]">
            Received by: Khajanchi / Collector
          </p>
          <p className="text-center text-[8px]">
            This is a computer-generated receipt.
          </p>
          <p className="mt-1 text-center text-[8px] font-semibold">
            انجمن — جزاک اللہ خیر
          </p>
          <p className="mt-1 text-center text-[7px]">
            Verify: anjuman.app/verify · {receipt.receiptNo}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[11.5px] leading-relaxed text-brand-900">
        <span className="font-semibold">Ledger entry written.</span> This receipt
        is immutable — any correction must be done through a reversal entry, so the
        audit trail always remains complete.
      </div>
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
