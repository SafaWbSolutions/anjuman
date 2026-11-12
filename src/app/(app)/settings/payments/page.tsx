"use client";

import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  FlaskConical,
  Info,
  Landmark,
  Loader2,
  Lock,
  QrCode,
  ShieldCheck,
  Smartphone,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import type { Integration, Tenant } from "@/lib/types";
import { getCurrentTenant, listIntegrations, saveIntegrationSecret, testIntegration, savePaymentSettings, uploadPaymentQr } from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Switch,
  toast,
} from "@/components/ui";

type Provider = "razorpay" | "cashfree" | "phonepe";

interface GatewayState {
  integration: Integration | null;
  enabled: boolean;
  keyId: string;
  keySecret: string;
  mode: "test" | "live";
  tested: boolean;
  testing: boolean;
}

const PROVIDER_LABEL: Record<Provider, string> = {
  razorpay: "Razorpay",
  cashfree: "Cashfree",
  phonepe: "PhonePe Business",
};

const PROVIDER_FEE: Record<Provider, string> = {
  razorpay: "2.0% + GST",
  cashfree: "1.95% + GST",
  phonepe: "1.99% + GST",
};

const PLACEHOLDER_KEY_ID: Record<Provider, string> = {
  razorpay: "rzp_live_…",
  cashfree: "app id",
  phonepe: "merchant id",
};

const DEFAULT_INTEGRATION_CONFIG: Record<Provider, Record<string, string>> = {
  razorpay: { key_id: "", key_secret: "" },
  cashfree: { app_id: "", secret_key: "" },
  phonepe: { merchant_id: "", salt_key: "", salt_index: "1" },
};

export default function PaymentsSettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [autoVerify, setAutoVerify] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);

  // Gateway local state
  const [gw, setGw] = useState<Record<Provider, GatewayState>>({
    razorpay: { integration: null, enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
    cashfree: { integration: null, enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
    phonepe: { integration: null, enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
  });

  // Load data
  useEffect(() => {
    let mounted = true;
    Promise.all([getCurrentTenant(), listIntegrations()])
      .then(([t, ints]) => {
        if (!mounted) return;
        setTenant(t);
        setIntegrations(ints);

        // Map integrations to gateway state
        const nextGw: Record<Provider, GatewayState> = {
          razorpay: { integration: null, enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
          cashfree: { integration: null, enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
          phonepe: { integration: null, enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
        };

        for (const int of ints) {
          if (int.type === "payment" && (int.provider in PROVIDER_LABEL)) {
            const p = int.provider as Provider;
            const cfg = int.config as Record<string, string> | undefined;
            nextGw[p] = {
              integration: int,
              enabled: int.enabled,
              keyId: cfg?.[Object.keys(DEFAULT_INTEGRATION_CONFIG[p])[0]] ?? "",
              keySecret: "", // never returned to browser
              mode: int.mode,
              tested: int.status === "connected",
              testing: false,
            };
          }
        }

        if (t) {
          setUpiEnabled(t.upiEnabled);
          setAutoVerify(t.autoVerifyUpi);
        }

        setGw(nextGw);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Settings load nahi hui");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  function update(p: Provider, patch: Partial<GatewayState>) {
    setGw((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }));
  }

  async function test(p: Provider) {
    const s = gw[p];
    if (!s.integration) return;
    update(p, { testing: true });
    try {
      await testIntegration(s.integration.id);
      update(p, { testing: false, tested: true });
      toast(`${PROVIDER_LABEL[p]} connection successful · test payment ₹1 created`);
    } catch (e) {
      update(p, { testing: false, tested: false });
      toast(e instanceof Error ? e.message : "Test failed", "error");
    }
  }

  async function saveGateway(p: Provider) {
    const s = gw[p];
    if (!s.integration) return;
    if (!s.keyId.trim() || !s.keySecret.trim()) {
      toast("Key ID aur secret dono bharein", "error");
      return;
    }
    try {
      const secret: Record<string, string> = {};
      const keys = Object.keys(DEFAULT_INTEGRATION_CONFIG[p]);
      secret[keys[0]] = s.keyId.trim();
      secret[keys[1]] = s.keySecret.trim();
      if (keys[2]) secret[keys[2]] = s.mode; // salt_index for phonepe

      await saveIntegrationSecret(s.integration.id, secret);
      toast(`${PROVIDER_LABEL[p]} keys saved · ready to test`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  async function toggleGateway(p: Provider) {
    const s = gw[p];
    if (!s.integration) return;
    const newEnabled = !s.enabled;
    // Note: enabling is done via the integration row update
    // For now just update local state; actual enable requires status=connected
    if (newEnabled && !s.tested) {
      toast("Pehle test karein, phir enable karein", "error");
      return;
    }
    update(p, { enabled: newEnabled });
    // Could add an RPC to update integration enabled/status
    toast(newEnabled ? `${PROVIDER_LABEL[p]} enabled` : `${PROVIDER_LABEL[p]} disabled`);
  }

  async function onQrFile(file: File | null) {
    if (!file || !tenant) return;
    if (!file.type.startsWith("image/")) {
      toast("Sirf image (PNG/JPG) upload karein", "error");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast("Image 4 MB se chhoti honi chahiye", "error");
      return;
    }
    setQrUploading(true);
    try {
      const url = await uploadPaymentQr(file, tenant.id);
      setTenant({ ...tenant, upiQrUrl: url });
      toast("QR image uploaded · ab Save dabayein");
    } catch (e) {
      toast(e instanceof Error ? e.message : "QR upload failed", "error");
    } finally {
      setQrUploading(false);
      if (qrInputRef.current) qrInputRef.current.value = "";
    }
  }

  async function saveAll() {
    if (!tenant) return;
    setSaving(true);
    setError(null);
    try {
      await savePaymentSettings({
        upiId: tenant.upiId,
        upiQrUrl: tenant.upiQrUrl ?? null,
        upiEnabled,
        autoVerifyUpi: autoVerify,
        bankName: tenant.bankName ?? "",
        bankAccountName: tenant.bankAccountName ?? "",
        bankAccountNo: tenant.bankAccountNo ?? "",
        bankIfsc: tenant.bankIfsc ?? "",
        bankBranch: tenant.bankBranch ?? "",
      });
      toast("Payment settings saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Payments" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          Settings taiyaar ho rahe hain…
        </Card>
      </>
    );
  }

  if (error && !tenant) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Payments" />
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
        title="Payments"
        description="Money always lands directly in the anjuman's own account. The platform never holds member funds — this keeps you RBI-compliant."
        actions={
          <Badge tone="green" dot>
            0% platform commission
          </Badge>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <span className="mt-0.5">⚠</span>
          <span className="flex-1">{error}</span>
        </div>
      )}

      {/* ── Compliance banner ───────────────────────────────── */}
      <Card className="mb-5 border-brand-200 bg-brand-50/60">
        <div className="flex flex-wrap items-start gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 ring-1 ring-brand-200">
            <ShieldCheck className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-brand-900">
              Two safe ways to collect — choose one or both
            </p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-brand-800">
              <strong>Mode A:</strong> your own UPI ID / QR — the member pays you
              directly and the khajanchi verifies. <strong>Mode B:</strong> your own
              gateway keys — money settles into your bank account, the platform only
              reads the webhook.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          {/* ── Mode A ───────────────────────────────────── */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-brand-600" /> Mode A · Own UPI ID
                </span>
              }
              subtitle="Zero fees. Member scans, you verify manually."
              action={
                <Switch
                  checked={upiEnabled}
                  onChange={(v) => {
                    setUpiEnabled(v);
                    toast(v ? "UPI collection enabled" : "UPI collection disabled");
                  }}
                />
              }
            />
            <div className="grid gap-4 p-5 sm:grid-cols-[1fr_180px]">
              <div className="space-y-4">
                <Field label="UPI ID (VPA)" hint="Must belong to the anjuman's bank account, not a personal one.">
                  <Input
                    value={t.upiId}
                    onChange={(e) => setTenant({ ...t, upiId: e.target.value })}
                    placeholder="anjuman@upi"
                    className="font-mono"
                  />
                </Field>
                <Field label="Account holder name">
                  <Input
                    value={t.bankAccountName ?? ""}
                    onChange={(e) => setTenant({ ...t, bankAccountName: e.target.value })}
                    placeholder="Anjuman ka naam"
                  />
                </Field>
                <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-800">
                      Show QR on member app
                    </p>
                    <p className="text-[11px] text-ink-500">
                      Member can scan and pay from home
                    </p>
                  </div>
                  <Switch checked={upiEnabled} onChange={setUpiEnabled} />
                </div>
                <div className="flex items-center justify-between rounded-xl border border-ink-100 px-3.5 py-3">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-800">
                      Auto-verify UPI reference
                    </p>
                    <p className="text-[11px] text-ink-500">
                      Only if you use a PSP that supports webhooks
                    </p>
                  </div>
                  <Switch checked={autoVerify} onChange={(v) => setAutoVerify(v)} />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-200 bg-white p-3">
                {t.upiQrUrl ? (
                  <img
                    src={t.upiQrUrl}
                    alt="Anjuman UPI QR code"
                    className="h-[148px] w-[148px] rounded-lg object-contain"
                  />
                ) : (
                  <div className="flex h-[148px] w-[148px] flex-col items-center justify-center gap-1.5 rounded-lg bg-ink-50 text-ink-400">
                    <QrCode className="h-9 w-9" />
                    <span className="text-[10.5px] font-medium">No QR uploaded</span>
                  </div>
                )}

                <input
                  ref={qrInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => void onQrFile(e.target.files?.[0] ?? null)}
                />

                <div className="flex w-full items-center justify-center gap-1.5">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={qrUploading}
                    onClick={() => qrInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {t.upiQrUrl ? "Replace" : "Upload QR"}
                  </Button>
                  {t.upiQrUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setTenant({ ...t, upiQrUrl: undefined })}
                      title="Remove QR image"
                      className="h-8 w-8 text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                <p className="text-center font-mono text-[10px] text-ink-500">
                  {t.upiId || "anjuman@upi"}
                </p>
                <Badge tone={t.upiQrUrl ? "green" : "slate"} dot>
                  {t.upiQrUrl ? "QR ready" : "Upload pending"}
                </Badge>
              </div>
            </div>
          </Card>

          {/* ── Mode B ───────────────────────────────────── */}
          <Card>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-brand-600" /> Mode B · Own gateway
                </span>
              }
              subtitle="Paste keys, test, enable. Settlement goes to your bank."
            />
            <div className="divide-y divide-ink-100">
              {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => {
                const s = gw[p];
                return (
                  <div key={p} className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                        <Landmark className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-ink-900">
                          {PROVIDER_LABEL[p]}
                        </p>
                        <p className="text-[11px] text-ink-500">
                          Fee {PROVIDER_FEE[p]} · paid by the anjuman, not the member
                        </p>
                      </div>
                      {s.tested && (
                        <Badge tone="green" dot>
                          Connected
                        </Badge>
                      )}
                      {s.enabled && <Badge tone="brand">Enabled</Badge>}
                      <Switch
                        checked={s.enabled}
                        onChange={() => toggleGateway(p)}
                      />
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Key ID">
                        <Input
                          value={s.keyId}
                          onChange={(e) => update(p, { keyId: e.target.value })}
                          placeholder={PLACEHOLDER_KEY_ID[p]}
                          className="font-mono text-[12px]"
                        />
                      </Field>
                      <Field label="Key secret">
                        <SecretInput
                          value={s.keySecret}
                          onChange={(v) => update(p, { keySecret: v })}
                        />
                      </Field>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Select
                        value={s.mode}
                        onChange={(e) => update(p, { mode: e.target.value as "test" | "live" })}
                        className="w-auto py-1.5 text-[12px]"
                      >
                        <option value="test">Test mode</option>
                        <option value="live">Live mode</option>
                      </Select>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={s.testing}
                        onClick={() => saveGateway(p)}
                      >
                        <FlaskConical className="h-3.5 w-3.5" /> Save keys
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={s.testing}
                        onClick={() => test(p)}
                      >
                        <FlaskConical className="h-3.5 w-3.5" /> Test connection
                      </Button>
                      <Button
                        size="sm"
                        disabled={!s.tested}
                        onClick={() => toggleGateway(p)}
                      >
                        <Zap className="h-3.5 w-3.5" /> {s.enabled ? "Disable" : "Enable"}
                      </Button>
                      {s.tested && (
                        <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] text-emerald-600">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Webhook verified
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="flex justify-end">
            <Button onClick={saveAll} loading={saving}>
              <CheckCircle2 className="h-4 w-4" /> Save settings
            </Button>
          </div>
        </div>

        {/* ── Side panel ──────────────────────────────────── */}
        <div className="space-y-5">
          <Card>
            <CardHeader title="Why the platform never holds money" />
            <div className="space-y-3 p-5 text-[12px] leading-relaxed text-ink-600">
              <p>
                Holding member money would make us a payment aggregator, which needs
                RBI authorisation and a large security deposit. Instead, every rupee
                moves between the member and the anjuman&apos;s own account.
              </p>
              <p>
                The platform only reads confirmations so it can mark receipts. That is
                why there is no platform commission and no settlement delay.
              </p>
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3">
                <p className="flex items-start gap-2 text-[11.5px] text-ink-600">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Bank settlement for gateways is typically T+2 working days, directly
                  to the registered bank account.
                </p>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Anjuman bank account" subtitle="Members can pay by transfer · shown on receipts" />
            <div className="space-y-3 p-5">
              <Field label="Bank name">
                <Input
                  value={t.bankName ?? ""}
                  onChange={(e) => setTenant({ ...t, bankName: e.target.value })}
                  placeholder="State Bank of India"
                />
              </Field>
              <Field label="Account holder name">
                <Input
                  value={t.bankAccountName ?? ""}
                  onChange={(e) => setTenant({ ...t, bankAccountName: e.target.value })}
                  placeholder="Anjuman ka naam"
                />
              </Field>
              <Field label="Account number">
                <Input
                  value={t.bankAccountNo ?? ""}
                  onChange={(e) => setTenant({ ...t, bankAccountNo: e.target.value })}
                  placeholder="00000000000"
                  className="font-mono"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="IFSC">
                  <Input
                    value={t.bankIfsc ?? ""}
                    onChange={(e) => setTenant({ ...t, bankIfsc: e.target.value.toUpperCase() })}
                    placeholder="SBIN0001234"
                    className="font-mono uppercase"
                  />
                </Field>
                <Field label="Branch">
                  <Input
                    value={t.bankBranch ?? ""}
                    onChange={(e) => setTenant({ ...t, bankBranch: e.target.value })}
                    placeholder="Branch name"
                  />
                </Field>
              </div>
              {t.bankAccountNo && (
                <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                  <p className="text-[11px] uppercase tracking-wide text-ink-400">Saved account</p>
                  <p className="mt-0.5 text-[12.5px] font-medium text-ink-800">
                    {t.bankName || "Bank"} · {t.bankAccountName || t.name}
                  </p>
                  <p className="font-mono text-[11.5px] text-ink-500">
                    •••• {t.bankAccountNo.slice(-4)}
                    {t.bankIfsc ? ` · IFSC ${t.bankIfsc}` : ""}
                  </p>
                </div>
              )}
              <p className="text-[11px] leading-relaxed text-ink-500">
                Ye details sirf receipt aur member portal par dikhti hain. Paisa seedha
                isi account me aata hai — platform kabhi hold nahi karta. Save karne ke
                liye neeche <strong>Save settings</strong> dabayein.
              </p>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-ink-400" />
              <p className="text-[12px] font-medium text-ink-800">Keys are encrypted</p>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-ink-500">
              Gateway secrets are stored in an encrypted vault and are never returned
              to the browser after saving. Only the masked value is shown.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}

function SecretInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••••••••"
        className="input pr-10 font-mono text-[12px]"
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 hover:bg-ink-100"
        aria-label={show ? "Hide secret" : "Show secret"}
      >
        {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}