"use client";

import { useMemo, useState } from "react";
import {
  BadgeCheck,
  Ban,
  Download,
  Filter,
  IdCard,
  Phone,
  Plus,
  Search,
  UserPlus,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  members,
  invoices,
  payments,
  duesForMember,
  dueTotal,
  memberByCode,
  paymentsForMember,
  activeTenant,
} from "@/lib/mock";
import type { Member } from "@/lib/types";
import { formatINR, formatDate, periodLabel, cn, currentPeriod } from "@/lib/utils";
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
  SearchInput,
  Select,
  StatusPill,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";

const MOHALLAS = Array.from(new Set(members.map((m) => m.mohalla)));

export default function MembersPage() {
  const [q, setQ] = useState("");
  const [mohalla, setMohalla] = useState("all");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [selected, setSelected] = useState<Member | null>(null);
  const [addOpen, setAddOpen] = useState(false);

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
  }, [q, mohalla, status, type]);

  const exactIdMatch = q.trim().length > 5 ? memberByCode(q.trim().toUpperCase()) : undefined;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Members"
        description={`${members.length} registered members across ${new Set(members.map((m) => m.household)).size} households in ${activeTenant.village}.`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => toast("Member list exported as CSV")}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add member
            </Button>
          </>
        }
      />

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
                Any member of any anjuman — e.g. BHR-000012-4
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
          {MOHALLAS.map((m) => (
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
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </Select>
        {(mohalla !== "all" || type !== "all" || status !== "all" || q) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMohalla("all");
              setType("all");
              setStatus("all");
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
        {filtered.length === 0 ? (
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
                  setStatus("all");
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
                const due = dueTotal(m.id);
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

      <MemberDrawer member={selected} onClose={() => setSelected(null)} />
      <AddMemberDrawer open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

/* ── Member detail drawer ─────────────────────────────────────── */

function MemberDrawer({
  member,
  onClose,
}: {
  member: Member | null;
  onClose: () => void;
}) {
  if (!member) return null;
  const dues = duesForMember(member.id);
  const pays = paymentsForMember(member.id);
  const paidTotal = invoices
    .filter((i) => i.memberId === member.id)
    .reduce((s, i) => s + i.paidPaise, 0);

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
            <span className="font-medium text-ink-700">{activeTenant.name}</span>
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => toast("ID card queued for printing")}>
              <IdCard className="h-3.5 w-3.5" /> ID card
            </Button>
            <Button size="sm" onClick={() => toast("Payment entry opened")}>
              <Wallet className="h-3.5 w-3.5" /> Collect
            </Button>
          </div>
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
            s/o {member.fatherName} · House #{member.household}
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
          { label: "Outstanding", value: dueTotal(member.id) > 0 ? formatINR(dueTotal(member.id)) : "Clear" },
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
              <Phone className="h-3.5 w-3.5 text-ink-400" /> {member.phone}
            </p>
            <p className="text-ink-500">
              Blood group: <span className="font-medium text-ink-800">{member.bloodGroup ?? "—"}</span>
            </p>
            <p className="text-ink-500">
              Mohalla: <span className="font-medium text-ink-800">{member.mohalla}</span>
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
            {formatINR(dueTotal(member.id))}
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
        <p className="mb-2 text-[13px] font-semibold text-ink-800">
          Payment history ({pays.length})
        </p>
        {pays.length === 0 ? (
          <p className="text-[12.5px] text-ink-400">No payments yet.</p>
        ) : (
          <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {pays.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                <div>
                  <p className="font-mono text-[11.5px] text-ink-600">
                    {p.receiptNo}
                  </p>
                  <p className="text-[11px] text-ink-400">
                    {formatDate(p.createdAt, true)} · {p.method.toUpperCase()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={p.status} />
                  <span className="text-[12.5px] font-medium text-ink-900">
                    {formatINR(p.amountPaise)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}

/* ── Add member drawer ───────────────────────────────────────── */

function AddMemberDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [father, setFather] = useState("");
  const [phone, setPhone] = useState("");
  const [house, setHouse] = useState("");
  const [mohalla, setMohalla] = useState(MOHALLAS[0]);
  const [fee, setFee] = useState("500");

  function save() {
    if (!name.trim() || !phone.trim()) {
      toast("Name and phone are required", "error");
      return;
    }
    toast(`Member “${name}” added · ID will be issued automatically`);
    setName("");
    setFather("");
    setPhone("");
    setHouse("");
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add member"
      subtitle="A unique member ID is generated automatically on save."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>
            <Plus className="h-4 w-4" /> Save member
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
        <Field label="Mobile number">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 …"
            inputMode="tel"
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
            {MOHALLAS.map((m) => (
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
          <Select defaultValue="member">
            <option value="member">Member</option>
            <option value="donor">Donor</option>
            <option value="imam">Imam</option>
            <option value="muazzin">Muazzin</option>
            <option value="staff">Staff</option>
          </Select>
        </Field>
      </div>

      <div className="mt-5 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[12px] leading-relaxed text-brand-900">
        <span className="font-semibold">What happens next:</span> the system
        generates an ID like{" "}
        <span className="font-mono">BHR-000031-9</span>, then creates invoices
        for the current month. Dues and reminders run automatically from here.
      </div>
    </Drawer>
  );
}
