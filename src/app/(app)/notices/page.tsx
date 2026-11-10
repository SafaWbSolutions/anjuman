"use client";

import { useState } from "react";
import {
  Bell,
  Megaphone,
  Pin,
  Plus,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import { notices } from "@/lib/mock";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  Input,
  PageHeader,
  Select,
  toast,
} from "@/components/ui";
import { formatDate, cn } from "@/lib/utils";

const AUD_LABEL: Record<string, string> = {
  all: "Everyone",
  members: "Members",
  office_bearers: "Office bearers",
};

export default function NoticesPage() {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<"app" | "whatsapp" | "sms" | "all">("all");

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Notices"
        description="Publish to the app, WhatsApp and SMS at once. Pinned notices appear on every member's home screen."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> New notice
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {notices.map((n) => (
            <Card key={n.id} className={cn("p-5", n.pinned && "ring-1 ring-brand-200")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  {n.pinned && (
                    <Badge tone="brand">
                      <Pin className="h-3 w-3" /> Pinned
                    </Badge>
                  )}
                  <Badge tone="slate">{AUD_LABEL[n.audience]}</Badge>
                </div>
                <p className="text-[11.5px] text-ink-400">
                  {formatDate(n.publishedAt, true)}
                </p>
              </div>
              <h3 className="mt-2 text-[15px] font-semibold text-ink-900">{n.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{n.body}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3 text-[11.5px] text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <Send className="h-3 w-3" /> Delivered to 142 members
                </span>
                <span className="inline-flex items-center gap-1">
                  <Smartphone className="h-3 w-3" /> WhatsApp · 138 read
                </span>
                {n.expiresAt && (
                  <span className="ml-auto text-ink-400">
                    Expires {formatDate(n.expiresAt)}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Megaphone className="h-4.5 w-4.5" />
              </span>
              <p className="text-[13px] font-semibold text-ink-900">Reach summary</p>
            </div>
            <div className="mt-4 space-y-3 text-[12.5px]">
              {[
                { label: "App notifications", value: "142 / 148", icon: Bell },
                { label: "WhatsApp opted-in", value: "131 / 148", icon: Smartphone },
                { label: "SMS fallback", value: "17 / 148", icon: Send },
                { label: "Read rate (7 days)", value: "86%", icon: Users },
              ].map((r) => {
                const Icon = r.icon;
                return (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-ink-500">
                      <Icon className="h-3.5 w-3.5" /> {r.label}
                    </span>
                    <span className="font-medium text-ink-900">{r.value}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <p className="text-[12.5px] font-semibold text-ink-900">Scheduled</p>
            <div className="mt-3 space-y-3">
              {[
                { title: "monthly chanda due by 10th", when: "on 1st monthly", pinned: true },
                { title: "Jumu'ah reminder", when: "every Thursday, 6 PM" },
                { title: "Committee meeting", when: "2nd Sunday monthly" },
              ].map((s) => (
                <div key={s.title} className="rounded-xl border border-ink-100 p-3">
                  <p className="text-[12px] font-medium capitalize text-ink-800">{s.title}</p>
                  <p className="text-[11px] text-ink-500">{s.when}</p>
                </div>
              ))}
            </div>
            <Button variant="soft" size="sm" className="mt-3 w-full" onClick={() => toast("Automation editor opened")}>
              Manage automations
            </Button>
          </Card>
        </div>
      </div>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="New notice"
        subtitle="Goes out on the app, WhatsApp and SMS"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => { toast("Notice published"); setOpen(false); }}>
              <Send className="h-4 w-4" /> Publish now
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <Field label="Title">
            <Input placeholder="e.g. November chanda due by 10th" />
          </Field>
          <Field label="Message" hint="Keep it short — WhatsApp reads best under 300 characters.">
            <textarea
              className="input min-h-[120px] resize-y"
              placeholder="Write the notice…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Audience">
              <Select defaultValue="all">
                <option value="all">Everyone</option>
                <option value="members">Members only</option>
                <option value="office_bearers">Office bearers</option>
              </Select>
            </Field>
            <Field label="Pin to top">
              <Select defaultValue="no">
                <option value="no">No</option>
                <option value="yes">Yes, for 7 days</option>
              </Select>
            </Field>
          </div>
          <div>
            <label className="label">Channels</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: "app", label: "In-app" },
                { id: "whatsapp", label: "WhatsApp" },
                { id: "sms", label: "SMS" },
                { id: "all", label: "All channels" },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setChannel(c.id as typeof channel)}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-[12.5px] font-medium",
                    channel === c.id
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-ink-200 text-ink-600"
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-[11.5px] text-ink-500">
            Estimated cost: <span className="font-medium text-ink-800">₹12.40</span>{" "}
            (131 WhatsApp utility messages). Members without WhatsApp get an SMS
            automatically.
          </div>
        </div>
      </Drawer>
    </>
  );
}
