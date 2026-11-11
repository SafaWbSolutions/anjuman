"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  CreditCard,
  Download,
  FileText,
  FlaskConical,
  Plus,
  Repeat,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import type { PlatformInvoice } from "@/lib/types";
import {
  createPlatformInvoice,
  listPlatformInvoices,
  markPlatformInvoicePaid,
  voidPlatformInvoice,
  listTenants,
} from "@/lib/repo";
import type { Tenant } from "@/lib/types";
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
  StatusPill,
  Switch,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { formatDate, formatINR } from "@/lib/utils";

const STATUS_COLOR: Record<string, "brand" | "green" | "amber" | "red" | "slate"> = {
  pending: "amber",
  paid: "green",
  overdue: "red",
  voided: "slate",
};

export default function BillingPage() {
  const [retry, setRetry] = useState(true);
  const [autoSuspend, setAutoSuspend] = useState(true);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [invoices, setInvoices] = useState<PlatformInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceDrawer, setInvoiceDrawer] = useState<PlatformInvoice | null>(null);
  const [newInvoice, setNewInvoice] = useState({
    tenantId: "" as string,
    amountPaise: 0 as number,
    periodFrom: "" as string,
    periodTo: "" as string,
    dueDate: "" as string,
  });

  useEffect(() => {
    let mounted = true;
    Promise.all([listTenants(), listPlatformInvoices()])
      .then(([t, inv]) => {
        if (mounted) {
          setTenants(t);
          setInvoices(inv);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (mounted) {
          setError(e instanceof Error ? e.message : "Data load nahi hua");
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const activeTenants = tenants.filter((t) => t.status === "active");
  const collected = invoices
    .filter((i) => i.status === "paid")
    .reduce((s, i) => s + (i.paidAmountPaise ?? i.amountPaise), 0);
  const pending = invoices
    .filter((i) => i.status === "pending")
    .reduce((s, i) => s + i.amountPaise, 0);
  const overdue = invoices
    .filter((i) => i.status === "overdue")
    .reduce((s, i) => s + i.amountPaise, 0);

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
        description="Subscription invoices that anjumans pay to the platform — separate from member collections."
        actions={
          <Button onClick={() => setDrawerOpen(true)}>
            <Plus className="h-4 w-4" /> New invoice
          </Button>
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
        <StatCard label="Overdue" value={formatINR(overdue)} sub="Past due date" icon={AlertTriangle} tone="red" />
        <StatCard label="Active subscriptions" value={String(activeTenants.length)} sub={`${tenants.length} total tenants`} icon={Repeat} tone="brand" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <CardHeader
              title="Subscription invoices"
              subtitle="All platform invoices across anjumans"
              action={
                <Badge tone={overdue > 0 ? "red" : "green"} dot>
                  {invoices.length} invoices
                </Badge>
              }
            />
            <TableWrap>
              <thead>
                <tr className="table-head">
                  <Th>Invoice</Th>
                  <Th>Anjuman</Th>
                  <Th>Period</Th>
                  <th>Due</th>
                  <Th>Status</Th>
                  <Th className="text-right">Amount</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-ink-50/60">
                    <Td>
                      <span className="font-mono text-[11.5px] text-ink-600">{inv.invoiceNo}</span>
                    </Td>
                    <Td>
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink-900">{inv.tenantName}</p>
                      </div>
                    </Td>
                    <Td className="text-[12px] text-ink-700">
                      {formatDate(inv.periodFrom)} – {formatDate(inv.periodTo)}
                    </Td>
                    <Td className="text-[12px] text-ink-700">{formatDate(inv.dueDate)}</Td>
                    <Td>
                      <StatusPill status={inv.status} />
                    </Td>
                    <Td className="text-[12px] text-ink-700 text-right">
                      {formatINR(inv.amountPaise)}
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-1">
                        {inv.status === "pending" && (
                          <button
                            onClick={() => {
                              setInvoiceDrawer(inv);
                              setDrawerOpen(true);
                            }}
                            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                            aria-label="Mark paid"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          onClick={() => {
                            voidPlatformInvoice(inv.id).then(() => {
                              toast("Invoice voided");
                              setInvoices((prev) =>
                                prev.map((i) => (i.id === inv.id ? { ...i, status: "voided" } : i))
                              );
                            }).catch((e) => toast(e instanceof Error ? e.message : "Void failed", "error"));
                          }}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                          aria-label="Void"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </Td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-ink-500">
                      No platform invoices yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </TableWrap>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Gateway keys" subtitle="Money settles into the platform's own account — this is our revenue, not member money." />
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
                {
                  title: "Send reminder at -14, -7, -1 days",
                  body: "WhatsApp + email to the sadar and secretary.",
                  value: true,
                },
                {
                  title: "Auto-retry failed cards",
                  body: "3 attempts over 7 days, then notify.",
                  value: retry,
                },
                {
                  title: "Move to read-only after grace",
                  body: "14 days after expiry the workspace becomes read-only.",
                  value: autoSuspend,
                },
                {
                  title: "Never delete tenant data",
                  body: "Suspended accounts keep all history for 12 months.",
                  value: true,
                },
              ].map((r) => (
                <div key={r.title} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-800">{r.title}</p>
                    <p className="text-[11px] text-ink-500">{r.body}</p>
                  </div>
                  <Switch
                    checked={r.value}
                    onChange={(v) => {
                      if (r.title.includes("Auto-retry")) setRetry(v);
                      if (r.title.includes("Move to read-only")) setAutoSuspend(v);
                      toast("Dunning rule updated");
                    }}
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5 xl:col-span-1">
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
                <div className="px-5 py-8 text-center text-ink-500">No tenants found</div>
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

      {/* New invoice drawer */}
      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title="Create platform invoice"
        subtitle="Bill an anjuman for their subscription"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateInvoice} loading={saving} disabled={saving}>
              Create invoice
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Anjuman">
            <Select value={newInvoice.tenantId} onChange={(e) => setNewInvoice({ ...newInvoice, tenantId: e.target.value })}>
              <option value="">Select anjuman</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (₹)">
            <Input
              type="number"
              value={newInvoice.amountPaise / 100}
              onChange={(e) => setNewInvoice({ ...newInvoice, amountPaise: Math.round(Number(e.target.value) * 100) })}
              placeholder="0"
              inputMode="numeric"
            />
          </Field>
          <Field label="Period from">
            <Input type="date" value={newInvoice.periodFrom} onChange={(e) => setNewInvoice({ ...newInvoice, periodFrom: e.target.value })} />
          </Field>
          <Field label="Period to">
            <Input type="date" value={newInvoice.periodTo} onChange={(e) => setNewInvoice({ ...newInvoice, periodTo: e.target.value })} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={newInvoice.dueDate} onChange={(e) => setNewInvoice({ ...newInvoice, dueDate: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      {/* Mark paid drawer */}
      <Drawer
        open={!!invoiceDrawer}
        onClose={() => setInvoiceDrawer(null)}
        title="Mark invoice as paid"
        subtitle={invoiceDrawer?.invoiceNo}
        width="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setInvoiceDrawer(null)}>
              Cancel
            </Button>
            <Button onClick={handleMarkPaid} loading={saving} disabled={saving}>
              Mark paid
            </Button>
          </div>
        }
      >
        {invoiceDrawer && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice">
              <span className="font-mono text-[12px] text-ink-600">{invoiceDrawer.invoiceNo}</span>
            </Field>
            <Field label="Amount (₹)">
              <span className="font-medium text-[12px]">{formatINR(invoiceDrawer.amountPaise)}</span>
            </Field>
            <Field label="Paid amount (₹)">
              <Input
                type="number"
                value={newInvoice.amountPaise / 100}
                onChange={(e) => setNewInvoice({ ...newInvoice, amountPaise: Math.round(Number(e.target.value) * 100) })}
                placeholder="0"
                inputMode="numeric"
              />
            </Field>
          </div>
        )}
      </Drawer>
    </>
  );

  async function handleCreateInvoice() {
    if (!newInvoice.tenantId || !newInvoice.amountPaise || !newInvoice.periodFrom || !newInvoice.periodTo || !newInvoice.dueDate) {
      toast("All fields are required", "error");
      return;
    }
    setSaving(true);
    try {
      await createPlatformInvoice({
        tenantId: newInvoice.tenantId,
        amountPaise: newInvoice.amountPaise,
        periodFrom: newInvoice.periodFrom,
        periodTo: newInvoice.periodTo,
        dueDate: newInvoice.dueDate,
      });
      toast("Invoice created");
      setDrawerOpen(false);
      setNewInvoice({ tenantId: "", amountPaise: 0, periodFrom: "", periodTo: "", dueDate: "" });
      const inv = await listPlatformInvoices();
      setInvoices(inv);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkPaid() {
    if (!invoiceDrawer) return;
    setSaving(true);
    try {
      await markPlatformInvoicePaid(invoiceDrawer.id, newInvoice.amountPaise);
      toast("Invoice marked paid");
      setInvoiceDrawer(null);
      const inv = await listPlatformInvoices();
      setInvoices(inv);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mark failed", "error");
    } finally {
      setSaving(false);
    }
  }
}
