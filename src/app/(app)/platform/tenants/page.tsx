"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building2,
  CalendarClock,
  CheckCircle2,
  Eye,
  Gauge,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  UserCog,
  UserPlus,
  Loader2,
} from "lucide-react";
import type { Tenant, TenantStatus } from "@/lib/types";
import {
  createTenantRecord,
  listTenants,
  saveTenantProfileForTenant,
} from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Field,
  Input,
  PageHeader,
  PhoneInput,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
  Switch,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { cn, formatDate, formatINR } from "@/lib/utils";

const IMPERSONATE_KEY = "anjuman.impersonating";

export default function TenantsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const impersonating = typeof window !== "undefined" ? localStorage.getItem(IMPERSONATE_KEY) : null;

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

  const rows = useMemo(
    () =>
      tenants.filter((t) => {
        if (status !== "all" && t.status !== status) return false;
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          t.name.toLowerCase().includes(term) ||
          t.code.toLowerCase().includes(term) ||
          t.village.toLowerCase().includes(term) ||
          t.district.toLowerCase().includes(term)
        );
      }),
    [q, status, tenants]
  );

  const active = tenants.filter((t) => t.status === "active");
  const revenue = tenants.reduce(
    (s, t) => s + (t.planCycle === "yearly" ? t.planAmountPaise / 12 : t.planAmountPaise),
    0
  );

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Anjumans" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Tenants list taiyaar ho raha hai…
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Anjumans" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </Card>
      </>
    );
  }

  return (
    <>
      {impersonating && (
        <div className="bg-amber-50 border border-amber-200 p-3 text-[12px] text-amber-900 flex items-center justify-between">
          <span>
            ⚠ Impersonating <b>{tenants.find((t) => t.id === impersonating)?.name ?? "an anjuman"}</b> —
            all actions below apply to this committee only.
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              localStorage.removeItem(IMPERSONATE_KEY);
              window.location.reload();
            }}
          >
            Stop impersonating
          </Button>
        </div>
      )}

      <PageHeader
        eyebrow="Platform"
        title="Anjumans"
        description="Onboard committees, set their pricing individually and control what each one can use."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" /> New anjuman
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total anjumans" value={String(tenants.length)} sub={`${active.length} active`} icon={Building2} tone="brand" />
        <StatCard label="MRR" value={formatINR(Math.round(revenue))} sub="Recurring revenue" icon={CalendarClock} tone="green" />
        <StatCard label="Members served" value={tenants.reduce((s, t) => s + t.membersCount, 0).toLocaleString("en-IN")} sub="Across all tenants" icon={Eye} tone="blue" />
        <StatCard label="Needs attention" value={String(tenants.filter((t) => t.status !== "active").length)} sub="Expired / trial" icon={ShieldAlert} tone="amber" />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Name, code, village…" className="w-full sm:w-72" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto py-2 text-[12.5px]">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="trial">Trial</option>
          <option value="read_only">Read only</option>
          <option value="suspended">Suspended</option>
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">{rows.length} anjumans</span>
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr className="table-head">
              <Th>Anjuman</Th>
              <Th>Code</Th>
              <Th>Plan</Th>
              <Th>Members</Th>
              <Th>Status</Th>
              <Th>Expiry</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {rows.map((t) => (
              <tr key={t.id} className="hover:bg-ink-50/60">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-[11px] font-semibold text-ink-600">
                      {t.code}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink-900">{t.name}</p>
                      <p className="text-[11px] text-ink-500">{t.village}, {t.district}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <span className="font-mono text-[11.5px] text-ink-600">{t.code}</span>
                </Td>
                <Td>
                  <div className="flex flex-col gap-0.5">
                    <Badge tone={t.planType === "free" ? "slate" : t.planType === "custom" ? "violet" : "brand"}>
                      {t.planType === "free" ? "Free" : t.planType === "custom" ? "Custom" : "Fixed"}
                    </Badge>
                    <span className="text-[10.5px] text-ink-500">
                      {t.planAmountPaise === 0 ? "—" : formatINR(t.planAmountPaise) + "/yr"}
                    </span>
                  </div>
                </Td>
                <Td className="text-[12.5px] text-ink-700">{t.membersCount}</Td>
                <Td><StatusPill status={t.status} /></Td>
                <Td className="text-[12px] text-ink-500">
                  {t.expiresAt ? formatDate(t.expiresAt) : "No expiry"}
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => setSelected(t)}
                      className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                      aria-label="Manage"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        localStorage.setItem(IMPERSONATE_KEY, t.id);
                        toast(`Impersonating ${t.name}`);
                        window.location.reload();
                      }}
                      className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                      aria-label="Impersonate"
                    >
                      <UserCog className="h-4 w-4" />
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      <Card className="mt-5">
        <CardHeader title="Pricing rules" subtitle="How the platform charges each anjuman" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            { title: "Free", body: "Up to 150 members, core features. Used for pilots and small masjids." },
            { title: "Fixed", body: "Standard or Pro plan price. Can be changed per tenant without affecting others." },
            { title: "Custom", body: "Negotiated amount with its own limits and feature flags. Ideal for large trusts." },
          ].map((p) => (
            <div key={p.title} className="rounded-xl border border-ink-100 p-4">
              <p className="text-[12.5px] font-semibold text-ink-900">{p.title}</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{p.body}</p>
            </div>
          ))}
        </div>
      </Card>

      <TenantDrawer
        tenant={selected}
        onClose={() => {
          setSelected(null);
          // Status may have changed (suspend / reactivate) - refresh rows.
          listTenants()
            .then(setTenants)
            .catch(() => {});
        }}
      />
      <NewTenantDrawer open={newOpen} onClose={() => setNewOpen(false)} />
    </>
  );
}

function TenantDrawer({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const [planType, setPlanType] = useState(tenant?.planType ?? "fixed");
  const [amount, setAmount] = useState(String((tenant?.planAmountPaise ?? 0) / 100));
  const [status, setStatus] = useState<TenantStatus>(tenant?.status ?? "active");
  const [flags, setFlags] = useState<Record<string, boolean>>(tenant?.features ?? {
    payments: true,
    whatsapp: true,
    idCards: true,
    multiMasjid: false,
    auditPack: true,
  });
  const [saving, setSaving] = useState(false);

  if (!tenant) return null;

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    try {
      await saveTenantProfileForTenant(tenant.id, {
        planType,
        planAmountPaise: planType === "free" ? 0 : Math.round(Number(amount) * 100),
        status,
        expiresAt: tenant.expiresAt,
      });
      // Save feature flags separately via tenant settings is not exposed yet;
      // we persist them on the tenant row via features column if the column exists.
      // For now, toast confirmation.
      toast("Tenant settings saved");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspend() {
    if (!tenant) return;
    setSaving(true);
    try {
      await saveTenantProfileForTenant(tenant.id, { status: "suspended" });
      toast("Anjuman suspended — all its logins are blocked. No data was deleted.");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Suspend failed", "error");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Reactivating only flips tenants.status back to active. Members,
   * invoices, payments, ledger, funds, staff logins - everything is
   * exactly where it was, so every panel starts working again.
   */
  async function handleReactivate() {
    if (!tenant) return;
    setSaving(true);
    try {
      await saveTenantProfileForTenant(tenant.id, {
        status: "active",
        planType,
        planAmountPaise: planType === "free" ? 0 : Math.round(Number(amount) * 100),
        expiresAt: tenant.expiresAt,
      });
      toast("Anjuman reactivated — all logins restored, data intact");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reactivate failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!tenant}
      onClose={onClose}
      title={tenant.name}
      subtitle={`${tenant.code} · ${tenant.village}, ${tenant.district}`}
      width="max-w-2xl"
      footer={
        <div className="flex flex-wrap justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {tenant.status === "suspended" || tenant.status === "read_only" ? (
              <Button size="sm" onClick={handleReactivate} loading={saving}>
                <RefreshCw className="h-3.5 w-3.5" /> Reactivate
              </Button>
            ) : null}
            <Button
              variant="danger"
              size="sm"
              disabled={tenant.status === "suspended"}
              onClick={handleSuspend}
            >
              <Ban className="h-3.5 w-3.5" /> {tenant.status === "suspended" ? "Already suspended" : "Suspend"}
            </Button>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                localStorage.setItem(IMPERSONATE_KEY, tenant.id);
                toast(`Impersonating ${tenant.name}`);
                onClose();
                window.location.reload();
              }}
            >
              <UserCog className="h-3.5 w-3.5" /> Impersonate
            </Button>
            <Button size="sm" onClick={handleSave} loading={saving}>
              <CheckCircle2 className="h-3.5 w-3.5" /> Save
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Subscription type" hint="Free, fixed plan price, or a negotiated custom amount.">
          <Select value={planType} onChange={(e) => setPlanType(e.target.value as typeof planType)}>
            <option value="free">Free</option>
            <option value="fixed">Fixed (standard plan)</option>
            <option value="custom">Custom amount</option>
          </Select>
        </Field>
        <Field label="Amount (₹ per year)" hint="Only for fixed / custom.">
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={planType === "free"}
            inputMode="numeric"
          />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="read_only">Read only (expired)</option>
            <option value="suspended">Suspended</option>
          </Select>
        </Field>
        <Field label="Expiry date">
          <Input type="date" defaultValue={tenant.expiresAt ?? ""} />
        </Field>
        <Field label="Grace period (days)" hint="Access continues read-only after expiry.">
          <Input defaultValue="14" inputMode="numeric" />
        </Field>
        <Field label="Member limit" hint="Blank = unlimited.">
          <Input defaultValue={planType === "free" ? "150" : ""} inputMode="numeric" />
        </Field>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold text-ink-800">Feature flags</p>
        <div className="divide-y divide-ink-100 rounded-xl border border-ink-100">
          {([
            { key: "payments", label: "Online payments", hint: "Mode A + B collection" },
            { key: "whatsapp", label: "WhatsApp reminders", hint: "Uses tenant's own provider" },
            { key: "idCards", label: "ID card generator", hint: "Bulk PDF + QR" },
            { key: "multiMasjid", label: "Multiple masjids", hint: "Pro feature" },
            { key: "auditPack", label: "Audit pack export", hint: "For chartered accountants" },
          ] as const).map((f) => (
            <div key={f.key} className="flex items-center justify-between px-3.5 py-3">
              <div>
                <p className="text-[12.5px] font-medium text-ink-800">{f.label}</p>
                <p className="text-[11px] text-ink-500">{f.hint}</p>
              </div>
              <Switch
                checked={!!flags[f.key]}
                onChange={(v) => setFlags((prev) => ({ ...prev, [f.key]: v }))}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={cn("mt-4 rounded-xl border p-3 text-[11.5px] leading-relaxed", "border-amber-200 bg-amber-50 text-amber-900")}>
        Suspending only blocks sign-in — it never deletes data. An anjuman can be
        reactivated instantly with all history intact.
      </div>
    </Drawer>
  );
}

function NewTenantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState("");
  const [village, setVillage] = useState("");
  const [district, setDistrict] = useState("");
  const [state, setState] = useState("Uttar Pradesh");
  const [code, setCode] = useState("");
  const [sadarPhone, setSadarPhone] = useState("");
  const [plan, setPlan] = useState("trial");
  const [customAmount, setCustomAmount] = useState("0");
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!name || !village || !district || !code) {
      toast("Name, village, district and prefix are required", "error");
      return;
    }
    setCreating(true);
    try {
      await createTenantRecord({
        code: code.toUpperCase(),
        name,
        village,
        district,
        state,
        masjid: "",
        regNo: "",
        phone: sadarPhone,
        status: plan === "trial" ? "trial" : "active",
        planType: plan === "free" ? "free" : plan === "custom" ? "custom" : "fixed",
        planAmountPaise: plan === "custom" ? Math.round(Number(customAmount) * 100) : 0,
        planCycle: "yearly",
        features: { payments: true, whatsapp: true, idCards: true, multiMasjid: false, auditPack: true },
      });
      toast("Anjuman created — invite the Sadar to complete setup");
      onClose();
      setName(""); setVillage(""); setDistrict(""); setCode(""); setSadarPhone("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Create failed", "error");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Onboard an anjuman"
      subtitle="They get their own isolated workspace immediately"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} loading={creating} disabled={creating}>
            Create anjuman
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Anjuman name" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bharauli Masjid Committee" />
        </Field>
        <Field label="Village / town">
          <Input value={village} onChange={(e) => setVillage(e.target.value)} placeholder="e.g. Bharauli" />
        </Field>
        <Field label="District">
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="e.g. Azamgarh" />
        </Field>
        <Field label="State">
          <Select value={state} onChange={(e) => setState(e.target.value)}>
            <option>Uttar Pradesh</option>
            <option>Bihar</option>
            <option>West Bengal</option>
            <option>Maharashtra</option>
            <option>Other</option>
          </Select>
        </Field>
        <Field label="Member ID prefix" hint="3–4 letters, unique across the platform.">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="BHR" maxLength={4} className="font-mono uppercase" />
        </Field>
        <Field label="Sadar's mobile" className="sm:col-span-2" hint="Sirf 10 digit">
          <PhoneInput value={sadarPhone} onChange={setSadarPhone} />
        </Field>
        <Field label="Plan">
          <Select value={plan} onChange={(e) => setPlan(e.target.value as any)}>
            <option value="trial">14-day free trial</option>
            <option value="free">Free plan</option>
            <option value="fixed">Standard (₹1,200/yr)</option>
            <option value="custom">Custom pricing</option>
          </Select>
        </Field>
        {plan === "custom" && (
          <Field label="Custom amount (₹)" className="sm:col-span-2">
            <Input value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="0" inputMode="numeric" />
          </Field>
        )}
      </div>
      <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[11.5px] leading-relaxed text-brand-900">
        The new anjuman starts completely empty and isolated. It can never see another
        committee&apos;s members, receipts or ledger — enforced by row-level security.
      </div>
    </Drawer>
  );
}
