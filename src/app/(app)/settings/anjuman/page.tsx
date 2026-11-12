"use client";

import { useEffect, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  ImagePlus,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
} from "lucide-react";
import type { Tenant } from "@/lib/types";
import { getCurrentTenant, saveTenantProfile, setMemberPrefix } from "@/lib/repo";
import { INDIAN_STATES as STATES } from "@/lib/states";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  PhoneInput,
  Select,
  toast,
} from "@/components/ui";

const THEME_COLORS = ["#059669", "#0ea5e9", "#7c3aed", "#d97706", "#dc2626"] as const;

const VERIFICATION_ITEMS = [
  { label: "Phone verified", key: "phoneVerified" },
  { label: "Registration certificate", key: "regCert" },
  { label: "Bank account verified", key: "bankVerified" },
  { label: "PAN / trust deed", key: "panDeed" },
] as const;

export default function AnjumanProfilePage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customState, setCustomState] = useState("");
  const [verification, setVerification] = useState<Record<string, boolean>>({
    phoneVerified: true,
    regCert: true,
    bankVerified: true,
    panDeed: false,
  });

  // Load tenant
  useEffect(() => {
    let mounted = true;
    getCurrentTenant()
      .then((t) => {
        if (!mounted) return;
        setTenant(t);
        if (t && t.state && !(STATES as readonly string[]).includes(t.state)) {
          setCustomState(t.state);
        }
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Profile load nahi hua");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleSave() {
    if (!tenant) return;
    setSaving(true);
    setError(null);
    try {
      const finalState =
        tenant.state === "Other" ? customState.trim() : tenant.state;

      if (!finalState) {
        throw new Error("State ka naam likho");
      }

      const prefix = await setMemberPrefix(tenant.code);

      await saveTenantProfile({
        name: tenant.name,
        masjid: tenant.masjid,
        village: tenant.village,
        district: tenant.district,
        state: finalState,
        pincode: tenant.pincode,
        phone: tenant.phone,
        email: tenant.email ?? "",
        regNo: tenant.regNo,
        upiId: tenant.upiId,
        address: tenant.address,
        logoUrl: tenant.logoUrl,
        themeColor: tenant.themeColor,
      });

      setTenant({ ...tenant, code: prefix, state: finalState });
      setCustomState(
        (STATES as readonly string[]).includes(finalState) ? "" : finalState
      );
      toast("Profile saved");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Save failed";
      setError(message);
      toast(message, "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Anjuman profile" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          Profile taiyaar ho raha hai…
        </Card>
      </>
    );
  }

  if (error && !tenant) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Anjuman profile" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
        </Card>
      </>
    );
  }

  const t = tenant!;

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Anjuman profile"
        description="This information appears on receipts, ID cards, notices and the member app."
        actions={
          <Button onClick={handleSave} loading={saving}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <span className="mt-0.5">⚠</span>
          <span className="flex-1">{error}</span>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Identity" subtitle="Legal name and registration" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Anjuman / committee name" className="sm:col-span-2">
                <Input value={t.name} onChange={(e) => setTenant({ ...t, name: e.target.value })} />
              </Field>
              <Field label="Masjid name">
                <Input value={t.masjid} onChange={(e) => setTenant({ ...t, masjid: e.target.value })} />
              </Field>
              <Field label="Registration number">
                <Input value={t.regNo} onChange={(e) => setTenant({ ...t, regNo: e.target.value })} />
              </Field>
              <Field label="Village / town">
                <Input value={t.village} onChange={(e) => setTenant({ ...t, village: e.target.value })} />
              </Field>
              <Field label="District">
                <Input value={t.district} onChange={(e) => setTenant({ ...t, district: e.target.value })} />
              </Field>
              <Field label="State">
                <Select
                  value={
                    (STATES as readonly string[]).includes(t.state)
                      ? t.state
                      : "Other"
                  }
                  onChange={(e) => setTenant({ ...t, state: e.target.value })}
                >
                  {STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              {!(STATES as readonly string[]).includes(t.state) ||
              t.state === "Other" ? (
                <Field label="State name (custom)" hint="Apna state / region likho">
                  <Input
                    value={customState}
                    onChange={(e) => setCustomState(e.target.value)}
                    placeholder="e.g. Bihar"
                  />
                </Field>
              ) : null}
              <Field label="PIN code">
                <Input
                  value={t.pincode}
                  onChange={(e) => setTenant({ ...t, pincode: e.target.value })}
                  inputMode="numeric"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contact" subtitle="Shown to members for queries" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Committee phone" hint="Sirf 10 digit">
                <PhoneInput
                  value={t.phone}
                  onChange={(v) => setTenant({ ...t, phone: v })}
                />
              </Field>
              <Field label="WhatsApp number" hint="Sirf 10 digit">
                <PhoneInput
                  value={t.phone}
                  onChange={(v) => setTenant({ ...t, phone: v })}
                  placeholder="Same as committee phone"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={t.email ?? ""}
                  onChange={(e) => setTenant({ ...t, email: e.target.value })}
                />
              </Field>
              <Field label="Website (optional)">
                <Input placeholder="https://…" />
              </Field>
              <Field label="Full address" className="sm:col-span-2">
                <textarea
                  className="input min-h-[80px] resize-y"
                  value={t.address ?? ""}
                  onChange={(e) => setTenant({ ...t, address: e.target.value })}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Branding" subtitle="Used on ID cards and the member app" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="label">Logo</label>
                <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 text-ink-500">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[11.5px]">Upload PNG (min 512×512)</span>
                </div>
              </div>
              <div>
                <label className="label">Masjid photo</label>
                <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 text-ink-500">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[11.5px]">Shown on the home screen</span>
                </div>
              </div>
              <Field
                label="Member ID prefix"
                hint="2–4 letters. Naye members ke ID par lagega; purane ID waise hi rahenge."
              >
                <Input
                  value={t.code}
                  maxLength={4}
                  className="font-mono uppercase"
                  onChange={(e) =>
                    setTenant({
                      ...t,
                      code: e.target.value.toUpperCase().replace(/[^A-Z]/g, ""),
                    })
                  }
                  placeholder="BHR"
                />
              </Field>
              <Field label="Theme colour">
                <div className="flex gap-2">
                  {THEME_COLORS.map((c) => (
                    <button
                      key={c}
                      className={`h-10 w-10 rounded-xl ring-2 ring-white ring-offset-2 ring-offset-ink-100 ${
                        t.themeColor === c ? "ring-brand-600 ring-offset-2" : ""
                      }`}
                      style={{ background: c }}
                      onClick={() => setTenant({ ...t, themeColor: c })}
                      aria-label={`Theme ${c}`}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="bg-ink-900 p-5 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold">
                  {t.code}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{t.name}</p>
                  <p className="text-[11px] text-ink-400">Verified anjuman</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-[11.5px] text-ink-300">
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {t.village}, {t.district}
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {t.phone}
                </p>
                <p className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> Reg {t.regNo}
                </p>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-500">Public link</span>
                <button
                  className="inline-flex items-center gap-1 font-medium text-brand-700"
                  onClick={() => {
                    navigator.clipboard.writeText(`anjuman.app/${t.code.toLowerCase()}`);
                    toast("Link copied");
                  }}
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <p className="mt-1 truncate rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-[11px] text-ink-600">
                anjuman.app/{t.code.toLowerCase()}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Verification" subtitle="Required for the verified badge" />
            <div className="space-y-3 p-5 text-[12px]">
              {VERIFICATION_ITEMS.map((v) => (
                <div key={v.key} className="flex items-center justify-between">
                  <span className="text-ink-600">{v.label}</span>
                  {verification[v.key] ? (
                    <Badge tone="green" dot>Done</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setVerification((prev) => ({ ...prev, [v.key]: true }))}>
                      Upload
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Changes to the name or registration number are logged and require
                platform verification. This prevents impersonation of another
                committee.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}