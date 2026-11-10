"use client";

import { useState } from "react";
import {
  BadgePercent,
  CheckCircle2,
  CircleDollarSign,
  Info,
  Plus,
  ReceiptText,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { members, dueTotal } from "@/lib/mock";
import {
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
import { Avatar } from "@/components/ui";
import { formatINR, cn } from "@/lib/utils";

interface Plan {
  id: string;
  name: string;
  amount: number;
  cycle: "monthly" | "quarterly" | "yearly";
  members: number;
  status: "active" | "draft";
  dueDay: number;
}

const PLANS: Plan[] = [
  { id: "pl-1", name: "Standard monthly chanda", amount: 50000, cycle: "monthly", members: 24, status: "active", dueDay: 10 },
  { id: "pl-2", name: "Donor / supporter", amount: 100000, cycle: "monthly", members: 3, status: "active", dueDay: 10 },
  { id: "pl-3", name: "Reduced (senior / widow)", amount: 30000, cycle: "monthly", members: 2, status: "active", dueDay: 10 },
];

const OVERRIDES = [
  { memberId: "m-5", amount: 0, reason: "Widow — full concession", approved: true },
  { memberId: "m-11", amount: 100000, reason: "Business owner — voluntary higher", approved: true },
  { memberId: "m-28", amount: 25000, reason: "Senior citizen concession", approved: false },
];

export default function FeePlansPage() {
  const [buildOpen, setBuildOpen] = useState(false);
  const [waiveOpen, setWaiveOpen] = useState(false);
  const [autoReminder, setAutoReminder] = useState(true);
  const [autoInvoice, setAutoInvoice] = useState(true);

  const billedMonthly = PLANS.reduce((s, p) => s + p.amount * p.members, 0);

  return (
    <>
      <PageHeader
        eyebrow="Finance"
        title="Fee plans"
        description="Set the monthly chanda, per-member overrides and concessions. Invoices and reminders are generated automatically."
        actions={
          <>
            <Button variant="secondary" onClick={() => setWaiveOpen(true)}>
              <BadgePercent className="h-4 w-4" /> Waive dues
            </Button>
            <Button onClick={() => setBuildOpen(true)}>
              <Plus className="h-4 w-4" /> New plan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Monthly billing" value={formatINR(billedMonthly)} sub="Expected this cycle" icon={CircleDollarSign} tone="brand" />
        <StatCard label="Members on plans" value={String(PLANS.reduce((s, p) => s + p.members, 0))} sub="Some have overrides" icon={Users} tone="blue" />
        <StatCard label="Concessions given" value={formatINR(50000 + 50000)} sub="2 full + 1 partial" icon={BadgePercent} tone="violet" />
        <StatCard label="Outstanding" value={formatINR(members.reduce((s, m) => s + dueTotal(m.id), 0))} sub="Auto-reminded daily" icon={Wallet} tone="amber" />
      </div>

      {/* ── Plans ────────────────────────────────────────────── */}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {PLANS.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13.5px] font-semibold text-ink-900">{p.name}</p>
                <p className="mt-0.5 text-[11.5px] text-ink-500">
                  Due on the {p.dueDay}th of every month
                </p>
              </div>
              <Badge tone={p.status === "active" ? "green" : "slate"} dot>
                {p.status === "active" ? "Active" : "Draft"}
              </Badge>
            </div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-2xl font-semibold tracking-tight text-ink-900">
                {formatINR(p.amount)}
              </span>
              <span className="text-[12px] text-ink-500">/{p.cycle}</span>
            </div>
            <div className="mt-3 flex items-center gap-4 text-[12px] text-ink-500">
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" /> {p.members} members
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ReceiptText className="h-3.5 w-3.5" /> Auto invoice
              </span>
            </div>
            <div className="mt-4 flex gap-2 border-t border-ink-100 pt-3">
              <Button variant="secondary" size="sm" className="flex-1" onClick={() => toast("Plan editor opened")}>
                Edit
              </Button>
              <Button variant="ghost" size="sm" className="flex-1" onClick={() => toast("Plan archived")}>
                Archive
              </Button>
            </div>
          </Card>
        ))}

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
          <Button variant="soft" size="sm" className="mt-3" onClick={() => toast("Override picker opened")}>
            Add override
          </Button>
        </Card>
      </div>

      {/* ── Automation toggles ───────────────────────────────── */}
      <Card className="mt-5">
        <CardHeader
          title="Automation"
          subtitle="Turn it on once and forget — this is what keeps a solo operator free."
        />
        <div className="divide-y divide-ink-100">
          {[
            {
              title: "Auto-generate invoices",
              body: "Create a pending invoice for every active member on the 1st of each month.",
              value: autoInvoice,
              set: setAutoInvoice,
            },
            {
              title: "Automatic reminders",
              body: "WhatsApp/SMS on the 3rd, 7th and 10th; a final notice on the 15th.",
              value: autoReminder,
              set: setAutoReminder,
            },
            {
              title: "Auto-reconcile gateway payments",
              body: "Match Razorpay/Cashfree settlements to invoices by reference and amount.",
              value: true,
              set: (_v: boolean) => undefined,
            },
          ].map((r) => (
            <div key={r.title} className="flex items-start gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink-900">{r.title}</p>
                <p className="mt-0.5 text-[12px] text-ink-500">{r.body}</p>
              </div>
              <Switch checked={r.value} onChange={(v) => { r.set(v); toast(v ? "Enabled" : "Disabled"); }} />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Overrides ────────────────────────────────────────── */}
      <Card className="mt-5">
        <CardHeader
          title="Per-member overrides"
          subtitle="Only these members pay something different from the plan amount."
          action={
            <Button variant="secondary" size="sm" onClick={() => toast("Override picker opened")}>
              <Plus className="h-3.5 w-3.5" /> Add
            </Button>
          }
        />
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
            {OVERRIDES.map((o) => {
              const m = members.find((x) => x.id === o.memberId)!;
              return (
                <tr key={o.memberId} className="hover:bg-ink-50/60">
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
                    <span className={cn("font-medium", o.amount === 0 ? "text-violet-700" : "text-ink-900")}>
                      {o.amount === 0 ? "Waived" : formatINR(o.amount)}
                    </span>
                  </Td>
                  <Td className="text-[12px] text-ink-500">{o.reason}</Td>
                  <Td>
                    {o.approved ? (
                      <Badge tone="green" dot>Approved</Badge>
                    ) : (
                      <Badge tone="amber" dot>Pending</Badge>
                    )}
                  </Td>
                  <Td className="text-right">
                    <button className="text-[11.5px] font-medium text-brand-700" onClick={() => toast("Override updated")}>
                      Edit
                    </button>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
        <div className="flex items-start gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3 text-[11.5px] text-ink-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Overrides need sadar approval before they take effect. The member always
          sees the amount they are expected to pay — no surprises.
        </div>
      </Card>

      <NewPlanDrawer open={buildOpen} onClose={() => setBuildOpen(false)} />
      <WaiveDrawer open={waiveOpen} onClose={() => setWaiveOpen(false)} />
    </>
  );
}

function NewPlanDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [amount, setAmount] = useState("500");
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New fee plan"
      subtitle="Create a plan and assign it to a group of members."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { toast("Fee plan created"); onClose(); }}>Create plan</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan name" className="sm:col-span-2">
          <Input placeholder="e.g. Standard monthly chanda" />
        </Field>
        <Field label="Amount per member (₹)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Billing cycle">
          <Select defaultValue="monthly">
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </Field>
        <Field label="Due day of month">
          <Input defaultValue="10" inputMode="numeric" />
        </Field>
        <Field label="Grace period (days)">
          <Input defaultValue="5" inputMode="numeric" />
        </Field>
        <Field label="Apply to" className="sm:col-span-2">
          <Select defaultValue="all">
            <option value="all">All active members</option>
            <option value="mohalla">A specific mohalla</option>
            <option value="manual">Select members manually</option>
          </Select>
        </Field>
      </div>
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[12px] text-brand-900">
        Expected monthly billing:{" "}
        <span className="font-semibold">
          {formatINR(Number(amount || 0) * 100 * 24)}
        </span>{" "}
        for 24 members.
      </div>
    </Drawer>
  );
}

function WaiveDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [memberId, setMemberId] = useState("m-5");
  const [months, setMonths] = useState("1");
  const m = members.find((x) => x.id === memberId)!;
  const amount = Number(months) * m.feePaise;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Waive dues"
      subtitle="Waivers are recorded in the ledger and require sadar approval."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { toast("Waiver sent for approval"); onClose(); }}>
            <CheckCircle2 className="h-4 w-4" /> Send for approval
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Member">
          <Select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            {members.slice(0, 12).map((x) => (
              <option key={x.id} value={x.id}>{x.name} · {x.code}</option>
            ))}
          </Select>
        </Field>
        <Field label="Number of months">
          <Select value={months} onChange={(e) => setMonths(e.target.value)}>
            <option value="1">1 month</option>
            <option value="2">2 months</option>
            <option value="3">3 months</option>
          </Select>
        </Field>
        <Field label="Reason" hint="This is shown to the auditor and sadar.">
          <Input placeholder="e.g. widow, medical hardship" />
        </Field>
        <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="text-ink-500">Amount being waived</span>
            <span className="font-semibold text-ink-900">{formatINR(amount)}</span>
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
