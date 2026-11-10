"use client";

import { useState } from "react";
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

const EVENTS = [
  { id: "invoice", label: "Monthly invoice generated", channels: ["app", "whatsapp"], on: true },
  { id: "reminder", label: "Dues reminder (3rd, 7th, 10th)", channels: ["app", "whatsapp", "sms"], on: true },
  { id: "receipt", label: "Payment receipt issued", channels: ["app", "whatsapp"], on: true },
  { id: "overdue", label: "Overdue escalation to sadar", channels: ["app", "email"], on: true },
  { id: "notice", label: "New notice published", channels: ["app", "whatsapp"], on: true },
  { id: "complaint", label: "Complaint status changed", channels: ["app"], on: true },
  { id: "approval", label: "Approval pending > 24h", channels: ["app", "email"], on: true },
  { id: "namaz", label: "Namaz time reminders", channels: ["app"], on: false },
];

export default function NotificationsSettingsPage() {
  const [events, setEvents] = useState(EVENTS);
  const [waEnabled, setWaEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(true);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Notifications"
        description="Connect your own WhatsApp, SMS, email and push providers. Members hear from the anjuman, not from a random number."
        actions={
          <Button onClick={() => toast("Notification settings saved")}>
            <Save className="h-4 w-4" /> Save
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader
              title="Channels"
              subtitle="Paste keys → test → enable. Same pattern for every provider."
            />
            <div className="divide-y divide-ink-100">
              {/* WhatsApp */}
              <ChannelBlock
                icon={MessageCircle}
                name="WhatsApp Business API"
                provider="Meta Cloud API / Gupshup / Interakt"
                enabled={waEnabled}
                onToggle={setWaEnabled}
                cost="≈ ₹0.115 per utility message"
                fields={[
                  { label: "Phone number ID", placeholder: "1098…" },
                  { label: "Access token", placeholder: "EAAG…", secret: true },
                  { label: "Template namespace", placeholder: "anjuman_reminder" },
                ]}
              />
              {/* SMS */}
              <ChannelBlock
                icon={Smartphone}
                name="SMS (DLT registered)"
                provider="MSG91 / Fast2SMS / Textlocal"
                enabled={smsEnabled}
                onToggle={setSmsEnabled}
                cost="≈ ₹0.15 per SMS"
                fields={[
                  { label: "Sender ID (6 chars)", placeholder: "ANJUMN" },
                  { label: "API key", placeholder: "…", secret: true },
                  { label: "DLT template ID", placeholder: "1107…" },
                ]}
              />
              {/* Email */}
              <ChannelBlock
                icon={Mail}
                name="Email"
                provider="Resend (free tier: 3,000/month)"
                enabled
                onToggle={() => undefined}
                cost="Free up to 3,000 emails"
                fields={[
                  { label: "From address", placeholder: "office@yourmasjid.in" },
                  { label: "API key", placeholder: "re_…", secret: true },
                ]}
              />
              {/* Push */}
              <div className="flex flex-wrap items-center gap-3 p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Bell className="h-4.5 w-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold text-ink-900">
                    App push (FCM)
                  </p>
                  <p className="text-[11px] text-ink-500">
                    Firebase Cloud Messaging · free, unlimited
                  </p>
                </div>
                <Badge tone="green" dot>
                  Connected
                </Badge>
                <Switch checked onChange={() => undefined} />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="When to notify"
              subtitle="Turn off anything that feels noisy — less is more."
            />
            <div className="divide-y divide-ink-100">
              {events.map((e) => (
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
                    checked={e.on}
                    onChange={(v) =>
                      setEvents((prev) =>
                        prev.map((x) => (x.id === e.id ? { ...x, on: v } : x))
                      )
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
            <CardHeader title="Monthly usage" subtitle="November 2026" />
            <div className="space-y-3 p-5 text-[12px]">
              {[
                { label: "WhatsApp sent", value: "1,284", cost: "₹147.66" },
                { label: "SMS sent", value: "96", cost: "₹14.40" },
                { label: "Emails sent", value: "42", cost: "Free" },
                { label: "Push sent", value: "3,910", cost: "Free" },
              ].map((u) => (
                <div key={u.label} className="flex items-center justify-between">
                  <span className="text-ink-500">{u.label}</span>
                  <span className="text-ink-900">
                    {u.value} · <span className="text-ink-500">{u.cost}</span>
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-ink-100 pt-3">
                <span className="font-medium text-ink-700">Total</span>
                <span className="font-semibold text-ink-900">₹162.06</span>
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
  icon: Icon,
  name,
  provider,
  enabled,
  onToggle,
  cost,
  fields,
}: {
  icon: typeof MessageCircle;
  name: string;
  provider: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  cost: string;
  fields: { label: string; placeholder: string; secret?: boolean }[];
}) {
  const [tested, setTested] = useState(name === "Email");
  const [testing, setTesting] = useState(false);

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
          <Field key={f.label} label={f.label}>
            <Input
              type={f.secret ? "password" : "text"}
              placeholder={f.placeholder}
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
          onClick={() => {
            setTesting(true);
            setTimeout(() => {
              setTesting(false);
              setTested(true);
              toast(`${name} test message sent`);
            }, 900);
          }}
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
