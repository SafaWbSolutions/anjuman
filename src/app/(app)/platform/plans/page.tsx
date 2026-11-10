"use client";

import { useState } from "react";
import {
  Check,
  Layers,
  Pencil,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { platformPlans } from "@/lib/mock";
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
  Switch,
  toast,
} from "@/components/ui";
import { cn, formatINR } from "@/lib/utils";

export default function PlansPage() {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Plans & pricing"
        description="Default plans for new anjumans. Any tenant's price can still be overridden individually from their profile."
        actions={
          <Button onClick={() => setEditOpen(true)}>
            <Plus className="h-4 w-4" /> New plan
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-4">
        {platformPlans.map((p) => {
          const highlight = p.id === "p-standard";
          return (
            <Card
              key={p.id}
              className={cn(
                "relative flex flex-col p-5",
                highlight && "ring-2 ring-brand-500/40"
              )}
            >
              {highlight && (
                <span className="absolute -top-2.5 left-4 rounded-full bg-brand-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                  Most popular
                </span>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[13.5px] font-semibold text-ink-900">{p.name}</p>
                <Badge tone={p.type === "free" ? "slate" : p.type === "custom" ? "violet" : "brand"}>
                  {p.type}
                </Badge>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-semibold tracking-tight text-ink-900">
                  {p.type === "custom" ? "Custom" : p.pricePaise === 0 ? "Free" : formatINR(p.pricePaise)}
                </span>
                {p.pricePaise > 0 && (
                  <span className="text-[12px] text-ink-500">/{p.cycle === "yearly" ? "year" : p.cycle}</span>
                )}
              </div>
              <p className="mt-1 text-[11.5px] text-ink-500">
                {p.maxMembers ? `Up to ${p.maxMembers} members` : "Unlimited members"}
              </p>

              <ul className="mt-4 flex-1 space-y-2">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[12px] text-ink-600">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-600" />
                    {f}
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-500">
                  <Users className="h-3.5 w-3.5" /> {p.activeTenants} anjumans
                </span>
                <button
                  onClick={() => setEditOpen(true)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium text-brand-700"
                >
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Feature availability"
            subtitle="What each plan unlocks — enforced by feature flags, not just UI"
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="table-head">
                  <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">Feature</th>
                  {platformPlans.map((p) => (
                    <th key={p.id} className="px-4 py-2.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
                      {p.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {[
                  ["Members & households", [1, 1, 1, 1]],
                  ["Collections & receipts", [1, 1, 1, 1]],
                  ["Online payments (own gateway)", [0, 1, 1, 1]],
                  ["WhatsApp reminders", [0, 1, 1, 1]],
                  ["ID cards + QR", [0, 1, 1, 1]],
                  ["Multiple masjids", [0, 0, 1, 1]],
                  ["Audit pack export", [0, 0, 1, 1]],
                  ["Priority support", [0, 0, 1, 1]],
                  ["Dedicated onboarding", [0, 0, 0, 1]],
                ].map(([label, flags]) => (
                  <tr key={label as string} className="hover:bg-ink-50/50">
                    <td className="px-5 py-2.5 text-[12.5px] text-ink-700">{label as string}</td>
                    {(flags as number[]).map((f, i) => (
                      <td key={i} className="px-4 py-2.5 text-center">
                        {f ? (
                          <Check className="mx-auto h-3.5 w-3.5 text-brand-600" />
                        ) : (
                          <span className="text-ink-300">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Revenue mix" subtitle="By plan" />
          <div className="space-y-3 p-5">
            {platformPlans
              .filter((p) => p.pricePaise > 0)
              .map((p) => {
                const rev = p.pricePaise * p.activeTenants;
                const max = Math.max(...platformPlans.map((x) => x.pricePaise * x.activeTenants));
                return (
                  <div key={p.id}>
                    <div className="mb-1 flex justify-between text-[12px]">
                      <span className="text-ink-600">{p.name}</span>
                      <span className="font-medium text-ink-900">{formatINR(rev)}</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${(rev / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            <div className="flex items-center justify-between border-t border-ink-100 pt-3 text-[12.5px]">
              <span className="font-medium text-ink-700">Total ARR</span>
              <span className="font-semibold text-ink-900">
                {formatINR(platformPlans.reduce((s, p) => s + p.pricePaise * p.activeTenants, 0))}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Plan defaults" subtitle="Applied to every new signup" />
        <div className="divide-y divide-ink-100">
          {[
            { label: "Default plan for new signups", hint: "Can be changed per tenant" },
            { label: "14-day free trial", hint: "Full features, no card required" },
            { label: "Auto-downgrade to read-only after grace", hint: "14 days after expiry" },
            { label: "Prorate upgrades mid-cycle", hint: "Charges the difference only" },
          ].map((s) => (
            <div key={s.label} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-[12.5px] font-medium text-ink-800">{s.label}</p>
                <p className="text-[11px] text-ink-500">{s.hint}</p>
              </div>
              <Switch checked onChange={() => toast("Plan default updated")} />
            </div>
          ))}
        </div>
      </Card>

      <Drawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit plan"
        subtitle="Changes apply only to new subscriptions unless you choose to migrate"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast("Plan saved"); setEditOpen(false); }}>Save plan</Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan name" className="sm:col-span-2">
            <Input defaultValue="Standard" />
          </Field>
          <Field label="Pricing model">
            <Select defaultValue="fixed">
              <option value="free">Free</option>
              <option value="fixed">Fixed price</option>
              <option value="custom">Custom per tenant</option>
            </Select>
          </Field>
          <Field label="Price (₹)">
            <Input defaultValue="1200" inputMode="numeric" />
          </Field>
          <Field label="Billing cycle">
            <Select defaultValue="yearly">
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
              <option value="lifetime">Lifetime</option>
            </Select>
          </Field>
          <Field label="Member limit" hint="Leave blank for unlimited.">
            <Input defaultValue="1000" inputMode="numeric" />
          </Field>
        </div>
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold text-ink-800">
            <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Included features
          </p>
          <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
            {["Online payments", "WhatsApp reminders", "ID cards + QR", "Multiple masjids", "Audit pack", "Priority support"].map((f, i) => (
              <div key={f} className="flex items-center justify-between px-3.5 py-2.5">
                <span className="text-[12.5px] text-ink-700">{f}</span>
                <Switch checked={i < 4} onChange={() => toast("Feature toggled")} />
              </div>
            ))}
          </div>
        </div>
      </Drawer>
    </>
  );
}
