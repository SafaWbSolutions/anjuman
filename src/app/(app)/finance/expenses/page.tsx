"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Plus,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import type { Expense, Fund } from "@/lib/types";
import {
  approveExpense,
  createExpense,
  listExpenses,
  listFunds,
  rejectExpense,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Field,
  Input,
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
import { formatDate, formatINR, cn } from "@/lib/utils";
import { Donut } from "@/components/charts";

const CATEGORIES = [
  "Salary",
  "Electricity",
  "Repair",
  "Cleaning",
  "Office",
  "Community",
  "Construction",
  "Other",
];

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);

export default function ExpensesPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canApprove = user?.role === "sadar" || user?.role === "auditor";
  const canReject =
    user?.role === "sadar" || user?.role === "secretary" || user?.role === "auditor";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expenseRows, fundRows] = await Promise.all([listExpenses(), listFunds()]);
      setExpenses(expenseRows);
      setFunds(fundRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Expenses load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      expenses.filter((e) => {
        if (status !== "all" && e.status !== status) return false;
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          e.vendor.toLowerCase().includes(term) ||
          e.category.toLowerCase().includes(term) ||
          e.fundName.toLowerCase().includes(term)
        );
      }),
    [expenses, q, status]
  );

  const approved = expenses.filter((e) => e.status === "approved");
  const pending = expenses.filter((e) => e.status === "pending");
  const thisMonth = approved
    .filter((e) => (e.approvedAt ?? e.createdAt).startsWith(CURRENT_MONTH))
    .reduce((s, e) => s + e.amountPaise, 0);

  const fundColors = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444"];

  async function onApprove(e: Expense) {
    setBusyId(e.id);
    try {
      await approveExpense(e.id);
      setExpenses((prev) =>
        prev.map((x) => (x.id === e.id ? { ...x, status: "approved" } : x))
      );
      toast(`Approved ${formatINR(e.amountPaise)} · posted to ledger`);
      if (!isDemoMode) await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Expense approve nahi hua", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(e: Expense) {
    const reason = window.prompt("Expense reject karne ki wajah likhein:", "");
    if (reason === null) return;

    setBusyId(e.id);
    try {
      await rejectExpense(e.id, reason.trim() || "Rejected by office");
      setExpenses((prev) =>
        prev.map((x) => (x.id === e.id ? { ...x, status: "rejected", note: reason } : x))
      );
      toast("Expense rejected — fund untouched", "error");
      if (!isDemoMode) await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Expense reject nahi hua", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Every payment out of the masjid fund with a bill, fund tag and approval trail."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Record expense
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Spent this month" value={formatINR(thisMonth)} sub="Approved only" icon={Wallet} tone="blue" />
        <StatCard label="Awaiting approval" value={formatINR(pending.reduce((s, e) => s + e.amountPaise, 0))} sub={`${pending.length} bills`} icon={FileText} tone="amber" />
        <StatCard label="Total fund balance" value={formatINR(funds.reduce((s, f) => s + f.balancePaise, 0))} sub={`${funds.length} funds`} icon={ShieldCheck} tone="brand" />
        <StatCard label="Bills attached" value={`${expenses.filter((e) => e.billUrl).length}/${expenses.length}`} sub="Missing bills are flagged" icon={Receipt} tone="violet" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
            <SearchInput value={q} onChange={setQ} placeholder="Vendor, category or fund…" className="w-full sm:w-72" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto py-2 text-[12.5px]">
              <option value="all">Any status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </Select>
            <span className="ml-auto text-[12px] text-ink-500">{rows.length} entries</span>
          </div>
          {loading && expenses.length === 0 ? (
            <div className="p-10 text-center text-[12.5px] text-ink-500">
              Expenses load ho rahe hain…
            </div>
          ) : (
            <TableWrap>
              <thead>
                <tr className="table-head">
                  <Th>Expense</Th>
                  <Th>Fund</Th>
                  <Th>Date</Th>
                  <Th>Bill</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {rows.map((e) => (
                  <tr key={e.id} className="hover:bg-ink-50/60">
                    <Td>
                      <p className="text-[12.5px] font-medium text-ink-900">{e.category}</p>
                      <p className="text-[11px] text-ink-500">{e.vendor}</p>
                    </Td>
                    <Td>
                      <Badge tone="slate">{e.fundName || "—"}</Badge>
                    </Td>
                    <Td className="text-[12px] text-ink-500">{formatDate(e.createdAt)}</Td>
                    <Td>
                      {e.billUrl ? (
                        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700">
                          <FileText className="h-3.5 w-3.5" /> View
                        </span>
                      ) : (
                        <span className="text-[11.5px] text-red-600">Missing</span>
                      )}
                    </Td>
                    <Td>
                      <StatusPill status={e.status} />
                    </Td>
                    <Td className="text-right font-medium">{formatINR(e.amountPaise)}</Td>
                    <Td className="text-right">
                      {e.status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          {canApprove && (
                            <button
                              onClick={() => void onApprove(e)}
                              disabled={busyId === e.id}
                              className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50 disabled:opacity-40"
                              aria-label="Approve"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          )}
                          {canReject && (
                            <button
                              onClick={() => void onReject(e)}
                              disabled={busyId === e.id}
                              className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-40"
                              aria-label="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          )}
                          {!canApprove && !canReject && (
                            <span className="text-[11px] text-ink-400">Awaiting office</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-ink-400">
                          {e.status === "approved" ? "Posted" : "Closed"}
                        </span>
                      )}
                    </Td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-ink-500">
                      No expenses match your filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardHeader title="Fund balances" subtitle="Restricted funds are ring-fenced" />
          <div className="space-y-3 p-5">
            {funds.map((f, i) => (
              <div key={f.id}>
                <div className="mb-1 flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-2 text-ink-600">
                    <span className="h-2 w-2 rounded-full" style={{ background: fundColors[i % fundColors.length] }} />
                    {f.name}
                    {f.restricted && <Badge tone="violet">Restricted</Badge>}
                  </span>
                  <span className="font-medium text-ink-900">{formatINR(f.balancePaise, { compact: true })}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(f.balancePaise / Math.max(...funds.map((x) => x.balancePaise), 1)) * 100}%`,
                      background: fundColors[i % fundColors.length],
                    }}
                  />
                </div>
              </div>
            ))}
            {funds.length === 0 && (
              <p className="text-[12.5px] text-ink-500">No funds configured yet.</p>
            )}
          </div>
          {funds.length > 0 && (
            <div className="border-t border-ink-100 p-5">
              <Donut
                segments={funds.slice(0, 4).map((f, i) => ({
                  label: f.code,
                  value: f.balancePaise,
                  color: fundColors[i],
                }))}
                size={110}
                thickness={14}
              />
            </div>
          )}
        </Card>
      </div>

      <AddExpenseDrawer
        open={addOpen}
        funds={funds}
        onClose={() => setAddOpen(false)}
        onSaved={async (expense) => {
          setExpenses((prev) => [expense, ...prev]);
          setAddOpen(false);
          if (!isDemoMode) await load();
        }}
      />
    </>
  );
}

function AddExpenseDrawer({
  open,
  funds,
  onClose,
  onSaved,
}: {
  open: boolean;
  funds: Fund[];
  onClose: () => void;
  onSaved: (expense: Expense) => void | Promise<void>;
}) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!fundId && funds[0]) setFundId(funds[0].id);
  }, [fundId, funds]);

  const selectedFund = funds.find((f) => f.id === fundId);
  const amountPaise = Math.round(Number(amount || "0") * 100);

  async function save() {
    if (!vendor.trim()) return toast("Vendor / payee is required", "error");
    if (!fundId) return toast("Choose a fund", "error");
    if (!Number.isFinite(amountPaise) || amountPaise <= 0)
      return toast("Enter a valid amount", "error");

    setSaving(true);
    try {
      const expense = await createExpense({
        fundId,
        category,
        amountPaise,
        vendor,
        note: note || undefined,
      });
      toast("Expense submitted for approval");
      setVendor("");
      setAmount("");
      setNote("");
      await onSaved(expense);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Expense save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Record expense"
      subtitle="Attach a bill — expenses without a bill are flagged for the auditor."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Submit for approval"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor / payee">
          <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. UP Power Corp" />
        </Field>
        <Field label="Amount (₹)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0" />
        </Field>
        <Field label="Fund">
          <Select value={fundId} onChange={(e) => setFundId(e.target.value)}>
            {funds.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Bill / receipt" hint="Photo upload arrives with the R2 bucket; for now the bill can be added later.">
          <div className="flex h-[42px] items-center justify-center rounded-xl border border-dashed border-ink-300 text-[12px] text-ink-500">
            Upload photo or PDF
          </div>
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was this for?" />
        </Field>
      </div>
      <div className={cn("mt-4 rounded-xl border p-3 text-[11.5px] leading-relaxed", "border-ink-200 bg-ink-50/60 text-ink-600")}>
        Fund balance after this expense:{" "}
        <span className="font-semibold text-ink-900">
          {formatINR(Math.max((selectedFund?.balancePaise ?? 0) - (amountPaise || 0), 0))}
        </span>
        . A restricted fund can never go negative — the approval will be refused.
      </div>
    </Drawer>
  );
}
