"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote,
  BookOpenCheck,
  Download,
  FileSpreadsheet,
  Gift,
  HandCoins,
  HeartHandshake,
  Landmark,
  RefreshCw,
  Users,
  Wallet,
} from "lucide-react";
import type { Donation, Expense, Fund, Invoice, Member, Payment } from "@/lib/types";
import {
  listDonations,
  listExpenses,
  listFunds,
  listInvoices,
  listMembers,
  listPayments,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import { formatDate, formatINR, periodLabel, cn } from "@/lib/utils";
import { downloadCsv, downloadPdfTable } from "@/lib/export";
import { Button, Card, Drawer, Input, toast } from "@/components/ui";

interface TableData {
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
}

interface CardSpec {
  key: string;
  label: string;
  sub: string;
  value: number;
  icon: typeof Wallet;
  tone: "green" | "amber" | "brand" | "slate" | "violet";
  table: () => TableData;
}

const TONES: Record<CardSpec["tone"], string> = {
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  brand: "bg-brand-50 text-brand-700",
  slate: "bg-ink-100 text-ink-700",
  violet: "bg-violet-50 text-violet-700",
};

/**
 * Full anjuman financial analysis with a custom date range. Every card is
 * clickable and opens the real data table behind the number, exportable to
 * Excel (CSV) and a genuine PDF table.
 */
export function FinanceOverview({
  allowMemberList = true,
}: {
  allowMemberList?: boolean;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [table, setTable] = useState<TableData | null>(null);

  const load = useCallback(async () => {
    if (isDemoMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [m, i, p, e, d, f] = await Promise.all([
        listMembers(),
        listInvoices(),
        listPayments(),
        listExpenses(),
        listDonations(),
        listFunds(),
      ]);
      setMembers(m);
      setInvoices(i);
      setPayments(p);
      setExpenses(e);
      setDonations(d);
      setFunds(f);
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Analysis load nahi hua");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const inRange = useCallback(
    (iso: string) => {
      const day = iso.slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      return true;
    },
    [from, to]
  );

  const periodInRange = useCallback(
    (period: string) => {
      if (from && period < from.slice(0, 7)) return false;
      if (to && period > to.slice(0, 7)) return false;
      return true;
    },
    [from, to]
  );

  const memberMap = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const rangePayments = useMemo(
    () => payments.filter((p) => p.status === "verified" && inRange(p.createdAt)),
    [payments, inRange]
  );
  const rangeExpenses = useMemo(
    () => expenses.filter((e) => e.status === "approved" && inRange(e.createdAt)),
    [expenses, inRange]
  );
  const rangeDonations = useMemo(
    () => donations.filter((d) => d.status === "verified" && inRange(d.createdAt)),
    [donations, inRange]
  );

  const donationOf = useCallback(
    (needle: string) =>
      rangeDonations.filter((d) => {
        const f = funds.find((x) => x.id === d.fundId);
        return `${f?.code ?? ""} ${f?.name ?? d.fundName ?? ""}`
          .toLowerCase()
          .includes(needle);
      }),
    [rangeDonations, funds]
  );

  const fundBalanceOf = useCallback(
    (needle: string) =>
      funds
        .filter((f) => `${f.code} ${f.name}`.toLowerCase().includes(needle))
        .reduce((s, f) => s + f.balancePaise, 0),
    [funds]
  );

  const collected = rangePayments.reduce((s, p) => s + p.amountPaise, 0);
  const spent = rangeExpenses.reduce((s, e) => s + e.amountPaise, 0);
  const gifted = rangeDonations.reduce((s, d) => s + d.amountPaise, 0);
  const zakat = donationOf("zakat").reduce((s, d) => s + d.amountPaise, 0);
  const sadqa = donationOf("sadqa").reduce((s, d) => s + d.amountPaise, 0);
  const gift = donationOf("gift").reduce((s, d) => s + d.amountPaise, 0);
  const qarzFunds = funds.filter((f) => /qarz|loan|udhaar/i.test(`${f.code} ${f.name}`));
  const qarz = qarzFunds.reduce((s, f) => s + f.balancePaise, 0);
  const balance = funds.reduce((s, f) => s + f.balancePaise, 0);
  const outstanding = invoices
    .filter(
      (i) =>
        (i.status === "pending" || i.status === "partial") &&
        periodInRange(i.period)
    )
    .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);

  const label = from || to ? `${from || "start"} → ${to || "today"}` : "All time";

  const cards: CardSpec[] = [
    {
      key: "balance",
      label: "Total available balance",
      sub: "All funds · live",
      value: balance,
      icon: Landmark,
      tone: "brand",
      table: () => ({
        title: "Available balance by fund",
        subtitle: `As of ${new Date().toLocaleDateString("en-IN")}`,
        headers: ["Fund", "Code", "Restricted", "Balance"],
        rows: funds.map((f) => [
          f.name,
          f.code,
          f.restricted ? "Yes" : "No",
          formatINR(f.balancePaise),
        ]),
      }),
    },
    {
      key: "collections",
      label: "Total collection",
      sub: `${rangePayments.length} verified receipts`,
      value: collected,
      icon: HandCoins,
      tone: "green",
      table: () => ({
        title: "Collections",
        subtitle: label,
        headers: ["Receipt", "Member", "Code", "Method", "Date", "Amount"],
        rows: rangePayments.map((p) => {
          const m = memberMap.get(p.memberId);
          return [
            p.receiptNo,
            m?.name ?? "—",
            m?.code ?? "—",
            p.method.toUpperCase(),
            formatDate(p.createdAt),
            formatINR(p.amountPaise),
          ];
        }),
      }),
    },
    {
      key: "expenses",
      label: "Total expense",
      sub: `${rangeExpenses.length} approved vouchers`,
      value: spent,
      icon: Wallet,
      tone: "amber",
      table: () => ({
        title: "Expenses",
        subtitle: label,
        headers: ["Date", "Category", "Vendor", "Fund", "Amount"],
        rows: rangeExpenses.map((e) => [
          formatDate(e.createdAt),
          e.category,
          e.vendor,
          e.fundName,
          formatINR(e.amountPaise),
        ]),
      }),
    },
    {
      key: "gift",
      label: "Gift amount",
      sub: `Fund balance ${formatINR(fundBalanceOf("gift"))}`,
      value: gift,
      icon: Gift,
      tone: "violet",
      table: () => ({
        title: "Gift / donation fund",
        subtitle: label,
        headers: ["Date", "Donor", "Method", "Amount"],
        rows: donationOf("gift").map((d) => [
          formatDate(d.createdAt),
          d.anonymous ? "Anonymous" : d.donorName,
          d.method.toUpperCase(),
          formatINR(d.amountPaise),
        ]),
      }),
    },
    {
      key: "donations",
      label: "All donations",
      sub: `${rangeDonations.length} entries`,
      value: gifted,
      icon: HeartHandshake,
      tone: "violet",
      table: () => ({
        title: "All donations",
        subtitle: label,
        headers: ["Date", "Donor", "Fund", "Method", "Amount"],
        rows: rangeDonations.map((d) => [
          formatDate(d.createdAt),
          d.anonymous ? "Anonymous" : d.donorName,
          d.fundName,
          d.method.toUpperCase(),
          formatINR(d.amountPaise),
        ]),
      }),
    },
    {
      key: "zakat",
      label: "Zakat",
      sub: `Fund balance ${formatINR(fundBalanceOf("zakat"))}`,
      value: zakat,
      icon: Banknote,
      tone: "green",
      table: () => ({
        title: "Zakat",
        subtitle: label,
        headers: ["Date", "Donor", "Method", "Amount"],
        rows: donationOf("zakat").map((d) => [
          formatDate(d.createdAt),
          d.anonymous ? "Anonymous" : d.donorName,
          d.method.toUpperCase(),
          formatINR(d.amountPaise),
        ]),
      }),
    },
    {
      key: "sadqa",
      label: "Sadqa",
      sub: `Fund balance ${formatINR(fundBalanceOf("sadqa"))}`,
      value: sadqa,
      icon: Gift,
      tone: "violet",
      table: () => ({
        title: "Sadqa",
        subtitle: label,
        headers: ["Date", "Donor", "Method", "Amount"],
        rows: donationOf("sadqa").map((d) => [
          formatDate(d.createdAt),
          d.anonymous ? "Anonymous" : d.donorName,
          d.method.toUpperCase(),
          formatINR(d.amountPaise),
        ]),
      }),
    },
    {
      key: "qarz",
      label: "Qarz / loan",
      sub: qarzFunds.length ? `${qarzFunds.length} fund(s)` : "No qarz fund",
      value: qarz,
      icon: BookOpenCheck,
      tone: "slate",
      table: () => ({
        title: "Qarz / loans",
        subtitle: "Outstanding balance held in loan funds",
        headers: ["Fund", "Code", "Balance"],
        rows: qarzFunds.map((f) => [f.name, f.code, formatINR(f.balancePaise)]),
      }),
    },
    {
      key: "outstanding",
      label: "Total outstanding dues",
      sub: `${label}`,
      value: outstanding,
      icon: Banknote,
      tone: "amber",
      table: () => ({
        title: "Member-wise dues",
        subtitle: label,
        headers: ["Member", "Code", "Paid", "Outstanding", "Since", "Last payment"],
        rows: members.map((m) => {
          const mine = invoices.filter((i) => i.memberId === m.id);
          const paid = mine.reduce((s, i) => s + i.paidPaise, 0);
          const due = mine
            .filter((i) => i.status === "pending" || i.status === "partial")
            .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
          const last = payments
            .filter((p) => p.memberId === m.id && p.status === "verified")
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const firstUnpaid = mine
            .filter((i) => i.status === "pending" || i.status === "partial")
            .sort((a, b) => a.period.localeCompare(b.period))[0];
          return [
            m.name,
            m.code,
            formatINR(paid),
            formatINR(due),
            firstUnpaid ? periodLabel(firstUnpaid.period) : "Clear",
            last ? formatDate(last.createdAt) : "—",
          ];
        }),
      }),
    },
  ];

  if (allowMemberList) {
    cards.push({
      key: "members",
      label: "Total members",
      sub: "Paid, pending, since",
      value: members.length,
      icon: Users,
      tone: "slate",
      table: () => ({
        title: "Member-wise paid / pending",
        subtitle: "All time",
        headers: ["Member", "Code", "Monthly", "Paid", "Pending", "Since", "Status"],
        rows: members.map((m) => {
          const mine = invoices.filter((i) => i.memberId === m.id);
          const paid = mine.reduce((s, i) => s + i.paidPaise, 0);
          const due = mine
            .filter((i) => i.status === "pending" || i.status === "partial")
            .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
          const firstUnpaid = mine
            .filter((i) => i.status === "pending" || i.status === "partial")
            .sort((a, b) => a.period.localeCompare(b.period))[0];
          return [
            m.name,
            m.code,
            formatINR(m.feePaise),
            formatINR(paid),
            formatINR(due),
            firstUnpaid ? periodLabel(firstUnpaid.period) : "Clear",
            m.status,
          ];
        }),
      }),
    });
  }

  function exportCard(format: "csv" | "pdf") {
    if (!table) return;
    const safe = table.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (format === "csv") {
      downloadCsv(`anjuman-${safe}`, table.headers, table.rows);
      toast("Excel (CSV) download ho gaya");
    } else {
      downloadPdfTable(
        `anjuman-${safe}`,
        table.title,
        table.subtitle,
        table.headers,
        table.rows
      );
      toast("PDF table download ho gaya");
    }
  }

  return (
    <>
      <Card className="mt-5">
        <div className="flex flex-wrap items-end gap-3 border-b border-ink-100 p-5">
          <div>
            <p className="text-[13.5px] font-semibold text-ink-900">
              Anjuman analysis
            </p>
            <p className="text-[11.5px] text-ink-500">
              Kisi bhi card par click karo — poora data table khulega, Excel/PDF
              export ke saath.
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <label className="text-[11px] text-ink-500">
              From
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="mt-1 w-[150px]"
              />
            </label>
            <label className="text-[11px] text-ink-500">
              To
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="mt-1 w-[150px]"
              />
            </label>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setFrom("");
                setTo("");
              }}
            >
              All time
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void load()}
              loading={loading}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            </Button>
          </div>
        </div>

        {error && (
          <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-[12px] text-red-700">
            {error}
          </p>
        )}

        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map((c) => (
            <button
              key={c.key}
              onClick={() => setTable(c.table())}
              className="rounded-xl border border-ink-100 p-3.5 text-left transition hover:border-brand-300 hover:bg-brand-50/30"
            >
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  TONES[c.tone]
                )}
              >
                <c.icon className="h-4 w-4" />
              </span>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-ink-400">
                {c.label}
              </p>
              <p className="text-[15px] font-semibold text-ink-900">
                {c.key === "members" ? c.value : formatINR(c.value)}
              </p>
              <p className="text-[11px] text-ink-500">{c.sub}</p>
            </button>
          ))}
        </div>
      </Card>

      <Drawer
        open={!!table}
        onClose={() => setTable(null)}
        title={table?.title ?? ""}
        subtitle={table?.subtitle}
        width="max-w-4xl"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => exportCard("csv")}
              disabled={!table}
            >
              <FileSpreadsheet className="h-4 w-4" /> Excel (CSV)
            </Button>
            <Button onClick={() => exportCard("pdf")} disabled={!table}>
              <Download className="h-4 w-4" /> PDF table
            </Button>
          </div>
        }
      >
        {table && (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-ink-200 bg-ink-50/60 text-left">
                  {table.headers.map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 font-semibold text-ink-700"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-b border-ink-100">
                    {r.map((cell, j) => (
                      <td key={j} className="whitespace-nowrap px-3 py-1.5 text-ink-700">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
                {table.rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={table.headers.length}
                      className="px-3 py-6 text-center text-ink-400"
                    >
                      Koi record nahi mila.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Drawer>
    </>
  );
}
