"use client";

import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  TrendingUp,
  Wallet,
  Users,
  Landmark,
} from "lucide-react";
import {
  members,
  invoices,
  payments,
  expenses,
  ledger,
  funds,
  monthlySeries,
  topDefaulters,
} from "@/lib/mock";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  PageHeader,
  Select,
  StatCard,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { BarPair } from "@/components/charts";
import { formatINR, formatDate, periodLabel, currentPeriod, cn } from "@/lib/utils";

const REPORTS = [
  { id: "monthly", name: "Monthly collection statement", desc: "Billed vs collected vs outstanding for a month", icon: FileText },
  { id: "fund", name: "Fund-wise statement", desc: "Opening, receipts, payments and closing per fund", icon: Landmark },
  { id: "ageing", name: "Dues ageing", desc: "Members grouped by 0–30 / 31–60 / 61–90 / 90+ days", icon: Users },
  { id: "expense", name: "Expense register", desc: "Category-wise expenses with bill references", icon: Wallet },
  { id: "audit", name: "Audit pack", desc: "Ledger, receipts, bills and approvals in one PDF", icon: FileSpreadsheet },
  { id: "annual", name: "Annual report", desc: "Year-end summary for the general body meeting", icon: TrendingUp },
];

export default function ReportsPage() {
  const [period, setPeriod] = useState(currentPeriod());
  const [busy, setBusy] = useState<string | null>(null);

  const collected = payments.filter((p) => p.createdAt.startsWith(period)).reduce((s, p) => s + p.amountPaise, 0);
  const spent = expenses.filter((e) => e.createdAt.startsWith(period) && e.status === "approved").reduce((s, e) => s + e.amountPaise, 0);
  const billed = invoices.reduce((s, i) => s + i.amountPaise, 0);
  const paid = invoices.reduce((s, i) => s + i.paidPaise, 0);

  function download(name: string) {
    setBusy(name);
    setTimeout(() => {
      toast(`${name} downloaded`);
      setBusy(null);
    }, 700);
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Reports"
        description="One-click statements for the committee, the auditor and the general body. Every number ties back to the ledger."
        actions={
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} className="w-auto py-2 text-[12.5px]">
            {["2026-08", "2026-09", "2026-10", "2026-11"].map((p) => (
              <option key={p} value={p}>{periodLabel(p)}</option>
            ))}
          </Select>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Billed (all time)" value={formatINR(billed)} sub={`${invoices.length} invoices`} icon={FileText} tone="slate" />
        <StatCard label={`Collected · ${periodLabel(period)}`} value={formatINR(collected)} sub="Verified payments" icon={Wallet} tone="green" />
        <StatCard label={`Spent · ${periodLabel(period)}`} value={formatINR(spent)} sub="Approved expenses" icon={TrendingUp} tone="blue" />
        <StatCard label="Collection rate" value={`${billed ? Math.round((paid / billed) * 100) : 0}%`} sub="Paid ÷ billed" icon={Users} tone="brand" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Monthly trend" subtitle="Collections vs expenses" action={<Badge tone="brand">Last 6 months</Badge>} />
          <div className="p-5">
            <BarPair data={monthlySeries} height={220} />
          </div>
        </Card>

        <Card>
          <CardHeader title="Fund position" subtitle="Closing balances" />
          <div className="divide-y divide-ink-100">
            {funds.map((f) => (
              <div key={f.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-[12.5px] font-medium text-ink-800">{f.name}</p>
                  <p className="text-[10.5px] text-ink-400">{f.restricted ? "Restricted" : "Unrestricted"}</p>
                </div>
                <span className="text-[12.5px] font-medium text-ink-900">{formatINR(f.balancePaise)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 bg-ink-50/60 px-5 py-3">
            <span className="text-[12.5px] font-semibold text-ink-700">Total</span>
            <span className="text-[13px] font-semibold text-ink-900">
              {formatINR(funds.reduce((s, f) => s + f.balancePaise, 0))}
            </span>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
                <Button variant="secondary" size="sm" className="flex-1" loading={busy === r.name} onClick={() => download(r.name)}>
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={() => toast("Excel file generated")}>
                  <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader title="Dues ageing" subtitle="How old the outstanding money is" />
          <div className="p-5">
            {[
              { label: "0–30 days", value: 62, tone: "bg-emerald-500" },
              { label: "31–60 days", value: 24, tone: "bg-amber-500" },
              { label: "61–90 days", value: 9, tone: "bg-orange-500" },
              { label: "90+ days", value: 5, tone: "bg-red-500" },
            ].map((b) => (
              <div key={b.label} className="mb-3">
                <div className="mb-1 flex justify-between text-[12px]">
                  <span className="text-ink-600">{b.label}</span>
                  <span className="font-medium text-ink-900">{b.value}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                  <div className={cn("h-full rounded-full", b.tone)} style={{ width: `${b.value}%` }} />
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
              <Button variant="ghost" size="sm" onClick={() => toast("Reminders queued for 6 members")}>
                Send reminders
              </Button>
            }
          />
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Member</Th>
                <Th>Since</Th>
                <Th className="text-right">Due</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {topDefaulters.slice(0, 5).map(({ member, due }) => (
                <tr key={member.id}>
                  <Td>
                    <p className="text-[12.5px] font-medium text-ink-800">{member.name}</p>
                    <p className="font-mono text-[10px] text-ink-400">{member.code}</p>
                  </Td>
                  <Td className="text-[12px] text-ink-500">{formatDate(member.joinedOn)}</Td>
                  <Td className="text-right font-medium text-amber-700">{formatINR(due)}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-[12.5px] text-ink-600">
            Need a printed statement for the general body meeting?
          </p>
          <Button variant="secondary" size="sm" className="ml-auto" onClick={() => window.print()}>
            <Printer className="h-3.5 w-3.5" /> Print current view
          </Button>
        </div>
      </Card>
    </>
  );
}
