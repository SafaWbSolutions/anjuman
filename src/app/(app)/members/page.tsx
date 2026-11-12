"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Camera,
  Download,
  Filter,
  IdCard,
  Loader2,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { activeTenant } from "@/lib/mock";
import { useAuth } from "@/lib/auth";
import type { Invoice, Member, Payment, Tenant } from "@/lib/types";
import {
  createMember,
  createMemberLogin,
  generateInvoices,
  generateMemberDues,
  getCurrentTenant,
  listInvoices,
  listMembers,
  listPayments,
  removeMember,
  requestFeeChange,
  requestPaymentEdit,
  requestPaymentReset,
  restoreMember,
  saveMemberDetails,
  uploadAvatar,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import { formatINR, formatDate, periodLabel, cn } from "@/lib/utils";
import { ReceiptDrawer, receiptOf, type ReceiptInfo } from "@/components/receipt";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  PageHeader,
  PhoneInput,
  SearchInput,
  Select,
  StatusPill,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";

function toCsv(rows: Member[]): string {
  const head = ["Member ID", "Name", "Father", "House", "Mohalla", "Phone", "Type", "Status", "Monthly (paise)"];
  const body = rows.map((m) =>
    [m.code, m.name, m.fatherName, m.household, m.mohalla, m.phone, m.type, m.status, String(m.feePaise)]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [head.join(","), ...body].join("\r\n");
}

/** Supabase returns plain objects, not Error instances — keep the real reason. */
function errorText(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message;
  if (e && typeof e === "object" && "message" in e) {
    const msg = (e as { message?: unknown }).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return fallback;
}

export default function MembersPage() {
  const [q, setQ] = useState("");
  const [mohalla, setMohalla] = useState("all");
  // Removed members with financial history are archived (inactive), not
  // deleted. Default to active so the member actually disappears from the
  // list after removal; archived rows are still available via the filter.
  const [status, setStatus] = useState("active");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<Member | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [loginMember, setLoginMember] = useState<Member | null>(null);
  const [editMember, setEditMember] = useState<Member | null>(null);
  const [editPayment, setEditPayment] = useState<Payment | null>(null);

  const [members, setMembers] = useState<Member[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [memberRows, invoiceRows, paymentRows, tenantRow] = await Promise.all([
        listMembers(),
        listInvoices(),
        listPayments(),
        getCurrentTenant(),
      ]);
      setMembers(memberRows);
      setInvoices(invoiceRows);
      setPayments(paymentRows);
      setTenant(tenantRow);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Members load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const mohallas = useMemo(
    () => Array.from(new Set(members.map((m) => m.mohalla).filter(Boolean))),
    [members]
  );

  const dueTotalOf = useCallback(
    (memberId: string) =>
      invoices
        .filter(
          (i) =>
            i.memberId === memberId &&
            (i.status === "pending" || i.status === "partial")
        )
        .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0),
    [invoices]
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return members.filter((m) => {
      if (mohalla !== "all" && m.mohalla !== mohalla) return false;
      if (status !== "all" && m.status !== status) return false;
      if (type !== "all" && m.type !== type) return false;
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.code.toLowerCase().includes(term) ||
        m.phone.replace(/\s/g, "").includes(term.replace(/\s/g, "")) ||
        m.household.toLowerCase() === term
      );
    });
  }, [members, q, mohalla, status, type]);

  const exactIdMatch =
    q.trim().length > 5
      ? members.find((m) => m.code.toLowerCase() === q.trim().toLowerCase())
      : undefined;

  function exportCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `members-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`${filtered.length} members exported as CSV`);
  }

  const tenantName = tenant?.name ?? activeTenant.name;
  const village = tenant?.village ?? activeTenant.village;
  const activeCount = members.filter((m) => m.status === "active").length;
  const archivedCount = members.filter((m) => m.status === "inactive").length;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Members"
        description={`${activeCount} active member${activeCount === 1 ? "" : "s"}${archivedCount ? ` · ${archivedCount} archived` : ""} across ${new Set(members.map((m) => m.household).filter(Boolean)).size} households in ${village}.`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add member
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

      {/* ── Member ID quick lookup ──────────────────────────── */}
      <Card className="mb-5 overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <IdCard className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-ink-800">
                Find by Member ID
              </p>
              <p className="text-[11.5px] text-ink-500">
                Any member of this anjuman — e.g. BHR-000012-4
              </p>
            </div>
          </div>
          <div className="w-full sm:w-72">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Name, phone, ID or house no…"
            />
          </div>
        </div>
        {exactIdMatch && (
          <div className="flex flex-wrap items-center gap-3 border-t border-brand-100 bg-brand-50/60 px-4 py-3">
            <BadgeCheck className="h-4 w-4 text-brand-600" />
            <span className="text-[12.5px] text-brand-900">
              Exact ID match found
            </span>
            <button
              onClick={() => setSelected(exactIdMatch)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50"
            >
              Open {exactIdMatch.code}
            </button>
          </div>
        )}
      </Card>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[12px] text-ink-500">
          <Filter className="h-3.5 w-3.5" /> Filters
        </div>
        <Select
          value={mohalla}
          onChange={(e) => setMohalla(e.target.value)}
          className="h-9 w-auto py-1.5 text-[12.5px]"
        >
          <option value="all">All mohallas</option>
          {mohallas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </Select>
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="h-9 w-auto py-1.5 text-[12.5px]"
        >
          <option value="all">All types</option>
          <option value="member">Member</option>
          <option value="donor">Donor</option>
          <option value="imam">Imam</option>
          <option value="muazzin">Muazzin</option>
          <option value="staff">Staff</option>
        </Select>
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-9 w-auto py-1.5 text-[12.5px]"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive / archived</option>
          <option value="pending">Pending</option>
          <option value="all">All statuses</option>
        </Select>
        {(mohalla !== "all" || type !== "all" || status !== "active" || q) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMohalla("all");
              setType("all");
              setStatus("active");
              setQ("");
            }}
          >
            <X className="h-3.5 w-3.5" /> Clear
          </Button>
        )}
        <span className="ml-auto text-[12px] text-ink-500">
          {filtered.length} of {members.length} members
        </span>
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      <Card>
        {loading ? (
          <div className="p-10 text-center text-[12.5px] text-ink-500">
            Members load ho rahe hain…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No members match your filters"
            description="Try a different mohalla, status or search term."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setQ("");
                  setMohalla("all");
                  setType("all");
                  setStatus("active");
                }}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Member</Th>
                <Th>Member ID</Th>
                <Th>Household</Th>
                <Th>Phone</Th>
                <Th>Monthly</Th>
                <Th className="text-right">Outstanding</Th>
                <Th>Status</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.map((m) => {
                const due = m.status === "active" ? dueTotalOf(m.id) : 0;
                return (
                  <tr
                    key={m.id}
                    className="cursor-pointer hover:bg-ink-50/60"
                    onClick={() => setSelected(m)}
                  >
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-ink-900">
                            {m.name}
                          </p>
                          <p className="truncate text-[11px] text-ink-500">
                            {m.fatherName}
                          </p>
                        </div>
                      </div>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11.5px] text-ink-600">
                        {m.code}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-ink-600">
                        #{m.household}
                      </span>
                      <span className="block text-[11px] text-ink-400">
                        {m.mohalla}
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-ink-600">{m.phone}</span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-ink-800">
                        {m.feePaise === 0 ? "Waived" : formatINR(m.feePaise)}
                      </span>
                    </Td>
                    <Td className="text-right">
                      <span
                        className={cn(
                          "text-[12.5px] font-medium",
                          due > 0 ? "text-amber-700" : "text-emerald-700"
                        )}
                      >
                        {due > 0 ? formatINR(due) : "Clear"}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill status={m.status} />
                    </Td>
                    <Td className="text-right">
                      <span className="text-[12px] font-medium text-brand-700">
                        View
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <MemberDrawer
        member={selected}
        invoices={invoices}
        payments={payments}
        tenant={tenant ?? activeTenant}
        tenantName={tenantName}
        onClose={() => setSelected(null)}
        onCreateLogin={(m) => setLoginMember(m)}
        onEdit={(m) => setEditMember(m)}
        onRemove={async (m) => {
          try {
            const result = await removeMember(m.id);
            toast(
              result === "ARCHIVED"
                ? `${m.name} archive ho gaya — Active list se hat gaya. "Inactive / archived" filter me milega; receipts aur ledger safe hain.`
                : `${m.name} permanently remove ho gaya`
            );
            setSelected(null);
            await load();
          } catch (e) {
            toast(errorText(e, "Member remove nahi hua"), "error");
          }
        }}
        onRequestReset={async (m, reason) => {
          try {
            await requestPaymentReset(m.id, reason);
            toast("Reset request Khajanchi ke paas chali gayi — approve hone par payments reset honge");
          } catch (e) {
            toast(errorText(e, "Reset request fail"), "error");
          }
        }}
        onRestore={async (m) => {
          try {
            await restoreMember(m.id);
            toast(`${m.name} wapas Active list me aa gaya. Login dobara chahiye to "Create login" use karein.`);
            setSelected(null);
            await load();
          } catch (e) {
            toast(errorText(e, "Member restore nahi hua"), "error");
          }
        }}
        onEditPayment={(p) => setEditPayment(p)}
      />
      <PaymentEditDrawer
        payment={editPayment}
        member={members.find((m) => m.id === editPayment?.memberId) ?? null}
        onClose={() => setEditPayment(null)}
      />
      <CreateLoginDrawer member={loginMember} onClose={() => setLoginMember(null)} />
      <EditMemberDrawer
        member={editMember}
        onClose={() => setEditMember(null)}
        onSaved={async (updated) => {
          setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
          setSelected(updated);
          setEditMember(null);
          if (!isDemoMode) await load();
        }}
      />
      <AddMemberDrawer
        open={addOpen}
        mohallas={mohallas}
        defaultFee={500}
        onClose={() => setAddOpen(false)}
        onSaved={async (member) => {
          setMembers((prev) => [...prev, member].sort((a, b) => a.code.localeCompare(b.code)));
          setAddOpen(false);
          if (!isDemoMode) await load();
        }}
      />
    </>
  );
}

/* ── Create login drawer ──────────────────────────────────────── */

function randomPassword() {
  return Math.random().toString(36).slice(2, 10);
}

function CreateLoginDrawer({
  member,
  onClose,
}: {
  member: Member | null;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(randomPassword());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (member) {
      setPassword(randomPassword());
      setEmail("");
    }
  }, [member?.id]);

  if (!member) return null;

  async function submit() {
    if (!member) return;
    if (!/^.+@.+\..+$/.test(email.trim())) {
      toast("Valid email daalo", "error");
      return;
    }
    if (password.length < 6) {
      toast("Password kam se kam 6 characters", "error");
      return;
    }
    setSaving(true);
    try {
      await createMemberLogin({
        memberId: member.id,
        email: email.trim(),
        password,
        fullName: member.name,
        phone: member.phone,
        role: "member",
      });
      toast(`Login ban gaya — ${email.trim()} / ${password}`);
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Login create nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!member}
      onClose={onClose}
      title="Create member login"
      subtitle={`${member.name} · ${member.code}`}
      width="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            <UserPlus className="h-4 w-4" /> Create login
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Email" hint="Member isi email se login karega.">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
            autoComplete="off"
          />
        </Field>
        <Field label="Password" hint="Phone par bhej do — member baad me badal sakta hai.">
          <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
        </Field>
        <p className="text-[11.5px] leading-relaxed text-ink-500">
          Login ban ne ke baad member <b>anjuman.pages.dev/login</b> par email + password
          se sign in karega aur sirf apna dashboard + ID card dekhega.
        </p>
      </div>
    </Drawer>
  );
}

/* ── Member detail drawer ─────────────────────────────────────── */

function MemberDrawer({
  member,
  invoices,
  payments,
  tenant,
  tenantName,
  onClose,
  onCreateLogin,
  onEdit,
  onRemove,
  onRequestReset,
  onRestore,
  onEditPayment,
}: {
  member: Member | null;
  invoices: Invoice[];
  payments: Payment[];
  tenant: Tenant;
  tenantName: string;
  onClose: () => void;
  onCreateLogin: (member: Member) => void;
  onEdit: (member: Member) => void;
  onRemove: (member: Member) => Promise<void>;
  onRequestReset: (member: Member, reason: string) => Promise<void>;
  onRestore: (member: Member) => Promise<void>;
  onEditPayment: (payment: Payment) => void;
}) {
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetReason, setResetReason] = useState("");
  const [resetting, setResetting] = useState(false);
  if (!member) return null;

  const dues = invoices.filter(
    (i) =>
      i.memberId === member.id &&
      (i.status === "pending" || i.status === "partial")
  );
  const pays = payments.filter((p) => p.memberId === member.id);
  const paidTotal = invoices
    .filter((i) => i.memberId === member.id)
    .reduce((s, i) => s + i.paidPaise, 0);
  const dueTotal = dues.reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);
  const canRemove = user?.role === "sadar" || user?.role === "super_admin";
  const isArchived = member.status === "inactive";
  // Mirrors the DB rule: receipts / paid invoices keep the row (archive).
  const hasFinance = pays.length > 0 || paidTotal > 0;
  const canEditPayment =
    user?.role === "sadar" ||
    user?.role === "secretary" ||
    user?.role === "khajanchi" ||
    user?.role === "super_admin";
  const activePaymentCount = payments.filter(
    (p) =>
      p.memberId === member.id &&
      (p.status === "verified" || p.status === "pending")
  ).length;

  return (
    <Drawer
      open={!!member}
      onClose={onClose}
      title={member.name}
      subtitle={`${member.code} · ${member.mohalla}`}
      width="max-w-2xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[12px] text-ink-500">
            Belongs to{" "}
            <span className="font-medium text-ink-700">{tenantName}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {!isArchived &&
              (user?.role === "sadar" ||
                user?.role === "secretary" ||
                user?.role === "super_admin") && (
              <Button
                variant="secondary"
                size="sm"
                className="text-amber-700"
                disabled={activePaymentCount === 0}
                title={
                  activePaymentCount === 0
                    ? "Is member ka koi verified/pending payment nahi hai"
                    : "Reset request Khajanchi ke paas jayegi"
                }
                onClick={() => setResetOpen((v) => !v)}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset payments
              </Button>
            )}
            {canRemove && !isArchived && (
              <Button
                variant="secondary"
                size="sm"
                className="text-red-600"
                loading={removing}
                onClick={async () => {
                  if (!confirmRemove) {
                    setConfirmRemove(true);
                    return;
                  }
                  setRemoving(true);
                  try {
                    await onRemove(member);
                  } finally {
                    setRemoving(false);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {confirmRemove
                  ? hasFinance
                    ? "Confirm archive"
                    : "Confirm remove"
                  : hasFinance
                    ? "Archive member"
                    : "Remove member"}
              </Button>
            )}
            {isArchived && canRemove && (
              <Button
                variant="secondary"
                size="sm"
                className="text-emerald-700"
                loading={restoring}
                onClick={async () => {
                  setRestoring(true);
                  try {
                    await onRestore(member);
                  } finally {
                    setRestoring(false);
                  }
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Restore member
              </Button>
            )}
            {isArchived && (
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
                Archived — Active list me nahi dikhta. Receipts aur ledger safe hain.
              </span>
            )}
            <Button variant="secondary" size="sm" onClick={() => onEdit(member)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            {!isArchived && (
              <Button variant="secondary" size="sm" onClick={() => onCreateLogin(member)}>
                <UserPlus className="h-3.5 w-3.5" /> Create login
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                window.location.href = `/id-cards/?member=${member.id}`;
              }}
            >
              <IdCard className="h-3.5 w-3.5" /> ID card
            </Button>
            {!isArchived && (
              <Button size="sm" onClick={() => toast("Payment entry opened")}>
                <Wallet className="h-3.5 w-3.5" /> Collect
              </Button>
            )}
          </div>
          {resetOpen && (
            <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] font-semibold text-amber-900">
                Payment reset request
              </p>
              <p className="mt-0.5 text-[11.5px] text-amber-800">
                Is member ke saare payments reject ho jayenge aur invoices dobara
                unpaid ho jayengi. Ledger me reversal entry jayegi. Reset tabhi hoga
                jab <b>Khajanchi approve</b> karega.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input
                  value={resetReason}
                  onChange={(e) => setResetReason(e.target.value)}
                  placeholder="Wajah (e.g. demo / wrong entry)"
                  className="min-w-[220px] flex-1"
                />
                <Button
                  size="sm"
                  loading={resetting}
                  onClick={async () => {
                    setResetting(true);
                    try {
                      await onRequestReset(member, resetReason);
                      setResetOpen(false);
                      setResetReason("");
                    } finally {
                      setResetting(false);
                    }
                  }}
                >
                  Send to Khajanchi
                </Button>
              </div>
            </div>
          )}
          {confirmRemove && (
            <p className="w-full rounded-lg bg-red-50 px-3 py-2 text-[11.5px] text-red-700">
              {hasFinance ? (
                <>
                  Is member ka financial history hai, isliye permanent delete nahi hoga.
                  Remove karne par ye <b>archive</b> hoga: Active list se hat jayega,
                  login band ho jayegi, aur receipt/ledger safe rahega. Wapas dekhna ho to
                  status filter me <b>Inactive / archived</b> chunein.
                </>
              ) : (
                <>
                  Is member ka koi receipt ya paid invoice nahi hai, isliye ye{" "}
                  <b>permanently delete</b> ho jayega.
                </>
              )}
            </p>
          )}
        </div>
      }
    >
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-100 bg-ink-50/60 p-4">
        <Avatar name={member.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-ink-900">{member.name}</p>
            <StatusPill status={member.status} />
            <Badge tone="slate">{member.type}</Badge>
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            s/o {member.fatherName || "—"} · House #{member.household || "—"}
          </p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-center">
          <p className="text-[10px] uppercase tracking-wider text-ink-400">
            Member ID
          </p>
          <p className="font-mono text-[13px] font-semibold text-ink-800">
            {member.code}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Monthly fee", value: member.feePaise === 0 ? "Waived" : formatINR(member.feePaise) },
          { label: "Total paid", value: formatINR(paidTotal) },
          { label: "Outstanding", value: dueTotal > 0 ? formatINR(dueTotal) : "Clear" },
          { label: "Joined", value: formatDate(member.joinedOn) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-ink-100 p-3">
            <p className="text-[10.5px] uppercase tracking-wide text-ink-400">
              {s.label}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold text-ink-900">
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-ink-100 p-3.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Contact
          </p>
          <div className="space-y-1.5 text-[12.5px]">
            <p className="flex items-center gap-2 text-ink-700">
              <Phone className="h-3.5 w-3.5 text-ink-400" /> {member.phone || "—"}
            </p>
            <p className="text-ink-500">
              Blood group: <span className="font-medium text-ink-800">{member.bloodGroup ?? "—"}</span>
            </p>
            <p className="text-ink-500">
              Mohalla: <span className="font-medium text-ink-800">{member.mohalla || "—"}</span>
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-ink-100 p-3.5">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Concession
          </p>
          {member.concession ? (
            <p className="text-[12.5px] text-ink-700">{member.concession}</p>
          ) : (
            <p className="text-[12.5px] text-ink-400">No concession applied</p>
          )}
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink-800">
            Dues ({dues.length})
          </p>
          <p className="text-[12px] font-medium text-amber-700">
            {formatINR(dueTotal)}
          </p>
        </div>
        {dues.length === 0 ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-700">
            All dues cleared.
          </p>
        ) : (
          <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {dues.map((i) => (
              <div key={i.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="text-[12.5px] font-medium text-ink-800">
                    {periodLabel(i.period)}
                  </p>
                  <p className="text-[11px] text-ink-400">Due {formatDate(i.dueDate)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[12.5px] font-medium text-ink-900">
                    {formatINR(i.amountPaise - i.paidPaise)}
                  </p>
                  <StatusPill status={i.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ink-800">
            Payment history ({pays.length})
          </p>
          <p className="text-[11px] text-ink-400">
            Purana slip dobara download karo
          </p>
        </div>
        {pays.length === 0 ? (
          <p className="text-[12.5px] text-ink-400">No payments yet.</p>
        ) : (
          <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {pays.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-[11.5px] text-ink-600">
                    {p.receiptNo}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {formatDate(p.createdAt, true)} · {p.method.toUpperCase()}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusPill status={p.status} />
                  <span className="text-[12.5px] font-medium text-ink-900">
                    {formatINR(p.amountPaise)}
                  </span>
                  {p.status === "verified" && (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 hover:bg-brand-50"
                      onClick={() => setReceipt(receiptOf({ ...p, member }))}
                      title="Download / share receipt"
                    >
                      <Download className="h-3.5 w-3.5" /> Slip
                    </button>
                  )}
                  {canEditPayment && (
                    <button
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-amber-700 hover:bg-amber-50"
                      onClick={() => onEditPayment(p)}
                      title="Amount / method galat ho to correction bhejo"
                    >
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReceiptDrawer
        receipt={receipt}
        tenant={tenant}
        onClose={() => setReceipt(null)}
      />
    </Drawer>
  );
}

/* ── Edit member drawer ──────────────────────────────────────── */

function EditMemberDrawer({
  member,
  onClose,
  onSaved,
}: {
  member: Member | null;
  onClose: () => void;
  onSaved: (member: Member) => void | Promise<void>;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [father, setFather] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [house, setHouse] = useState("");
  const [mohalla, setMohalla] = useState("");
  const [blood, setBlood] = useState("");
  const [fee, setFee] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setFather(member.fatherName);
    setPhone(member.phone);
    setEmail(member.email ?? "");
    setHouse(member.household);
    setMohalla(member.mohalla);
    setBlood(member.bloodGroup ?? "");
    setFee(member.feePaise ? String(Math.round(member.feePaise / 100)) : "");
    setPhotoUrl(member.photoUrl ?? null);
  }, [member?.id]);

  if (!member) return null;

  async function pickPhoto(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast("Sirf image file chuno", "error");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast("Photo 3 MB se chhoti honi chahiye", "error");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file, user.id);
      setPhotoUrl(url);
      toast("Photo upload ho gayi — Save dabao");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Photo upload nahi hui", "error");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!member) return;
    if (!name.trim()) return toast("Naam likho", "error");
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone && cleanPhone.length !== 10) {
      return toast("Mobile number 10 digit ka hona chahiye", "error");
    }
    setSaving(true);
    try {
      await saveMemberDetails(member.id, {
        name,
        fatherName: father,
        phone: cleanPhone,
        email,
        household: house,
        mohalla,
        bloodGroup: blood,
        photoUrl,
      });

      const customPaise = Math.round((Number(fee) || 0) * 100);
      let feeNote = "";
      if (customPaise > 0 && customPaise !== member.feePaise) {
        try {
          await requestFeeChange(
            member.id,
            customPaise,
            "Custom monthly fee set from member edit"
          );
          feeNote = " · custom fee approval ke liye bheji";
        } catch (e) {
          feeNote = ` · fee change fail: ${
            e instanceof Error ? e.message : "unknown error"
          }`;
        }
      }

      toast(`Member details update ho gayi${feeNote}`);
      await onSaved({
        ...member,
        name: name.trim(),
        fatherName: father.trim(),
        phone: cleanPhone,
        email: email.trim().toLowerCase(),
        household: house.trim(),
        mohalla: mohalla.trim(),
        bloodGroup: blood.trim() || undefined,
        photoUrl: photoUrl ?? undefined,
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Details save nahi hui", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!member}
      onClose={onClose}
      title={`Edit · ${member.name}`}
      subtitle={`${member.code} · photo, naam, mobile, email sab badal sakte ho`}
      width="max-w-xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={name || member.name} size="lg" photoUrl={photoUrl} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow hover:bg-brand-700 disabled:opacity-60"
            aria-label="Change photo"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </div>
        <div className="text-[12px] leading-relaxed text-ink-500">
          <p className="font-medium text-ink-700">Member photo</p>
          <p>ID card par yehi photo lagegi. JPG/PNG · max 3 MB.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Father's name">
          <Input value={father} onChange={(e) => setFather(e.target.value)} />
        </Field>
        <Field label="Mobile number" hint="Sirf 10 digit">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
          />
        </Field>
        <Field label="House number">
          <Input value={house} onChange={(e) => setHouse(e.target.value)} />
        </Field>
        <Field label="Mohalla">
          <Input value={mohalla} onChange={(e) => setMohalla(e.target.value)} />
        </Field>
        <Field label="Blood group">
          <Input
            value={blood}
            onChange={(e) => setBlood(e.target.value.toUpperCase())}
            placeholder="e.g. O+"
            maxLength={3}
          />
        </Field>
        <Field
          label="Custom monthly fee (₹)"
          hint="Sirf is member ke liye. Khali = default fee. Change approval ke liye jayega."
        >
          <Input
            value={fee}
            onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ""))}
            inputMode="numeric"
            placeholder={String(Math.round(member.feePaise / 100))}
          />
        </Field>
      </div>
    </Drawer>
  );
}

/* ── Add member drawer ───────────────────────────────────────── */

function AddMemberDrawer({
  open,
  mohallas,
  defaultFee,
  onClose,
  onSaved,
}: {
  open: boolean;
  mohallas: string[];
  defaultFee: number;
  onClose: () => void;
  onSaved: (member: Member) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [father, setFather] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [house, setHouse] = useState("");
  const [mohalla, setMohalla] = useState(mohallas[0] ?? "");
  const [fee, setFee] = useState(String(defaultFee));
  const [memberType, setMemberType] = useState<Member["type"]>("member");
  const [duesFrom, setDuesFrom] = useState("");
  const [duesTo, setDuesTo] = useState(new Date().toISOString().slice(0, 7));
  const [saving, setSaving] = useState(false);

  const previewMonths = (() => {
    if (!/^\d{4}-\d{2}$/.test(duesFrom) || !/^\d{4}-\d{2}$/.test(duesTo)) return 0;
    const [fy, fm] = duesFrom.split("-").map(Number);
    const [ty, tm] = duesTo.split("-").map(Number);
    return Math.max((ty - fy) * 12 + (tm - fm) + 1, 0);
  })();
  const previewTotal = previewMonths * Math.round(Number(fee || "0") * 100);

  async function save() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!name.trim() || !cleanPhone) {
      toast("Name and phone are required", "error");
      return;
    }
    if (cleanPhone.length !== 10) {
      toast("Mobile number 10 digit ka hona chahiye", "error");
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast("Sahi email daalo", "error");
      return;
    }
    const feePaise = Math.round(Number(fee || "0") * 100);
    if (!Number.isFinite(feePaise) || feePaise < 0) {
      toast("Monthly chanda is not a valid amount", "error");
      return;
    }

    setSaving(true);
    try {
      const member = await createMember({
        name,
        fatherName: father,
        phone: cleanPhone,
        email,
        household: house,
        mohalla,
        memberType,
        feePaise,
      });

      // Give the new member their first invoice straight away so dues
      // and reminders start from this month. With a backdated range we
      // create every month's invoice from that month instead.
      let duesNote = "";
      if (/^\d{4}-\d{2}$/.test(duesFrom)) {
        try {
          const r = await generateMemberDues(member.id, duesFrom, duesTo);
          duesNote = ` · ${r.created} month dues (${formatINR(r.amountPaise)})`;
        } catch (e) {
          duesNote = ` · dues fail: ${e instanceof Error ? e.message : "error"}`;
        }
      } else {
        try {
          await generateInvoices();
        } catch {
          /* invoice generation is idempotent — safe to retry later */
        }
      }

      toast(`Member “${member.name}” added · ${member.code}${duesNote}`);
      setName("");
      setFather("");
      setPhone("");
      setEmail("");
      setHouse("");
      await onSaved(member);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Member save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add member"
      subtitle="A unique member ID is generated automatically on save."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            <Plus className="h-4 w-4" /> {saving ? "Saving…" : "Save member"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Muhammad Idris"
          />
        </Field>
        <Field label="Father's name">
          <Input
            value={father}
            onChange={(e) => setFather(e.target.value)}
            placeholder="e.g. Abdul Rahman"
          />
        </Field>
        <Field label="Mobile number" hint="Sirf 10 digit">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="Email (optional)">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@example.com"
          />
        </Field>
        <Field label="House number">
          <Input
            value={house}
            onChange={(e) => setHouse(e.target.value)}
            placeholder="e.g. 42"
          />
        </Field>
        <Field label="Mohalla">
          <Select value={mohalla} onChange={(e) => setMohalla(e.target.value)}>
            {mohallas.length === 0 && <option value="">—</option>}
            {mohallas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Monthly chanda (₹)"
          hint="You can override this for individual members later."
        >
          <Input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Member type">
          <Select
            value={memberType}
            onChange={(e) => setMemberType(e.target.value as Member["type"])}
          >
            <option value="member">Member</option>
            <option value="donor">Donor</option>
            <option value="imam">Imam</option>
            <option value="muazzin">Muazzin</option>
            <option value="staff">Staff</option>
          </Select>
        </Field>
        <Field
          label="Dues from (month)"
          hint="Purana bakaya hai to start month chuno — sabhi mahine ek saath ban jayenge"
        >
          <Input
            type="month"
            value={duesFrom}
            max={new Date().toISOString().slice(0, 7)}
            onChange={(e) => setDuesFrom(e.target.value)}
          />
        </Field>
        <Field label="Dues till (month)" hint="Default: is mahina">
          <Input
            type="month"
            value={duesTo}
            onChange={(e) => setDuesTo(e.target.value)}
          />
        </Field>
      </div>

      {previewMonths > 0 && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] text-amber-900">
          <p className="font-semibold">
            {previewMonths} month × {formatINR(Math.round(Number(fee || "0") * 100))} ={" "}
            {formatINR(previewTotal)}
          </p>
          <p className="mt-0.5">
            Save karte hi {periodLabel(duesFrom)} se {periodLabel(duesTo)} tak ke
            invoices ban jayenge (duplicate nahi banenge).
          </p>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[12px] leading-relaxed text-brand-900">
        <span className="font-semibold">What happens next:</span> the system
        generates an ID like{" "}
        <span className="font-mono">BHR-000031-9</span>, then creates invoices
        for the current month. Dues and reminders run automatically from here.
      </div>
    </Drawer>
  );
}

/* ── Payment correction (maker-checker) ──────────────────────── */

function PaymentEditDrawer({
  payment,
  member,
  onClose,
}: {
  payment: Payment | null;
  member: Member | null;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<Payment["method"]>("cash");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!payment) return;
    setAmount(String(payment.amountPaise / 100));
    setMethod(payment.method);
    setReference(payment.reference ?? "");
    setNote(payment.note ?? "");
    setReason("");
  }, [payment]);

  if (!payment) return null;

  const paise = Math.round((Number(amount) || 0) * 100);

  async function submit() {
    if (!payment) return;
    if (paise <= 0) {
      toast("Sahi amount daalo", "error");
      return;
    }
    setBusy(true);
    try {
      await requestPaymentEdit({
        paymentId: payment.id,
        amountPaise: paise,
        method,
        reference,
        note,
        reason,
      });
      toast("Correction approval ke liye bhej di — doosra role approve karega");
      onClose();
    } catch (e) {
      toast(errorText(e, "Correction request fail"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={!!payment}
      onClose={onClose}
      title="Payment correction"
      subtitle={`${payment.receiptNo || "Pending entry"} · ${member?.name ?? ""}`}
      width="max-w-lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11.5px] text-ink-500">
            Abhi amount: {formatINR(payment.amountPaise)}
          </p>
          <Button loading={busy} onClick={submit}>
            <Save className="h-4 w-4" /> Send for approval
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-[12px] leading-relaxed text-amber-900">
          Entry turant nahi badlegi. <b>Khajanchi</b> ki entry ko Sadar /
          Secretary approve karega, aur Sadar / Secretary ki entry ko{" "}
          <b>Khajanchi</b>. Approve hone par ledger me adjustment entry jayegi
          aur member ko notification jayegi.
        </div>

        <Field label="Sahi amount (₹)">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="400"
          />
        </Field>

        <Field label="Method">
          <Select
            value={method}
            onChange={(e) => setMethod(e.target.value as Payment["method"])}
          >
            <option value="cash">Cash</option>
            <option value="upi">UPI</option>
            <option value="gateway">Gateway</option>
            <option value="cheque">Cheque</option>
            <option value="adjustment">Adjustment</option>
          </Select>
        </Field>

        <Field label="Reference / UTR">
          <Input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="UPI ref, cheque no..."
          />
        </Field>

        <Field label="Note">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <Field label="Correction ki wajah" hint="Approver ko dikhegi">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. ₹500 mila tha, galti se ₹400 add hua"
          />
        </Field>

        {paise > 0 && paise !== payment.amountPaise && (
          <p className="rounded-xl bg-ink-50 px-3.5 py-2.5 text-[12.5px] text-ink-700">
            {formatINR(payment.amountPaise)} → <b>{formatINR(paise)}</b> (
            {paise > payment.amountPaise ? "+" : "−"}
            {formatINR(Math.abs(paise - payment.amountPaise))})
          </p>
        )}
      </div>
    </Drawer>
  );
}
