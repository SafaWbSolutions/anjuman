"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Gift,
  HeartHandshake,
  Plus,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Donation, Fund, Member } from "@/lib/types";
import {
  createDonation,
  listDonations,
  listFunds,
  listMembers,
  rejectDonation,
  verifyDonation,
  type NewDonation,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
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
  StatusPill,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { formatDate, formatINR, cn } from "@/lib/utils";

/** A fund is treated as Zakat when its name says so — used for the
 *  restricted-fund stat and the filter chip. */
function isZakatFund(name: string | undefined) {
  return !!name && /zakat/i.test(name);
}

export default function DonationsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [fundFilter, setFundFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);

  const [donations, setDonations] = useState<Donation[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canRecord =
    user?.role === "sadar" ||
    user?.role === "secretary" ||
    user?.role === "khajanchi" ||
    user?.role === "auditor" ||
    user?.role === "collector";
  const canVerify =
    user?.role === "sadar" ||
    user?.role === "khajanchi" ||
    user?.role === "auditor";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [donationRows, fundRows, memberRows] = await Promise.all([
        listDonations(),
        listFunds(),
        listMembers(),
      ]);
      setDonations(donationRows);
      setFunds(fundRows);
      setMembers(memberRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Donations load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const fundMap = useMemo(() => new Map(funds.map((f) => [f.id, f])), [funds]);
  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const fundOptions = useMemo(() => funds.map((f) => f.name), [funds]);

  const rows = useMemo(
    () =>
      donations.filter((d) => {
        if (fundFilter !== "all") {
          const fund = fundMap.get(d.fundId);
          if (!fund || fund.name !== fundFilter) return false;
        }
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          d.donorName.toLowerCase().includes(term) ||
          d.receiptNo.toLowerCase().includes(term) ||
          (fundMap.get(d.fundId)?.name ?? "").toLowerCase().includes(term)
        );
      }),
    [donations, q, fundFilter, fundMap]
  );

  const thisMonth = donations
    .filter((d) => d.createdAt.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((s, d) => s + d.amountPaise, 0);
  const zakat = donations
    .filter((d) => isZakatFund(fundMap.get(d.fundId)?.name))
    .reduce((s, d) => s + d.amountPaise, 0);

  const pendingCount = donations.filter((d) => d.status === "pending").length;
  const verifiedCount = donations.filter((d) => d.status === "verified").length;

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Donations"
        description="Track sadaqah, zakat and project donations separately. Zakat is a restricted fund — it can never be used for masjid expenses."
        actions={
          canRecord ? (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Record donation
            </Button>
          ) : null
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Received this month"
          value={formatINR(thisMonth)}
          sub={`${donations.filter((d) => d.createdAt.startsWith(new Date().toISOString().slice(0, 7))).length} donations`}
          icon={HeartHandshake}
          tone="green"
        />
        <StatCard
          label="Zakat (restricted)"
          value={formatINR(zakat)}
          sub="Separate fund"
          icon={ShieldCheck}
          tone="violet"
        />
        <StatCard
          label="Pending verification"
          value={String(pendingCount)}
          sub={canVerify ? "Verify now" : "Awaiting office"}
          icon={Users}
          tone="amber"
        />
        <StatCard
          label="Avg. donation"
          value={
            formatINR(
              donations.length
                ? Math.round(donations.reduce((s, d) => s + d.amountPaise, 0) / donations.length)
                : 0
            )
          }
          sub="All funds"
          icon={Gift}
          tone="brand"
        />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Donor, receipt or fund…"
          className="w-full sm:w-72"
        />
        <Select
          value={fundFilter}
          onChange={(e) => setFundFilter(e.target.value)}
          className="w-auto py-2 text-[12.5px]"
        >
          <option value="all">All funds</option>
          {fundOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">
          {rows.length} donations · {verifiedCount} verified · {pendingCount} pending
        </span>
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
              <Th>Status</Th>
              <Th />
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((d) => {
              const m = d.memberId ? memberMap.get(d.memberId) : undefined;
              const fund = fundMap.get(d.fundId);
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
                    <Badge tone={isZakatFund(fund?.name) ? "violet" : "brand"}>
                      {fund?.name ?? "—"}
                    </Badge>
                  </Td>
                  <Td className="text-[12px] text-ink-500">{formatDate(d.createdAt)}</Td>
                  <Td>
                    <Badge tone="slate">{d.method.toUpperCase()}</Badge>
                  </Td>
                  <Td>
                    <span className="font-mono text-[11px] text-ink-600">
                      {d.receiptNo || "—"}
                    </span>
                  </Td>
                  <Td className="text-right font-medium">{formatINR(d.amountPaise)}</Td>
                  <Td>
                    <StatusPill
                      status={
                        d.status === "verified"
                          ? "paid"
                          : d.status === "pending"
                          ? "partial"
                          : d.status === "rejected"
                          ? "rejected"
                          : "pending"
                      }
                    />
                  </Td>
                  <Td className="text-right">
                    {d.status === "pending" && canVerify && (
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            try {
                              await verifyDonation(d.id);
                              toast("Donation verified · receipt issued");
                              if (!isDemoMode) await load();
                              else {
                                setDonations((prev) =>
                                  prev.map((x) =>
                                    x.id === d.id
                                      ? { ...x, status: "verified", receiptNo: `D-DEMO-${Date.now()}`, verifiedAt: new Date().toISOString() }
                                      : x
                                  )
                                );
                              }
                            } catch (e) {
                              toast(e instanceof Error ? e.message : "Verify failed", "error");
                            }
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-700 hover:bg-red-50"
                          onClick={async () => {
                            const reason = prompt("Rejection reason:");
                            if (!reason) return;
                            try {
                              await rejectDonation(d.id, reason);
                              toast("Donation rejected");
                              if (!isDemoMode) await load();
                              else {
                                setDonations((prev) =>
                                  prev.map((x) =>
                                    x.id === d.id ? { ...x, status: "rejected", note: reason } : x
                                  )
                                );
                              }
                            } catch (e) {
                              toast(e instanceof Error ? e.message : "Reject failed", "error");
                            }
                          }}
                        >
                          <ReceiptText className="h-3.5 w-3.5" /> Reject
                        </Button>
                      </div>
                    )}
                    {d.receiptNo && (
                      <button
                        onClick={() => toast("Donation receipt opened")}
                        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700"
                      >
                        <ReceiptText className="h-3.5 w-3.5" /> Receipt
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <div className="flex items-start gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3 text-[11.5px] text-ink-500">
          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Anonymous donations still create a receipt number and ledger entry — only
          the donor identity is hidden from public reports. Zakat fund is restricted
          and can only be spent on eligible recipients per Shariah.
        </div>
      </Card>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Record donation"
        subtitle="Issue a numbered receipt immediately"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="donation-form">
              Save & receipt
            </Button>
          </div>
        }
      >
        <DonationForm
          funds={funds}
          members={members}
          onSubmit={submitDonation}
          onClose={() => setAddOpen(false)}
        />
      </Drawer>
    </>
  );

  async function submitDonation(data: NewDonation) {
    try {
      await createDonation(data);
      toast("Donation recorded · pending verification");
      setAddOpen(false);
      if (!isDemoMode) await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Donation record nahi hua", "error");
    }
  }
}

/* ── Donation Form ────────────────────────────────────────────── */

function DonationForm({
  funds,
  members,
  onSubmit,
  onClose,
}: {
  funds: Fund[];
  members: Member[];
  onSubmit: (data: NewDonation) => Promise<void>;
  onClose: () => void;
}) {
  const [donorName, setDonorName] = useState("");
  const [fundId, setFundId] = useState(funds[0]?.id ?? "");
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<NewDonation["method"]>("cash");
  const [reference, setReference] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!donorName.trim()) return toast("Donor name is required", "error");
    const amountPaise = Math.round(Number(amount || "0") * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0)
      return toast("Enter a valid amount", "error");

    setSaving(true);
    try {
      await onSubmit({
        fundId,
        donorName: donorName.trim(),
        memberId: anonymous ? null : memberId || null,
        amountPaise,
        method,
        reference: reference.trim() || undefined,
        anonymous,
        note: note.trim() || undefined,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form id="donation-form" onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-2 p-2">
      <Field label="Donor name (or Anonymous)" className="sm:col-span-2">
        <Input
          value={donorName}
          onChange={(e) => setDonorName(e.target.value)}
          placeholder="e.g. Haji Ashraf Ali"
          disabled={anonymous}
        />
      </Field>
      <Field label="Fund" hint="Zakat must be spent only on eligible recipients.">
        <Select value={fundId} onChange={(e) => setFundId(e.target.value)}>
          {funds.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} {f.restricted ? "🔒" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount (₹)">
        <Input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="numeric"
          placeholder="0"
        />
      </Field>
      <Field label="Method">
        <Select value={method} onChange={(e) => setMethod(e.target.value as NewDonation["method"])}>
          <option value="cash">Cash</option>
          <option value="upi">UPI</option>
          <option value="gateway">Gateway</option>
          <option value="cheque">Cheque</option>
        </Select>
      </Field>
      <Field label="Reference" hint="UPI ID / Cheque no / Gateway order ID">
        <Input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Optional"
        />
      </Field>
      <Field label="Member (optional)" className="sm:col-span-2">
        <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
          <option value="">Not linked to a member</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.code}
            </option>
          ))}
        </Select>
      </Field>
      <label className={cn("flex items-center gap-2.5 rounded-xl border border-ink-200 px-3.5 py-3 text-[12.5px] text-ink-700 sm:col-span-2")}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-emerald-600"
          checked={anonymous}
          onChange={(e) => {
            setAnonymous(e.target.checked);
            if (e.target.checked) setMemberId("");
          }}
        />
        Keep donor name private (show as “Anonymous”)
      </label>
      <Field label="Note (internal)" className="sm:col-span-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. For new minaret, Zakat al-Fitr, etc."
        />
      </Field>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-900 sm:col-span-2">
        <strong>Maker–checker applies:</strong> The person recording this cannot verify it.
        A different office bearer must verify to issue the receipt and update the fund balance.
      </div>
    </form>
  );
}