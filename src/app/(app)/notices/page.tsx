"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Bell,
  Megaphone,
  Pin,
  Plus,
  RefreshCw,
  Send,
  Smartphone,
  Users,
} from "lucide-react";
import type { Notice } from "@/lib/types";
import {
  broadcastNotice,
  createNotice,
  listMembers,
  listNotices,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
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
  const [items, setItems] = useState<Notice[]>([]);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // form
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Notice["audience"]>("all");
  const [pinned, setPinned] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [noticeRows, memberRows] = await Promise.all([
        listNotices(),
        listMembers(),
      ]);
      setItems(noticeRows);
      setMemberCount(memberRows.filter((m) => m.status === "active").length);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notices load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function publish() {
    if (!title.trim() || !body.trim()) {
      toast("Title and message are required", "error");
      return;
    }

    setPublishing(true);
    try {
      const notice = await createNotice({
        title: title.trim(),
        body: body.trim(),
        audience,
        pinned,
      });

      let queued = 0;
      try {
        queued = await broadcastNotice(notice.id);
      } catch {
        /* queue can be retried from the nightly job */
      }

      setItems((prev) => [notice, ...prev]);
      toast(
        queued > 0
          ? `Notice published · ${queued} messages queued`
          : "Notice published to the app"
      );
      setTitle("");
      setBody("");
      setAudience("all");
      setPinned(false);
      setOpen(false);
      if (!isDemoMode) await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Notice publish nahi hua", "error");
    } finally {
      setPublishing(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Notices"
        description="Publish to the app, WhatsApp and SMS at once. Pinned notices appear on every member's home screen."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" /> New notice
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button className="font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {loading && items.length === 0 ? (
            <Card>
              <div className="p-10 text-center text-[12.5px] text-ink-500">
                Notices load ho rahe hain…
              </div>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <div className="p-10 text-center">
                <Megaphone className="mx-auto h-8 w-8 text-ink-300" />
                <p className="mt-2 text-[13.5px] font-medium text-ink-800">
                  No notices yet
                </p>
                <p className="mt-1 text-[12px] text-ink-500">
                  Publish the first notice — it will reach members on the app,
                  WhatsApp and SMS.
                </p>
              </div>
            </Card>
          ) : (
            items.map((n) => (
              <Card key={n.id} className={cn("p-5", n.pinned && "ring-1 ring-brand-200")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {n.pinned && (
                      <Badge tone="brand">
                        <Pin className="h-3 w-3" /> Pinned
                      </Badge>
                    )}
                    <Badge tone="slate">{AUD_LABEL[n.audience] ?? n.audience}</Badge>
                  </div>
                  <p className="text-[11.5px] text-ink-400">
                    {formatDate(n.publishedAt, true)}
                  </p>
                </div>
                <h3 className="mt-2 text-[15px] font-semibold text-ink-900">{n.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-600">{n.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3 text-[11.5px] text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <Send className="h-3 w-3" /> Delivered to {memberCount} members
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Smartphone className="h-3 w-3" /> App · WhatsApp · SMS
                  </span>
                  {n.expiresAt && (
                    <span className="ml-auto text-ink-400">
                      Expires {formatDate(n.expiresAt)}
                    </span>
                  )}
                </div>
              </Card>
            ))
          )}
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
                { label: "Active members", value: String(memberCount), icon: Users },
                { label: "In-app notifications", value: "On", icon: Bell },
                { label: "WhatsApp (if enabled)", value: "Automatic", icon: Smartphone },
                { label: "SMS fallback", value: "Automatic", icon: Send },
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
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={publishing}>
              Cancel
            </Button>
            <Button onClick={() => void publish()} disabled={publishing}>
              <Send className="h-4 w-4" />
              {publishing ? "Publishing…" : "Publish now"}
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <Field label="Title">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. November chanda due by 10th"
            />
          </Field>
          <Field label="Message" hint="Keep it short — WhatsApp reads best under 300 characters.">
            <textarea
              className="input min-h-[120px] resize-y"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the notice…"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Audience">
              <Select
                value={audience}
                onChange={(e) => setAudience(e.target.value as Notice["audience"])}
              >
                <option value="all">Everyone</option>
                <option value="members">Members only</option>
                <option value="office_bearers">Office bearers</option>
              </Select>
            </Field>
            <Field label="Pin to top">
              <Select
                value={pinned ? "yes" : "no"}
                onChange={(e) => setPinned(e.target.value === "yes")}
              >
                <option value="no">No</option>
                <option value="yes">Yes, keep on top</option>
              </Select>
            </Field>
          </div>
          <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-[11.5px] leading-relaxed text-ink-500">
            <span className="font-medium text-ink-800">Delivery:</span> the app
            notification is always sent. WhatsApp and SMS are used automatically
            for members who have them enabled in Integrations — no extra step.
          </div>
        </div>
      </Drawer>
    </>
  );
}
