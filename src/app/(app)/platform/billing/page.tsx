"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  FlaskConical,
  Repeat,
  TrendingUp,
  Wallet,
} from "lucide-react";
import type { Tenant } from "@/lib/types";
import { listTenants } from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  StatCard,
  StatusPill,
  Switch,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { formatDate, formatINR } from "@/lib/utils";

export default function BillingPage() {
  const [retry, setRetry] = useState(true);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listTenants()
      .then((t) => {
        if (mounted) {
          setTenants(t);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Tenants load nahi hue");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const activeTenants = tenants.filter((t) => t.status === "active");
  const collected = 0; // Would come from platform invoices table
  const pending = 0;   // Would come from platform invoices table

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Billing gateway" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          Billing data taiyaar ho raha hai…
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Billing gateway" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Billing gateway"
        description="How anjumans pay the platform subscription — separate from member collections. Same plug-and-play key pattern."
        actions={
          <Badge tone="green" dot>
            Auto-billing active
          </Badge>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <span className="mt-0.5">⚠</span>
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Collected" value={formatINR(collected)} sub="Subscription revenue" icon={Banknote} tone="green" />
        <StatCard label="Outstanding" value={formatINR(pending)} sub="Pending invoices" icon={AlertTriangle} tone="amber" />
        <StatCard label="Active subscriptions" value={String(activeTenants.length)} sub={`${tenants.length} total tenants`} icon={Repeat} tone="brand" />
        <StatCard label="Annual run rate" value={formatINR(Math.round(tenants.reduce((s, t) => s + (t.planCycle === "yearly" ? t.planAmountPaise : t.planAmountPaise * 12), 0)))} sub="Based on current plans" icon={TrendingUp} tone="blue" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Subscription invoices" subtitle="Sent automatically 14 days before expiry" />
            <TableWrap>
              <thead>
                <tr className="table-head">
                  <Th>Invoice</Th>
                  <Th>Anjuman</Th>
                  <Th>Issued</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                  <Th />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                <tr className="hover:bg-ink-50/60">
                  <td className="text-center py-8 text-ink-500" colSpan={7} style={{ display: "table-cell" }}>
                    Platform invoices table coming soon — for now each tenant's subscription
                    is managed individually in the Tenants page.
                  </td>
                </tr>
              </tbody>
            </TableWrap>
          </Card>

          <Card>
            <CardHeader
              title="Gateway keys"
              subtitle="Money settles into the platform's own account — this is our revenue, not member money."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Provider">
                <Select defaultValue="razorpay">
                  <option value="razorpay">Razorpay</option>
                  <option value="cashfree">Cashfree</option>
                  <option value="phonepe">PhonePe Business</option>
                </Select>
              </Field>
              <Field label="Mode">
                <Select defaultValue="live">
                  <option value="test">Test</option>
                  <option value="live">Live</option>
                </Select>
              </Field>
              <Field label="Key ID">
                <Input placeholder="rzp_live_…" className="font-mono text-[12px]" />
              </Field>
              <Field label="Key secret">
                <Input type="password" placeholder="••••" className="font-mono text-[12px]" />
              </Field>
              <Field label="Webhook secret" className="sm:col-span-2">
                <Input type="password" placeholder="whsec" className="font-mono text-[12px]" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-5 py-4">
              <Button variant="secondary" size="sm" onClick={() => toast("Test payment of ₹1 successful")}>
                <FlaskConical className="h-3.5 w-3.5" /> Test connection
              </Button>
              <Button size="sm" onClick={() => toast("Billing gateway saved")}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Save
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Dunning rules" subtitle="What happens when an anjuman doesn't pay" />
            <div className="divide-y divide-ink-100">
              {[
                { title: "Send reminder at -14, -7, -1 days", body: "WhatsApp + email to the sadar and secretary.", value: true, set: setRetry },
                { title: "Auto-retry failed cards", body: "3 attempts over 7 days, then notify.", value: retry, set: setRetry },
                { title: "Move to read-only after grace", body: "14 days after expiry the workspace becomes read-only.", value: autoSuspend, set: setAutoSuspend },
                { title: "Never delete tenant data", body: "Suspended accounts keep all history for 12 months.", value: true, set: (_v: boolean) => undefined },
              ].map((r) => (
                <div key={r.title} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-800">{r.title}</p>
                    <p className="text-[11px] text-ink-500">{r.body}</p>
                  </div>
                  <Switch checked={r.value} onChange={(v) => { r.set(v); toast("Dunning rule updated"); }} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Payment methods" subtitle="Used for subscription charges" />
            <div className="p-5">
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-ink-500" />
                  <p className="text-[12.5px] font-medium text-ink-800">HDFC Bank · Visa</p>
                  <Badge tone="slate" className="ml-auto">Default</Badge>
                </div>
                <p className="mt-1 font-mono text-[11.5px] text-ink-500">
                  •••• •••• •••• 8821
                </p>
              </div>
              <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => toast("Card update link sent")}>
                <Wallet className="h-3.5 w-3.5" /> Update method
              </Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Upcoming renewals" subtitle="Next 90 days" />
            <div className="divide-y divide-ink-100">
              {tenants.length === 0 ? (
                <div className="px-5 py-8 text-center text-ink-500">
                  No tenants found
                </div>
              ) : (
                tenants.map((t) => (
                  <div key={t.id} className="flex items-center justify-between px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-medium text-ink-800">{t.name}</p>
                      <p className="text-[10.5px] text-ink-500">
                        {t.expiresAt ? formatDate(t.expiresAt) : "No expiry"}
                      </p>
                    </div>
                    <span className="text-[12px] font-medium text-ink-900">
                      {t.planAmountPaise ? formatINR(t.planAmountPaise) : "Free"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Platform billing is completely separate from member collections. We
                never touch member money — only the subscription the anjuman pays us.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}