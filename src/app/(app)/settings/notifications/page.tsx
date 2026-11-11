"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CheckCircle2,
  FlaskConical,
  Mail,
  MessageCircle,
  MessageSquare,
  Save,
  Smartphone,
} from "lucide-react";
import type { Integration, Tenant } from "@/lib/types";
import type { TenantSettings } from "@/lib/repo";
import {
  getCurrentTenant,
  listIntegrations,
  saveIntegrationSecret,
  testIntegration,
  saveTenantSettings,
} from "@/lib/repo";
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

type ChannelType = "whatsapp" | "sms" | "email" | "push";

interface ChannelState {
  integration: Integration | null;
  enabled: boolean;
  tested: boolean;
  testing: boolean;
  fields: Record<string, string>;
}

const CHANNEL_CONFIG: Record<ChannelType, {
  icon: typeof MessageCircle;
  name: string;
  provider: string;
  cost: string;
  fields: { label: string; key: string; placeholder: string; secret?: boolean }[];
}> = {
  whatsapp: {
    icon: MessageCircle,
    name: "WhatsApp Business API",
    provider: "Meta Cloud API / Gupshup / Interakt",
    cost: "≈ ₹0.115 per utility message",
    fields: [
      { label: "Phone number ID", key: "phone_number_id", placeholder: "1098…" },
      { label: "Access token", key: "access_token", placeholder: "EAAG…", secret: true },
      { label: "Template namespace", key: "template_namespace", placeholder: "anjuman_reminder" },
    ],
  },
  sms: {
    icon: Smartphone,
    name: "SMS (DLT registered)",
    provider: "MSG91 / Fast2SMS / Textlocal",
    cost: "≈ ₹0.15 per SMS",
    fields: [
      { label: "Sender ID (6 chars)", key: "sender_id", placeholder: "ANJUMN" },
      { label: "API key", key: "api_key", placeholder: "…", secret: true },
      { label: "DLT template ID", key: "dlt_template_id", placeholder: "1107…" },
    ],
  },
  email: {
    icon: Mail,
    name: "Email",
    provider: "Resend (free tier: 3,000/month)",
    cost: "Free up to 3,000 emails",
    fields: [
      { label: "From address", key: "from_address", placeholder: "office@yourmasjid.in" },
      { label: "API key", key: "api_key", placeholder: "re_…", secret: true },
    ],
  },
  push: {
    icon: Bell,
    name: "App push (FCM)",
    provider: "Firebase Cloud Messaging · free, unlimited",
    cost: "Free",
    fields: [
      { label: "Service account JSON", key: "service_account", placeholder: "Paste JSON", secret: true },
    ],
  },
};

const EVENTS = [
  { id: "invoice", label: "Monthly invoice generated", channels: ["app", "whatsapp"], defaultOn: true },
  { id: "reminder", label: "Dues reminder (3rd, 7th, 10th)", channels: ["app", "whatsapp", "sms"], defaultOn: true },
  { id: "receipt", label: "Payment receipt issued", channels: ["app", "whatsapp"], defaultOn: true },
  { id: "overdue", label: "Overdue escalation to sadar", channels: ["app", "email"], defaultOn: true },
  { id: "notice", label: "New notice published", channels: ["app", "whatsapp"], defaultOn: true },
  { id: "complaint", label: "Complaint status changed", channels: ["app"], defaultOn: true },
  { id: "approval", label: "Approval pending > 24h", channels: ["app", "email"], defaultOn: true },
  { id: "namaz", label: "Namaz time reminders", channels: ["app"], defaultOn: false },
] as const;

type EventId = typeof EVENTS[number]["id"];

export default function NotificationsSettingsPage() {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Channel states
  const [channels, setChannels] = useState<Record<ChannelType, ChannelState>>({
    whatsapp: { integration: null, enabled: false, tested: false, testing: false, fields: {} },
    sms: { integration: null, enabled: false, tested: false, testing: false, fields: {} },
    email: { integration: null, enabled: false, tested: false, testing: false, fields: {} },
    push: { integration: null, enabled: true, tested: true, testing: false, fields: {} },
  });

  // Event toggles
  const [eventToggles, setEventToggles] = useState<Record<EventId, boolean>>(
    Object.fromEntries(EVENTS.map((e) => [e.id, e.defaultOn])) as Record<EventId, boolean>
  );

  // Load data
  useEffect(() => {
    let mounted = true;
    Promise.all([getCurrentTenant(), listIntegrations()])
      .then(([t, ints]) => {
        if (!mounted) return;
        setTenant(t);
        setIntegrations(ints);

        // Map integrations to channel states
        const nextChannels: Record<ChannelType, ChannelState> = {
          whatsapp: { integration: null, enabled: false, tested: false, testing: false, fields: {} },
          sms: { integration: null, enabled: false, tested: false, testing: false, fields: {} },
          email: { integration: null, enabled: false, tested: false, testing: false, fields: {} },
          push: { integration: null, enabled: true, tested: true, testing: false, fields: {} },
        };

        for (const int of ints) {
          if (int.type in CHANNEL_CONFIG) {
            const ct = int.type as ChannelType;
            const cfg = int.config as Record<string, string> | undefined;
            nextChannels[ct] = {
              integration: int,
              enabled: int.enabled,
              tested: int.status === "connected",
              testing: false,
              fields: cfg ?? {},
            };
          }
        }

        setChannels(nextChannels);
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

  function updateChannel(ct: ChannelType, patch: Partial<ChannelState>) {
    setChannels((prev) => ({ ...prev, [ct]: { ...prev[ct], ...patch } }));
  }

  function updateField(ct: ChannelType, key: string, value: string) {
    setChannels((prev) => ({
      ...prev,
      [ct]: { ...prev[ct], fields: { ...prev[ct].fields, [key]: value } },
    }));
  }

  async function saveChannelKeys(ct: ChannelType) {
    const s = channels[ct];
    if (!s.integration) return;

    // Check all required fields are filled
    const required = CHANNEL_CONFIG[ct].fields.map((f) => f.key);
    for (const k of required) {
      if (!s.fields[k]?.trim()) {
        toast(`${CHANNEL_CONFIG[ct].fields.find((f) => f.key === k)?.label} bharein`, "error");
        return;
      }
    }

    try {
      await saveIntegrationSecret(s.integration.id, s.fields);
      updateChannel(ct, { tested: false }); // will be true after test
      toast(`${CHANNEL_CONFIG[ct].name} keys saved`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    }
  }

  async function testChannel(ct: ChannelType) {
    const s = channels[ct];
    if (!s.integration) return;
    updateChannel(ct, { testing: true });
    try {
      await testIntegration(s.integration.id);
      updateChannel(ct, { testing: false, tested: true });
      toast(`${CHANNEL_CONFIG[ct].name} test message sent`);
    } catch (e) {
      updateChannel(ct, { testing: false, tested: false });
      toast(e instanceof Error ? e.message : "Test failed", "error");
    }
  }

  async function saveAll() {
    setSaving(true);
    setError(null);
    try {
      // Save tenant settings (reminder days, etc.)
      if (settings) {
        await saveTenantSettings({
          reminderDays: settings.reminderDays,
          autoSendReminders: settings.autoSendReminders,
          // Event toggles could be stored in a separate table
        });
      }
      toast("Notification settings saved");
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
        <PageHeader eyebrow="Settings" title="Notifications" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          Settings taiyaar ho rahe hain…
        </Card>
      </>
    );
  }

  if (error && !tenant) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Notifications" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Notifications"
        description="Connect your own WhatsApp, SMS, email and push providers. Members hear from the anjuman, not from a random number."
        actions={
          <Button onClick={saveAll} loading={saving}>
            <Save className="h-4 w-4" /> Save
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
            <CardHeader
              title="Channels"
              subtitle="Paste keys → test → enable. Same pattern for every provider."
            />
            <div className="divide-y divide-ink-100">
              {(["whatsapp", "sms", "email", "push"] as ChannelType[]).map((ct) => {
                const config = CHANNEL_CONFIG[ct];
                const s = channels[ct];
                return (
                  <ChannelBlock
                    key={ct}
                    config={config}
                    state={s}
                    onUpdateField={(key, value) => updateField(ct, key, value)}
                    onSave={() => saveChannelKeys(ct)}
                    onTest={() => testChannel(ct)}
                    onToggle={(v) => updateChannel(ct, { enabled: v })}
                  />
                );
              })}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="When to notify"
              subtitle="Turn off anything that feels noisy — less is more."
            />
            <div className="divide-y divide-ink-100">
              {EVENTS.map((e) => (
                <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-medium text-ink-800">{e.label}</p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {e.channels.map((c) => (
                        <span
                          key={c}
                          className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-500"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Switch
                    checked={eventToggles[e.id]}
                    onChange={(v) =>
                      setEventToggles((prev) => ({ ...prev, [e.id]: v }))
                    }
                  />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Message templates" subtitle="Rendered with real member data" />
            <div className="space-y-3 p-5">
              {[
                {
                  name: "Dues reminder",
                  body: "Assalamu alaykum {name}, your {month} chanda of ₹{amount} is pending. Pay via UPI: {upi}. — {anjuman}",
                },
                {
                  name: "Receipt",
                  body: "{name}, we received ₹{amount} for {month}. Receipt {receipt}. Jazak Allah khair.",
                },
                {
                  name: "Overdue notice",
                  body: "{name}, your {month} chanda of ₹{amount} is overdue. Please contact the committee. — {anjuman}",
                },
              ].map((t) => (
                <div key={t.name} className="rounded-xl border border-ink-100 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-ink-800">{t.name}</p>
                    <button
                      className="text-[11px] font-medium text-brand-700"
                      onClick={() => toast("Template editor opened")}
                    >
                      Edit
                    </button>
                  </div>
                  <p className="mt-1.5 rounded-lg bg-ink-50 p-2 text-[11px] leading-relaxed text-ink-600">
                    {t.body}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Monthly usage" subtitle="Current month" />
            <div className="space-y-3 p-5 text-[12px]">
              <div className="text-center text-ink-500">
                Usage stats appear here after real messages are sent via the queue.
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Members can opt out of WhatsApp/SMS from their app. Opt-outs are
                respected across every template automatically.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function ChannelBlock({
  config,
  state,
  onUpdateField,
  onSave,
  onTest,
  onToggle,
}: {
  config: (typeof CHANNEL_CONFIG)[ChannelType];
  state: ChannelState;
  onUpdateField: (key: string, value: string) => void;
  onSave: () => void;
  onTest: () => void;
  onToggle: (v: boolean) => void;
}) {
  const { icon: Icon, name, provider, cost, fields } = config;
  const { integration, enabled, tested, testing, fields: fieldValues } = state;

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink-100 text-ink-600">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[13px] font-semibold text-ink-900">{name}</p>
            {tested && (
              <Badge tone="green" dot>
                Connected
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-ink-500">
            {provider} · {cost}
          </p>
        </div>
        <Switch checked={enabled} onChange={onToggle} />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {fields.map((f) => (
          <Field key={f.key} label={f.label}>
            <Input
              type={f.secret ? "password" : "text"}
              placeholder={f.placeholder}
              value={fieldValues[f.key] ?? ""}
              onChange={(e) => onUpdateField(f.key, e.target.value)}
              className={cn("text-[12px]", f.secret && "font-mono")}
            />
          </Field>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          loading={testing}
          onClick={onSave}
        >
          <FlaskConical className="h-3.5 w-3.5" /> Save keys
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={testing}
          onClick={onTest}
        >
          <FlaskConical className="h-3.5 w-3.5" /> Test
        </Button>
        <Button variant="ghost" size="sm" onClick={() => toast("Template preview opened")}>
          <MessageSquare className="h-3.5 w-3.5" /> Preview template
        </Button>
        <Select className="ml-auto w-auto py-1.5 text-[11.5px]">
          <option>Utility messages</option>
          <option>Marketing messages</option>
        </Select>
      </div>
    </div>
  );
}