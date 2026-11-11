"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  BadgePercent,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Plus,
  ReceiptText,
  RefreshCw,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import type { FeeOverride, FeePlan, Invoice, Member } from "@/lib/types";
import {
  archiveFeePlan,
  createFeePlan,
  generateDuesRange,
  getTenantSettings,
  listFeeOverrides,
  listFeePlans,
  listInvoices,
  listMembers,
  requestFeeChange,
  requestWaiver,
  saveTenantSettings,
  setFeeCycle,
  type TenantSettings,
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
  Select,
  StatCard,
  Switch,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { formatINR, periodLabel, cn } from "@/lib/utils";

export default function FeePlansPage() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<FeePlan[]>([]);
  const [overrides, setOverrides] = useState<FeeOverride[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [buildOpen, setBuildOpen] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);

  const [startMonth, setStartMonth] = useState("");
  const [dueDay, setDueDay] = useState("10");
  const [cycleBusy, setCycleBusy] = useState<"save" | "generate" | null>(null);

  const canWaive = user?.role === "sadar" || user?.role === "secretary";
  const canChangeFee =
    user?.role === "sadar" || user?.role === "secretary" || user?.role === "khajanchi";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planRows, overrideRows, memberRows, invoiceRows, settingsRow] = await Promise.all([
        listFeePlans(),
        listFeeOverrides(),
        listMembers(),
        listInvoices(),
        getTenantSettings(),
      ]);
      setPlans(planRows);
      setOverrides(overrideRows);
      setMembers(memberRows);
      setInvoices(invoiceRows);
      setSettings(settingsRow);
      setStartMonth(settingsRow.feeStartPeriod ?? "");
      setDueDay(String(settingsRow.invoiceDueDay));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fees load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const approvedOverrides = useMemo(
    () => overrides.filter((o) => o.approvedBy),
    [overrides]
  );

  const overrideByMember = useMemo(() => {
    const m = new Map<string, FeeOverride>();
    for (const o of approvedOverrides) m.set(o.memberId, o);
    return m;
  }, [approvedOverrides]);

  const effectiveFee = useCallback(
    (member: Member) => overrideByMember.get(member.id)?.amountPaise ?? member.feePaise,
    [overrideByMember]
  );

  const activeMembers = members.filter((m) => m.status === "active");

  const billedMonthly = activeMembers.reduce((s, m) => s + effectiveFee(m), 0);

  const concessionTotal = approvedOverrides.reduce((s, o) => {
    const m = memberMap.get(o.memberId);
    if (!m) return s;
    return s + Math.max(m.feePaise - o.amountPaise, 0);
  }, 0);

  const pendingOverrides = overrides.filter((o) => !o.approvedBy);

  const outstanding = invoices
    .filter((i) => i.status === "pending" || i.status === "partial")
    .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);

  async function toggle(key: keyof TenantSettings, value: boolean, label: string) {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
    try {
      await saveTenantSettings({ [key]: value } as Partial<TenantSettings>);
      toast(`${label} ${value ? "enabled" : "disabled"}`);
    } catch (e) {
      setSettings((prev) => (prev ? { ...prev, [key]: !value } : prev));
      toast(e instanceof Error ? e.message : "Setting save nahi hui", "error");
    }
  }

  const dueDayNum = Math.min(Math.max(Number(dueDay) || 10, 1), 28);

  /** Months between the chosen start and this month (inclusive). */
  const cycleMonths = useMemo(() => {
    if (!/^\d{4}-\d{2}$/.test(startMonth)) return 0;
    const [y, m] = startMonth.split("-").map(Number);
    const now = new Date();
    return Math.max(
      (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m) + 1,
      0
    );
  }, [startMonth]);

  async function saveCycle() {
    if (startMonth && !/^\d{4}-\d{2}$/.test(startMonth)) {
      toast("Start month YYYY-MM me chuno", "error");
      return;
    }
    setCycleBusy("save");
    try {
      await setFeeCycle(startMonth || null, dueDayNum);
      toast("Fee cycle save ho gaya");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Cycle save nahi hua", "error");
    } finally {
      setCycleBusy(null);
    }
  }

  async function runBackfill() {
    if (!startMonth) {
      toast("Pehle start month chuno", "error");
      return;
    }
    setCycleBusy("generate");
    try {
      const r = await generateDuesRange(startMonth, null);
      toast(
        `${r.months} mahine check kiye · ${r.created} naye invoice bane (${formatINR(
          r.amountPaise
        )})`
      );
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Dues generate nahi hui", "error");
    } finally {
      setCycleBusy(null);
    }
  }

  async function onArchive(plan: FeePlan) {    try {
      await archiveFeePlan(plan.id);
      setPlans((prev) =>
        prev.map((p) => (p.id === plan.id ? { ...p, isActive: false } : p))
      );
      toast("Plan archived — existing dues untouched");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Plan archive nahi hua", "error");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Fee plans"
        description="Set the monthly chanda, per-member overrides and concessions. Invoices and reminders are generated automatically."
        actions={
          <>
            {canWaive && (
              <Button variant="secondary" onClick={() => setWaiveOpen(true)}>
                <BadgePercent className="h-4 w-4" /> Waive dues
              </Button>
            )}
            {canChangeFee && (
              <Button variant="secondary" onClick={() => setOverrideOpen(true)}>
                <Plus className="h-4 w-4" /> Change a fee
              </Button>
            )}
            <Button onClick={() => setBuildOpen(true)}>
              <Plus className="h-4 w-4" /> New plan
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
        <StatCard label="Monthly billing" value={formatINR(billedMonthly)} sub="Expected this cycle" icon={CircleDollarSign} tone="brand" />
        <StatCard label="Active members" value={String(activeMembers.length)} sub={`${approvedOverrides.length} with overrides`} icon={Users} tone="blue" />
        <StatCard label="Concessions given" value={formatINR(concessionTotal)} sub={`${approvedOverrides.length} approved override(s)`} icon={BadgePercent} tone="violet" />
        <StatCard label="Outstanding" value={formatINR(outstanding)} sub="Auto-reminded daily" icon={Wallet} tone="amber" />
      </div>

      {/* ── Billing cycle ────────────────────────────────────── */}
      <Card className="mt-5">
        <CardHeader
          title="Fee cycle (chanda kab se count hoga)"
          subtitle="Start month chuno — pichhle saal se bhi count kar sakte ho. Due date har month ke liye fix ho jayegi."
          action={
            <Badge tone={startMonth ? "green" : "amber"} dot>
              {startMonth ? `From ${periodLabel(startMonth)}` : "Not set"}
            </Badge>
          }
        />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field
            label="Start month"
            hint="Is month se dues ginti shuru hogi"
          >
            <Input
              type="month"
              value={startMonth}
              max={new Date().toISOString().slice(0, 7)}
              onChange={(e) => setStartMonth(e.target.value)}
            />
          </Field>
          <Field label="Due date (day of month)" hint="1 se 28">
            <Select value={dueDay} onChange={(e) => setDueDay(e.target.value)}>
              {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
          </Field>
          <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-3">
            <p className="text-[10.5px] uppercase tracking-wide text-ink-400">
              Months counted
            </p>
            <p className="mt-0.5 text-[15px] font-semibold text-ink-900">
              {cycleMonths || "—"}
            </p>
            <p className="text-[11px] text-ink-500">
              {startMonth
                ? `${periodLabel(startMonth)} → ${periodLabel(
                    new Date().toISOString().slice(0, 7)
                  )}`
                : "Start month chuno"}
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <Button onClick={() => void saveCycle()} loading={cycleBusy === "save"}>
              <CheckCircle2 className="h-4 w-4" /> Save cycle
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runBackfill()}
              loading={cycleBusy === "generate"}
              disabled={!startMonth}
            >
              <RefreshCw className="h-4 w-4" /> Purane dues banao
            </Button>
          </div>
        </div>
        <div className="border-t border-ink-100 px-5 py-3 text-[11.5px] leading-relaxed text-ink-500">
          Har month ki 1 tareekh ko naye dues automatically ban jate hain (daily
          automation). "Purane dues banao" dabane se start month se aaj tak ke saare
          invoice ek baar me ban jayenge — dobara dabane par duplicate nahi banenge.
          Custom fee har member ke <b>Edit</b> drawer se ya upar{" "}
          <b>Change a fee</b> se set hoti hai.
        </div>
      </Card>

      {/* ── Plans ────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {loading && plans.length === 0 ? (
          <Card className="lg:col-span-3">
            <div className="p-10 text-center text-[12.5px] text-ink-500">
              Fee plans load ho rahe hain…
            </div>
          </Card>
        ) : (
          plans.map((p) => (
            <Card key={p.id} className={cn("p-5", !p.isActive && "opacity-60")}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[13.5px] font-semibold text-ink-900">{p.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-500">
                    Due on the {p.dueDay}th of every month
                  </p>
                </div>
                <Badge tone={p.isActive ? "green" : "slate"} dot>
                  {p.isActive ? "Active" : "Archived"}
                </Badge>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-2xl font-semibold tracking-tight text-ink-900">
                  {formatINR(p.amountPaise)}
                </span>
                <span className="text-[12px] text-ink-500">/{p.cycle}</span>
              </div>
              <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-500">
                <span className="inline-flex items-center gap-1.5">
                  <ReceiptText className="h-3.5 w-3.5" /> Auto invoice
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5" /> {p.graceDays}-day grace
                </span>
              </div>
              {p.isActive && (
                <div className="mt-4 flex gap-2 border-t border-ink-100 pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    onClick={() => void onArchive(p)}
                  >
                    <Archive className="h-3.5 w-3.5" /> Archive
                  </Button>
                </div>
              )}
            </Card>
          ))
        )}

        <Card className="flex flex-col items-center justify-center border-dashed p-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
            <Sparkles className="h-5 w-5" />
          </span>
          <p className="mt-3 text-[13px] font-semibold text-ink-800">
            Need a different amount for a few families?
          </p>
          <p className="mt-1 max-w-[220px] text-[12px] text-ink-500">
            Use a per-member override instead of creating a new plan.
          </p>
          {canChangeFee && (
            <Button variant="soft" size="sm" className="mt-3" onClick={() => setOverrideOpen(true)}>
              Change a fee
            </Button>
          )}
        </Card>
      </div>

      {/* ── Automation toggles ───────────────────────────────── */}
      <Card className="mt-5">
        <CardHeader
          title="Automation"
          subtitle="Turn it on once and forget — this is what keeps a solo operator free."
        />
        <div className="divide-y divide-ink-100">
          {settings &&
            (
              [
                {
                  key: "autoGenerateInvoices" as const,
                  title: "Auto-generate invoices",
                  body: "Create a pending invoice for every active member on the 1st of each month.",
                  value: settings.autoGenerateInvoices,
                },
                {
                  key: "autoSendReminders" as const,
                  title: "Automatic reminders",
                  body: `WhatsApp/SMS on the ${settings.reminderDays.join(", ")} of the month.`,
                  value: settings.autoSendReminders,
                },
                {
                  key: "autoVerifyGateway" as const,
                  title: "Auto-reconcile gateway payments",
                  body: "Match Razorpay/Cashfree settlements to invoices by reference and amount.",
                  value: settings.autoVerifyGateway,
                },
              ]
            ).map((r) => (
              <div key={r.key} className="flex items-start gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-ink-900">{r.title}</p>
                  <p className="mt-0.5 text-[12px] text-ink-500">{r.body}</p>
                </div>
                <Switch
                  checked={r.value}
                  onChange={(v) => void toggle(r.key, v, r.title)}
                />
              </div>
            ))}
          {!settings && loading && (
            <div className="p-6 text-center text-[12.5px] text-ink-500">
              Settings load ho rahi hain…
            </div>
          )}
        </div>
      </Card>

      {/* ── Overrides ────────────────────────────────────────── */}
      <Card className="mt-5">
        <CardHeader
          title="Per-member overrides"
          subtitle="Only these members pay something different from the plan amount."
          action={
            canChangeFee ? (
              <Button variant="secondary" size="sm" onClick={() => setOverrideOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Change a fee
              </Button>
            ) : undefined
          }
        />
        {overrides.length === 0 ? (
          <div className="p-8 text-center text-[12.5px] text-ink-500">
            No overrides. Everyone pays the standard chanda.
          </div>
        ) : (
          <TableWrap>
            <thead>
              <tr className="table-head">
                <Th>Member</Th>
                <Th>Plan amount</Th>
                <Th>Override</Th>
                <Th>Reason</Th>
                <Th>Approval</Th>
                <Th />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {overrides.map((o) => {
                const m = memberMap.get(o.memberId);
                if (!m) return null;
                return (
                  <tr key={o.id} className="hover:bg-ink-50/60">
                    <Td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-medium text-ink-900">{m.name}</p>
                          <p className="font-mono text-[10.5px] text-ink-400">{m.code}</p>
                        </div>
                      </div>
                    </Td>
                    <Td className="text-[12px] text-ink-500">{formatINR(m.feePaise)}</Td>
                    <Td>
                      <span className={cn("font-medium", o.amountPaise === 0 ? "text-violet-700" : "text-ink-900")}>
                        {o.amountPaise === 0 ? "Waived" : formatINR(o.amountPaise)}
                      </span>
                    </Td>
                    <Td className="text-[12px] text-ink-500">{o.reason}</Td>
                    <Td>
                      {o.approvedBy ? (
                        <Badge tone="green" dot>Approved</Badge>
                      ) : (
                        <Badge tone="amber" dot>Pending</Badge>
                      )}
                    </Td>
                    <Td className="text-right">
                      {canChangeFee && (
                        <button
                          className="text-[11.5px] font-medium text-brand-700"
                          onClick={() => setOverrideOpen(true)}
                        >
                          Change
                        </button>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
        <div className="flex items-start gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3 text-[11.5px] text-ink-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Overrides need sadar approval before they take effect. The member always
          sees the amount they are expected to pay — no surprises.
        </div>
      </Card>

      {pendingOverrides.length > 0 && (
        <p className="mt-3 text-[12px] text-amber-700">
          {pendingOverrides.length} fee change{pendingOverrides.length > 1 ? "s" : ""} waiting in
          the <a className="font-medium underline" href="/approvals/">approvals queue</a>.
        </p>
      )}

      <NewPlanDrawer
        open={buildOpen}
        onClose={() => setBuildOpen(false)}
        onSaved={async (plan) => {
          setPlans((prev) => [...prev, plan]);
          setBuildOpen(false);
          if (!isDemoMode) await load();
        }}
      />
      <ChangeFeeDrawer
        open={overrideOpen}
        members={members}
        onClose={() => setOverrideOpen(false)}
        onSaved={async () => {
          setOverrideOpen(false);
          if (!isDemoMode) await load();
        }}
      />
      <WaiveDrawer
        open={waiveOpen}
        members={members}
        invoices={invoices}
        memberMap={memberMap}
        onClose={() => setWaiveOpen(false)}
      />
    </>
  );
}

/* ── New plan drawer ──────────────────────────────────────────── */

function NewPlanDrawer({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (plan: FeePlan) => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("500");
  const [cycle, setCycle] = useState<FeePlan["cycle"]>("monthly");
  const [dueDay, setDueDay] = useState("10");
  const [graceDays, setGraceDays] = useState("5");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!name.trim()) return toast("Plan name is required", "error");
    const amountPaise = Math.round(Number(amount || "0") * 100);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0)
      return toast("Enter a valid amount", "error");

    setSaving(true);
    try {
      const plan = await createFeePlan({
        name,
        amountPaise,
        cycle,
        dueDay: Math.min(Math.max(Number(dueDay) || 10, 1), 28),
        graceDays: Math.max(Number(graceDays) || 0, 0),
      });
      toast(`Plan “${plan.name}” created`);
      setName("");
      await onSaved(plan);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Plan create nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New fee plan"
      subtitle="Create a plan and assign it to a group of members."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Create plan"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard monthly chanda" />
        </Field>
        <Field label="Amount per member (₹)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Billing cycle">
          <Select value={cycle} onChange={(e) => setCycle(e.target.value as FeePlan["cycle"])}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field label="Due day of month">
          <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Grace period (days)">
          <Input value={graceDays} onChange={(e) => setGraceDays(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[12px] text-brand-900">
        Expected monthly billing:{" "}
        <span className="font-semibold">{formatINR((Number(amount || 0) * 100) )}</span>{" "}
        per member. You can override individual members later.
      </div>
    </Drawer>
  );
}

/* ── Change fee drawer ────────────────────────────────────────── */

function ChangeFeeDrawer({
  open,
  members,
  onClose,
  onSaved,
}: {
  open: boolean;
  members: Member[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [amount, setAmount] = useState("500");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memberId && members[0]) setMemberId(members[0].id);
  }, [memberId, members]);

  const member = members.find((m) => m.id === memberId);
  const amountPaise = Math.round(Number(amount || "0") * 100);

  async function save() {
    if (!member) return toast("Select a member", "error");
    if (!Number.isFinite(amountPaise) || amountPaise < 0)
      return toast("Enter a valid amount", "error");
    if (!reason.trim()) return toast("A reason is required", "error");

    setSaving(true);
    try {
      await requestFeeChange(member.id, amountPaise, reason);
      toast("Fee change sent for sadar approval");
      setReason("");
      await onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Fee change save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Change a member's fee"
      subtitle="Goes to the sadar for approval before it takes effect."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? "Saving…" : "Send for approval"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Member">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.code}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="New monthly amount (₹)"
          hint={member ? `Current: ${formatINR(member.feePaise)} — enter 0 for a full concession.` : undefined}
        >
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Reason" hint="Shown to the sadar and kept in the audit trail.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. widow, medical hardship, voluntary higher"
          />
        </Field>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-900">
          No one can quietly change what a family pays. The request is recorded,
          the sadar approves it, and the member always sees the final amount.
        </div>
      </div>
    </Drawer>
  );
}

/* ── Waive dues drawer ────────────────────────────────────────── */

function WaiveDrawer({
  open,
  members,
  invoices,
  memberMap,
  onClose,
}: {
  open: boolean;
  members: Member[];
  invoices: Invoice[];
  memberMap: Map<string, Member>;
  onClose: () => void;
}) {
  const [memberId, setMemberId] = useState(members[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const [months, setMonths] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memberId && members[0]) setMemberId(members[0].id);
  }, [memberId, members]);

  const unpaid = useMemo(
    () =>
      invoices
        .filter(
          (i) =>
            i.memberId === memberId &&
            (i.status === "pending" || i.status === "partial")
        )
        .sort((a, b) => a.period.localeCompare(b.period)),
    [invoices, memberId]
  );

  // Keep the selection valid when the member changes.
  useEffect(() => {
    setMonths(unpaid.slice(0, 1).map((i) => i.period));
  }, [memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  const member = memberMap.get(memberId);
  const total = unpaid
    .filter((i) => months.includes(i.period))
    .reduce((s, i) => s + (i.amountPaise - i.paidPaise), 0);

  function togglePeriod(period: string) {
    setMonths((prev) =>
      prev.includes(period)
        ? prev.filter((p) => p !== period)
        : [...prev, period].sort()
    );
  }

  async function save() {
    if (!member) return toast("Select a member", "error");
    if (months.length === 0) return toast("Choose at least one month", "error");
    if (!reason.trim()) return toast("A reason is required", "error");

    setSaving(true);
    try {
      await requestWaiver(member.id, months, reason);
      toast("Waiver sent for sadar approval");
      setReason("");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Waiver save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Waive dues"
      subtitle="Waivers are recorded against the invoice and require sadar approval."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            <CheckCircle2 className="h-4 w-4" /> {saving ? "Saving…" : "Send for approval"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Member">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {m.code}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <label className="label">Months to waive</label>
          {unpaid.length === 0 ? (
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[12.5px] text-emerald-700">
              This member has no unpaid months.
            </p>
          ) : (
            <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
              {unpaid.map((i) => {
                const on = months.includes(i.period);
                return (
                  <button
                    key={i.id}
                    onClick={() => togglePeriod(i.period)}
                    className={cn(
                      "flex w-full items-center justify-between px-3.5 py-2.5 text-left",
                      on && "bg-brand-50/50"
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md text-[10px] font-semibold",
                          on ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500"
                        )}
                      >
                        {on ? "✓" : ""}
                      </span>
                      <span className="text-[12.5px] font-medium text-ink-800">
                        {periodLabel(i.period)}
                      </span>
                    </span>
                    <span className="text-[12.5px] font-medium text-ink-900">
                      {formatINR(i.amountPaise - i.paidPaise)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <Field label="Reason" hint="This is shown to the auditor and sadar.">
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. widow, medical hardship"
          />
        </Field>

        <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-ink-500">Amount being waived</span>
            <span className="font-semibold text-ink-900">{formatINR(total)}</span>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11.5px] leading-relaxed text-amber-900">
          Waiving dues does not delete the invoice — it marks it as waived with a
          reason and approver. The khajanchi&apos;s name is never attached to a
          write-off they did not request.
        </div>
      </div>
    </Drawer>
  );
}
