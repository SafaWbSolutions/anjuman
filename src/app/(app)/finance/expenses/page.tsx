"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  FileText,
  Plus,
  Receipt,
  ShieldCheck,
  Wallet,
  XCircle,
} from "lucide-react";
import { expenses, funds } from "@/lib/mock";
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

export default function ExpensesPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

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
    [q, status]
  );

  const approved = expenses.filter((e) => e.status === "approved");
  const pending = expenses.filter((e) => e.status === "pending");
  const thisMonth = approved
    .filter((e) => e.createdAt.startsWith("2026-11"))
    .reduce((s, e) => s + e.amountPaise, 0);

  const fundColors = ["#10b981", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444"];

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Expenses"
        description="Every payment out of the masjid fund with a bill, fund tag and approval trail."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Record expense
          </Button>
        }
      />

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
                    <Badge tone="slate">{e.fundName}</Badge>
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
                        <button
                          onClick={() => toast("Expense approved")}
                          className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-50"
                          aria-label="Approve"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toast("Expense rejected", "error")}
                          className="rounded-lg p-1.5 text-red-600 hover:bg-red-50"
                          aria-label="Reject"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink-400">{e.approvedBy?.split(" ")[0]}</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
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
                      width: `${(f.balancePaise / Math.max(...funds.map((x) => x.balancePaise))) * 100}%`,
                      background: fundColors[i % fundColors.length],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
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
        </Card>
      </div>

      <AddExpenseDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

function AddExpenseDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState("");
  const [fund, setFund] = useState(funds[0].name);
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Record expense"
      subtitle="Attach a bill — expenses without a bill are flagged for the auditor."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { toast("Expense submitted for approval"); onClose(); }}>
            Submit for approval
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select defaultValue="Electricity">
            {["Salary", "Electricity", "Repair", "Cleaning", "Office", "Community", "Construction", "Other"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Vendor / payee">
          <Input placeholder="e.g. UP Power Corp" />
        </Field>
        <Field label="Amount (₹)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="0" />
        </Field>
        <Field label="Fund">
          <Select value={fund} onChange={(e) => setFund(e.target.value)}>
            {funds.map((f) => (
              <option key={f.id}>{f.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" defaultValue="2026-11-10" />
        </Field>
        <Field label="Bill / receipt">
          <div className="flex h-[42px] items-center justify-center rounded-xl border border-dashed border-ink-300 text-[12px] text-ink-500">
            Upload photo or PDF
          </div>
        </Field>
        <Field label="Note" className="sm:col-span-2">
          <Input placeholder="What was this for?" />
        </Field>
      </div>
      <div className={cn("mt-4 rounded-xl border p-3 text-[11.5px] leading-relaxed", "border-ink-200 bg-ink-50/60 text-ink-600")}>
        Fund balance after this expense:{" "}
        <span className="font-semibold text-ink-900">
          {formatINR(Math.max((funds.find((f) => f.name === fund)?.balancePaise ?? 0) - Number(amount || 0) * 100, 0))}
        </span>
        . A restricted fund can never go negative.
      </div>
    </Drawer>
  );
}
