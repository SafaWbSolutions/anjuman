"use client";

import { useMemo, useState } from "react";
import {
  Gift,
  HeartHandshake,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { members } from "@/lib/mock";
import {
  Avatar,
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
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { formatDate, formatINR, cn } from "@/lib/utils";

interface Donation {
  id: string;
  donorName: string;
  memberId?: string;
  fund: "Masjid Construction" | "Zakat" | "Sadaqah" | "Imam Fund" | "Ramadan Iftar";
  amountPaise: number;
  method: "cash" | "upi" | "gateway" | "cheque";
  date: string;
  anonymous: boolean;
  receiptNo: string;
}

const DONATIONS: Donation[] = [
  { id: "d-1", donorName: "Haji Ashraf Ali", memberId: "m-19", fund: "Masjid Construction", amountPaise: 5000000, method: "gateway", date: "2026-11-09T11:20:00+05:30", anonymous: false, receiptNo: "D-2026-0141" },
  { id: "d-2", donorName: "Anonymous", fund: "Zakat", amountPaise: 1500000, method: "upi", date: "2026-11-08T20:10:00+05:30", anonymous: true, receiptNo: "D-2026-0140" },
  { id: "d-3", donorName: "Dr. Farhan Qureshi", memberId: "m-7", fund: "Imam Fund", amountPaise: 1000000, method: "upi", date: "2026-11-05T14:05:00+05:30", anonymous: false, receiptNo: "D-2026-0139" },
  { id: "d-4", donorName: "Salman Ansari", memberId: "m-13", fund: "Sadaqah", amountPaise: 250000, method: "cash", date: "2026-11-03T09:30:00+05:30", anonymous: false, receiptNo: "D-2026-0138" },
  { id: "d-5", donorName: "Anonymous", fund: "Ramadan Iftar", amountPaise: 600000, method: "gateway", date: "2026-10-29T18:45:00+05:30", anonymous: true, receiptNo: "D-2026-0137" },
  { id: "d-6", donorName: "Bilal Ahmad", memberId: "m-22", fund: "Masjid Construction", amountPaise: 2000000, method: "cheque", date: "2026-10-25T12:00:00+05:30", anonymous: false, receiptNo: "D-2026-0136" },
];

export default function DonationsPage() {
  const [q, setQ] = useState("");
  const [fund, setFund] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const rows = useMemo(
    () =>
      DONATIONS.filter((d) => {
        if (fund !== "all" && d.fund !== fund) return false;
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          d.donorName.toLowerCase().includes(term) ||
          d.receiptNo.toLowerCase().includes(term) ||
          d.fund.toLowerCase().includes(term)
        );
      }),
    [q, fund]
  );

  const thisMonth = DONATIONS.filter((d) => d.date.startsWith("2026-11")).reduce((s, d) => s + d.amountPaise, 0);
  const zakat = DONATIONS.filter((d) => d.fund === "Zakat").reduce((s, d) => s + d.amountPaise, 0);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Donations"
        description="Track sadaqah, zakat and project donations separately. Zakat is a restricted fund — it can never be used for masjid expenses."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> Record donation
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Received this month" value={formatINR(thisMonth)} sub={`${DONATIONS.filter((d) => d.date.startsWith("2026-11")).length} donations`} icon={HeartHandshake} tone="green" />
        <StatCard label="Zakat (restricted)" value={formatINR(zakat)} sub="Separate fund" icon={ShieldCheck} tone="violet" />
        <StatCard label="Donors this year" value="42" sub="9 recurring" icon={Users} tone="blue" />
        <StatCard label="Avg. donation" value={formatINR(Math.round(DONATIONS.reduce((s, d) => s + d.amountPaise, 0) / DONATIONS.length))} sub="All funds" icon={Gift} tone="brand" />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Donor, receipt or fund…" className="w-full sm:w-72" />
        <Select value={fund} onChange={(e) => setFund(e.target.value)} className="w-auto py-2 text-[12.5px]">
          <option value="all">All funds</option>
          {["Masjid Construction", "Zakat", "Sadaqah", "Imam Fund", "Ramadan Iftar"].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">{rows.length} donations</span>
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr className="table-head">
              <Th>Donor</Th>
              <Th>Fund</Th>
              <Th>Date</Th>
              <Th>Method</Th>
              <Th>Receipt</Th>
              <Th className="text-right">Amount</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((d) => {
              const m = d.memberId ? members.find((x) => x.id === d.memberId) : undefined;
              return (
                <tr key={d.id} className="hover:bg-ink-50/60">
                  <Td>
                    <div className="flex items-center gap-2.5">
                      {d.anonymous ? (
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-[11px] text-ink-500">
                          ?
                        </span>
                      ) : (
                        <Avatar name={d.donorName} size="sm" />
                      )}
                      <div className="min-w-0">
                        <p className="text-[12.5px] font-medium text-ink-900">{d.donorName}</p>
                        {m && <p className="font-mono text-[10px] text-ink-400">{m.code}</p>}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={d.fund === "Zakat" ? "violet" : "brand"}>{d.fund}</Badge>
                  </Td>
                  <Td className="text-[12px] text-ink-500">{formatDate(d.date)}</Td>
                  <Td>
                    <Badge tone="slate">{d.method.toUpperCase()}</Badge>
                  </Td>
                  <Td>
                    <span className="font-mono text-[11px] text-ink-600">{d.receiptNo}</span>
                  </Td>
                  <Td className="text-right font-medium">{formatINR(d.amountPaise)}</Td>
                  <Td className="text-right">
                    <button onClick={() => toast("Donation receipt opened")} className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700">
                      <ReceiptText className="h-3.5 w-3.5" /> Receipt
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <div className="flex items-start gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3 text-[11.5px] text-ink-500">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Anonymous donations still create a receipt number and ledger entry — only
          the donor identity is hidden from public reports.
        </div>
      </Card>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Record donation"
        subtitle="Issue a numbered receipt immediately"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast("Donation recorded · receipt issued"); setAddOpen(false); }}>
              Save &amp; receipt
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Donor name (or Anonymous)" className="sm:col-span-2">
            <Input placeholder="e.g. Haji Ashraf Ali" />
          </Field>
          <Field label="Fund" hint="Zakat must be spent only on eligible recipients.">
            <Select defaultValue="Sadaqah">
              {["Sadaqah", "Zakat", "Masjid Construction", "Imam Fund", "Ramadan Iftar"].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)">
            <Input inputMode="numeric" placeholder="0" />
          </Field>
          <Field label="Method">
            <Select defaultValue="cash">
              <option value="cash">Cash</option>
              <option value="upi">UPI</option>
              <option value="gateway">Gateway</option>
              <option value="cheque">Cheque</option>
            </Select>
          </Field>
          <Field label="Reference">
            <Input placeholder="UPI / cheque number" />
          </Field>
          <label className={cn("flex items-center gap-2.5 rounded-xl border border-ink-200 px-3.5 py-3 text-[12.5px] text-ink-700 sm:col-span-2")}>
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" />
            Keep donor name private (show as “Anonymous”)
          </label>
        </div>
      </Drawer>
    </>
  );
}
