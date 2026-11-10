"use client";

import { useState } from "react";
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
  Zap,
} from "lucide-react";
import { activeTenant } from "@/lib/mock";
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
import { cn } from "@/lib/utils";

type Provider = "razorpay" | "cashfree" | "phonepe";

interface GatewayState {
  enabled: boolean;
  keyId: string;
  keySecret: string;
  mode: "test" | "live";
  tested: boolean;
  testing: boolean;
}

const INITIAL: Record<Provider, GatewayState> = {
  razorpay: { enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
  cashfree: { enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
  phonepe: { enabled: false, keyId: "", keySecret: "", mode: "test", tested: false, testing: false },
};

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

export default function PaymentsSettingsPage() {
  const [upiEnabled, setUpiEnabled] = useState(true);
  const [upiId, setUpiId] = useState(activeTenant.upiId);
  const [autoVerify, setAutoVerify] = useState(false);
  const [gw, setGw] = useState(INITIAL);

  function update(p: Provider, patch: Partial<GatewayState>) {
    setGw((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }));
  }

  function test(p: Provider) {
    update(p, { testing: true });
    setTimeout(() => {
      update(p, { testing: false, tested: true });
      toast(`${PROVIDER_LABEL[p]} connection successful · test payment ₹1 created`);
    }, 1200);
  }

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
                    value={upiId}
                    onChange={(e) => setUpiId(e.target.value)}
                    placeholder="anjuman@upi"
                    className="font-mono"
                  />
                </Field>
                <Field label="Account holder name">
                  <Input defaultValue={activeTenant.name} />
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
                  <Switch checked={autoVerify} onChange={setAutoVerify} />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center rounded-xl border border-ink-100 bg-white p-3">
                <div className="grid h-[132px] w-[132px] grid-cols-7 grid-rows-7 gap-[2px]">
                  {Array.from({ length: 49 }).map((_, i) => {
                    const on = (i * 7 + 3) % 5 < 2 || i % 11 === 0 || i < 7;
                    return (
                      <span
                        key={i}
                        className={cn("rounded-[1px]", on ? "bg-ink-900" : "bg-transparent")}
                      />
                    );
                  })}
                </div>
                <p className="mt-2 text-center font-mono text-[10px] text-ink-500">
                  {upiId || "anjuman@upi"}
                </p>
                <Badge tone="green" className="mt-1">
                  Live QR
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
                        onChange={(v) => update(p, { enabled: v })}
                      />
                    </div>

                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Key ID">
                        <Input
                          value={s.keyId}
                          onChange={(e) => update(p, { keyId: e.target.value })}
                          placeholder={p === "cashfree" ? "app id" : "rzp_live_…"}
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
                        onClick={() => test(p)}
                      >
                        <FlaskConical className="h-3.5 w-3.5" /> Test connection
                      </Button>
                      <Button
                        size="sm"
                        disabled={!s.tested}
                        onClick={() => {
                          update(p, { enabled: true });
                          toast(`${PROVIDER_LABEL[p]} enabled for live collection`);
                        }}
                      >
                        <Zap className="h-3.5 w-3.5" /> Enable
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
            <Button onClick={() => toast("Payment settings saved")}>
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
            <CardHeader title="Connected account" subtitle="Used for Mode B settlement" />
            <div className="p-5">
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3.5">
                <p className="text-[11px] uppercase tracking-wide text-ink-400">Bank</p>
                <p className="mt-0.5 text-[12.5px] font-medium text-ink-800">
                  State Bank of India
                </p>
                <p className="font-mono text-[11.5px] text-ink-500">
                  •••• •••• 4412 · IFSC SBIN0001234
                </p>
                <Badge tone="green" className="mt-2" dot>
                  Verified
                </Badge>
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-500">
                Changing the bank account requires sadar approval and a 7-day cooling
                period. This is the strongest protection against payment redirection
                fraud.
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
