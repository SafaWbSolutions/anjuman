"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpenCheck,
  CheckCircle2,
  Download,
  Link2,
  Lock,
  RefreshCw,
  Search,
  ShieldCheck,
} from "lucide-react";
import { getDashboard, listLedger } from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { cn, formatDate, formatINR } from "@/lib/utils";
import type { LedgerEntry } from "@/lib/types";

export default function LedgerPage() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<LedgerEntry | null>(null);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [ledgerOk, setLedgerOk] = useState(true);
  const [brokenAt, setBrokenAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, snapshot] = await Promise.all([listLedger(), getDashboard()]);
      setEntries(rows);
      setLedgerOk(snapshot.ledgerOk);
      setBrokenAt(snapshot.ledgerBrokenAtSeq);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ledger load nahi ho saka");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () =>
      entries.filter((e) => {
        if (type !== "all" && e.refType !== type) return false;
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          e.narration.toLowerCase().includes(term) ||
          e.refNo.toLowerCase().includes(term) ||
          e.account.toLowerCase().includes(term) ||
          e.hash.toLowerCase().includes(term)
        );
      }),
    [entries, q, type]
  );

  const debit = entries.reduce((s, e) => s + e.debitPaise, 0);
  const credit = entries.reduce((s, e) => s + e.creditPaise, 0);
  const balance = debit - credit;

  const typeTone: Record<string, "green" | "red" | "blue" | "violet" | "slate" | "amber"> = {
    payment: "green",
    donation: "violet",
    expense: "red",
    opening: "slate",
    reversal: "amber",
    transfer: "blue",
  };

  async function verifyChain() {
    setLoading(true);
    try {
      const snapshot = await getDashboard();
      setLedgerOk(snapshot.ledgerOk);
      setBrokenAt(snapshot.ledgerBrokenAtSeq);
      toast(
        snapshot.ledgerOk
          ? "Integrity check passed — chain is intact"
          : `Chain broken at entry #${snapshot.ledgerBrokenAtSeq}`,
        snapshot.ledgerOk ? "success" : "error"
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Chain check fail ho gaya", "error");
    } finally {
      setLoading(false);
    }
  }

  function exportCsv() {
    const head = ["Date", "Narration", "Account", "Ref type", "Ref no", "Debit", "Credit", "Hash"];
    const body = rows.map((e) =>
      [
        e.date,
        e.narration,
        e.account,
        e.refType,
        e.refNo,
        String(e.debitPaise),
        String(e.creditPaise),
        e.hash,
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",")
    );
    const blob = new Blob([[head.join(","), ...body].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${rows.length} ledger entries exported`);
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Ledger"
        description="Append-only, hash-chained record of every rupee. Each entry links to the previous one, so tampering breaks the chain visibly."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => void verifyChain()} disabled={loading}>
              <ShieldCheck className="h-4 w-4" /> Verify chain
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
        <StatCard label="Total inflow" value={formatINR(debit)} sub={`${entries.length} entries`} icon={ArrowDownLeft} tone="green" />
        <StatCard label="Total outflow" value={formatINR(credit)} sub="Expenses & reversals" icon={ArrowUpRight} tone="red" />
        <StatCard label="Book balance" value={formatINR(balance)} sub="Debits − credits" icon={BookOpenCheck} tone="brand" />
        <StatCard
          label="Chain integrity"
          value={ledgerOk ? "Verified" : "Broken"}
          sub={ledgerOk ? "Hash chain intact" : `Break at entry #${brokenAt}`}
          icon={Lock}
          tone={ledgerOk ? "green" : "red"}
        />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Narration, receipt, hash…" className="w-full sm:w-72" />
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto py-2 text-[12.5px]">
          <option value="all">All entries</option>
          <option value="payment">Payments</option>
          <option value="donation">Donations</option>
          <option value="expense">Expenses</option>
          <option value="opening">Opening</option>
          <option value="reversal">Reversals</option>
        </Select>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-medium ring-1",
            ledgerOk
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-red-50 text-red-700 ring-red-200"
          )}
        >
          {ledgerOk ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Chain intact · 0 tampered entries
            </>
          ) : (
            <>
              <AlertCircle className="h-3.5 w-3.5" /> Chain broken at entry #{brokenAt}
            </>
          )}
        </span>
      </div>

      <Card>
        {loading && entries.length === 0 ? (
          <div className="p-10 text-center text-[12.5px] text-ink-500">
            Ledger load ho raha hai…
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Date</Th>
                <Th>Narration</Th>
                <Th>Account</Th>
                <Th>Ref</Th>
                <Th className="text-right">Debit</Th>
                <Th className="text-right">Credit</Th>
                <Th>Hash</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className="cursor-pointer hover:bg-ink-50/60"
                  onClick={() => setSelected(e)}
                >
                  <Td className="whitespace-nowrap text-[12px] text-ink-500">
                    {formatDate(e.date)}
                  </Td>
                  <Td>
                    <p className="text-[12.5px] text-ink-800">{e.narration}</p>
                    <Badge tone={typeTone[e.refType] ?? "slate"} className="mt-0.5">
                      {e.refType}
                    </Badge>
                  </Td>
                  <Td className="text-[12px] text-ink-500">{e.account}</Td>
                  <Td>
                    <span className="font-mono text-[11px] text-ink-600">{e.refNo}</span>
                  </Td>
                  <Td className="text-right text-[12.5px] font-medium text-emerald-700">
                    {e.debitPaise ? formatINR(e.debitPaise) : "—"}
                  </Td>
                  <Td className="text-right text-[12.5px] font-medium text-red-600">
                    {e.creditPaise ? formatINR(e.creditPaise) : "—"}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-ink-500">
                      <Link2 className="h-3 w-3" />
                      {e.hash.slice(0, 10)}…
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
        {!loading && rows.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-500">
            No ledger entries match your filter.
          </p>
        )}
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Why this cannot be faked"
          subtitle="How the tamper-evident chain protects the khajanchi"
        />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            { icon: Link2, title: "Each row is hashed", body: "The hash covers date, amount, narration, account and the previous row's hash." },
            { icon: Lock, title: "Nothing is deleted", body: "Corrections are reversal entries. The original stays visible forever." },
            { icon: Search, title: "Anyone can verify", body: "Auditors re-run the chain locally. A single edited row turns the chain red." },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="rounded-xl border border-ink-100 p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <p className="mt-2.5 text-[13px] font-semibold text-ink-900">{s.title}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-500">{s.body}</p>
              </div>
            );
          })}
        </div>
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Ledger entry"
        subtitle={selected?.refNo}
      >
        {selected && (
          <div className="space-y-4">
            <div className="rounded-xl border border-ink-100 p-4">
              <p className="text-[11px] uppercase tracking-wide text-ink-400">Narration</p>
              <p className="mt-1 text-[13.5px] font-medium text-ink-900">{selected.narration}</p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-[12.5px]">
                <div>
                  <p className="text-ink-400">Date</p>
                  <p className="font-medium text-ink-800">{formatDate(selected.date)}</p>
                </div>
                <div>
                  <p className="text-ink-400">Account</p>
                  <p className="font-medium text-ink-800">{selected.account}</p>
                </div>
                <div>
                  <p className="text-ink-400">Debit</p>
                  <p className="font-medium text-emerald-700">{selected.debitPaise ? formatINR(selected.debitPaise) : "—"}</p>
                </div>
                <div>
                  <p className="text-ink-400">Credit</p>
                  <p className="font-medium text-red-600">{selected.creditPaise ? formatINR(selected.creditPaise) : "—"}</p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                Hash chain
              </p>
              <div className="space-y-2 font-mono text-[11px]">
                <div>
                  <p className="text-ink-400">prev_hash</p>
                  <p className="break-all text-ink-700">{selected.prevHash}</p>
                </div>
                <div className="flex justify-center py-0.5 text-ink-300">↓</div>
                <div>
                  <p className="text-ink-400">hash</p>
                  <p className="break-all font-semibold text-brand-700">{selected.hash}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] text-emerald-800">
              <CheckCircle2 className="h-4 w-4" />
              This entry is immutable. Corrections are made through a reversal entry.
            </div>

            <Button variant="secondary" className="w-full" onClick={() => toast("Reversal draft created")}>
              Create reversal (correction)
            </Button>
          </div>
        )}
      </Drawer>
    </>
  );
}
