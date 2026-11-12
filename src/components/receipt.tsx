"use client";

import { useRef, useState } from "react";
import { Download, Printer, Share2 } from "lucide-react";
import type { Member, PaymentMethod, Tenant } from "@/lib/types";
import {
  amountInWords,
  cn,
  downloadNodePng,
  formatDate,
  formatINR,
  periodLabel,
  printArea,
  shareNodeOnWhatsApp,
} from "@/lib/utils";
import { Badge, Button, Drawer, toast } from "@/components/ui";

export interface ReceiptInfo {
  receiptNo: string;
  member: Member;
  amount: number;
  method: PaymentMethod;
  months: string[];
  reference: string;
  date: string;
}

export function methodLabel(method: PaymentMethod): string {
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

/* ═══════════════════════════════════════════════════════════════
   Receipt preview (thermal 58mm / 80mm) — shared by every panel,
   so an old payment slip can always be downloaded again.
   ═══════════════════════════════════════════════════════════════ */

export function ReceiptDrawer({
  receipt,
  tenant,
  onClose,
}: {
  receipt: ReceiptInfo | null;
  tenant: Tenant;
  onClose: () => void;
}) {
  const [size, setSize] = useState<"58" | "80">("80");
  const [busy, setBusy] = useState<"download" | "share" | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);
  if (!receipt) return null;
  const { member, amount, months } = receipt;

  async function downloadReceipt() {
    if (!receiptRef.current || !receipt) return;
    setBusy("download");
    try {
      await downloadNodePng(receiptRef.current, `${receipt.receiptNo}.png`);
      toast("Receipt PNG download ho gaya");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download fail ho gaya", "error");
    } finally {
      setBusy(null);
    }
  }

  async function shareReceipt() {
    if (!receiptRef.current || !receipt) return;
    setBusy("share");
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const text = [
        `${tenant.name} — payment receipt`,
        `${receipt.receiptNo} · ${formatINR(amount)}`,
        `${member.name} (${member.code})`,
        `Period: ${months.map(periodLabel).join(", ")}`,
        `Verify: ${origin}/verify/?id=${member.code}`,
      ].join("\n");
      const res = await shareNodeOnWhatsApp(
        receiptRef.current,
        `${receipt.receiptNo}.png`,
        text
      );
      if (res === "shared") toast("WhatsApp share sheet khul gaya");
      else if (res === "downloaded") toast("PNG download hua — WhatsApp me attach kar dein");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Share fail ho gaya", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Drawer
      open={!!receipt}
      onClose={onClose}
      title="Receipt"
      subtitle={receipt.receiptNo}
      width="max-w-md"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            loading={busy === "download"}
            onClick={() => void downloadReceipt()}
          >
            <Download className="h-4 w-4" /> PNG
          </Button>
          <Button
            variant="secondary"
            loading={busy === "share"}
            onClick={() => void shareReceipt()}
          >
            <Share2 className="h-4 w-4" /> WhatsApp
          </Button>
          <Button onClick={() => printArea()}>
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
          ref={receiptRef}
          className={cn(
            "print-area bg-white p-3 shadow-sm",
            size === "58" ? "receipt-58" : "receipt-80"
          )}
        >
          <div className="text-center">
            {tenant.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logoUrl}
                alt=""
                className="mx-auto mb-1 h-9 w-9 object-contain"
              />
            )}
            <p className="text-[13px] font-bold tracking-wide">{tenant.name}</p>
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
          <p className="mt-0.5 text-[8.5px] capitalize">{amountInWords(amount)}</p>
          <div className="my-1.5 border-t border-dashed border-black" />
          <p className="text-center text-[8px]">Received by: Khajanchi / Collector</p>
          <p className="text-center text-[8px]">This is a computer-generated receipt.</p>
          <p className="mt-1 text-center text-[8px] font-semibold">انجمن — جزاک اللہ خیر</p>
          <p className="mt-1 text-center text-[7px]">
            Verify: anjuman.app/verify · {receipt.receiptNo}
          </p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[11.5px] leading-relaxed text-brand-900">
        <span className="font-semibold">Ledger entry written.</span> This receipt is
        immutable — any correction must be done through a reversal entry, so the audit
        trail always remains complete.
      </div>
    </Drawer>
  );
}

export function receiptOf(p: {
  receiptNo: string;
  member: Member;
  amountPaise: number;
  method: PaymentMethod;
  reference: string;
  createdAt: string;
}): ReceiptInfo {
  return {
    receiptNo: p.receiptNo,
    member: p.member,
    amount: p.amountPaise,
    method: p.method,
    months: [p.createdAt.slice(0, 7)],
    reference: p.reference,
    date: p.createdAt,
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
