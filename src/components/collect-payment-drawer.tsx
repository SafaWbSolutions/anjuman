"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, Search } from "lucide-react";
import type { Invoice, Member, Payment, PaymentMethod } from "@/lib/types";
import { createPayment } from "@/lib/repo";
import {
  amountInWords,
  cn,
  formatDate,
  formatINR,
  periodLabel,
} from "@/lib/utils";
import {
  Avatar,
  Button,
  Drawer,
  Field,
  SearchInput,
  Select,
  toast,
} from "@/components/ui";
import { ProgressBar } from "@/components/charts";

function localToday(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Record a collection. The DB forces status = pending; a second office
 * bearer verifies it and a receipt number is issued only then.
 *
 * The collection date is deliberately separate from the entry date: a
 * payment received two days ago can be entered today and still land in
 * the correct day/month in the ledger and reports.
 */
export function CollectPaymentDrawer({
  open,
  members,
  invoices,
  defaultMemberId,
  onClose,
  onSaved,
}: {
  open: boolean;
  members: Member[];
  invoices: Invoice[];
  defaultMemberId?: string;
  onClose: () => void;
  onSaved: (payment: Payment) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [member, setMember] = useState<Member | null>(null);
  const [mode, setMode] = useState<"1" | "2" | "all">("1");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [sameAsToday, setSameAsToday] = useState(true);
  const [date, setDate] = useState(localToday());
  const [saving, setSaving] = useState(false);

  const today = localToday();

  const duesFor = (memberId: string) =>
    invoices
      .filter(
        (i) =>
          i.memberId === memberId &&
          (i.status === "pending" || i.status === "partial")
      )
      .sort((a, b) => a.period.localeCompare(b.period));

  const dueTotalOf = (memberId: string) =>
    duesFor(memberId).reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);

  const dues = member ? duesFor(member.id) : [];
  const months =
    mode === "1" ? dues.slice(0, 1) : mode === "2" ? dues.slice(0, 2) : dues;
  const total = months.reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    return members
      .filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.code.toLowerCase().includes(term) ||
          m.phone.includes(term)
      )
      .slice(0, 6);
  }, [members, q]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setMode("1");
    setMethod("cash");
    setReference("");
    setNote("");
    setSameAsToday(true);
    setDate(localToday());
    setMember(
      defaultMemberId
        ? members.find((m) => m.id === defaultMemberId) ?? null
        : null
    );
  }, [open, defaultMemberId, members]);

  function reset() {
    setQ("");
    setMember(null);
    setMode("1");
    setMethod("cash");
    setReference("");
    setNote("");
    setSameAsToday(true);
    setDate(localToday());
  }

  async function submit() {
    if (!member) return toast("Select a member first", "error");
    if (total <= 0) return toast("No dues to collect", "error");
    if (method !== "cash" && !reference.trim()) {
      return toast("UTR / transaction / cheque number required", "error");
    }
    if (!sameAsToday && date > today) {
      return toast("Collection date future me nahi ho sakti", "error");
    }

    // Today = exact time; backdated = local noon so the date cannot
    // slip into the previous/next day because of a timezone conversion.
    const createdAt =
      sameAsToday || date === today
        ? new Date().toISOString()
        : new Date(`${date}T12:00:00`).toISOString();

    setSaving(true);
    try {
      const payment = await createPayment({
        memberId: member.id,
        amountPaise: total,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
        createdAt,
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

          {/* method + date */}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Payment method">
              <Select
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI / Online transfer</option>
                <option value="gateway">Payment gateway</option>
                <option value="cheque">Cheque</option>
              </Select>
            </Field>
            <Field label="Collection date" hint="Aaj se pehle ki date choose kar sakte hain.">
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="input flex-1"
                  value={sameAsToday ? today : date}
                  max={today}
                  disabled={sameAsToday}
                  onChange={(e) => setDate(e.target.value)}
                />
                <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11.5px] text-ink-600">
                  <input
                    type="checkbox"
                    checked={sameAsToday}
                    onChange={(e) => setSameAsToday(e.target.checked)}
                  />
                  Same as today
                </label>
              </div>
            </Field>
          </div>

          {/* reference + remarks */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="UTR / transaction / cheque no."
              hint={method === "cash" ? "Cash ke liye optional." : "Bank/UPI statement se match karein."}
            >
              <input
                className="input font-mono"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder={method === "cash" ? "Optional" : "UPI/123456 / pay_R…"}
              />
            </Field>
            <Field label="Remarks / note" hint="Member ko receipt par bhi dikhega.">
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. paid at masjid, 2 months"
              />
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
