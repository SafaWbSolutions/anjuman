"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  listSupportMessages,
  setSupportMessageStatus,
  type SupportMessage,
} from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  PageHeader,
  StatCard,
  toast,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default function SupportInboxPage() {
  const [items, setItems] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listSupportMessages());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Messages load nahi hue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(item: SupportMessage) {
    setBusy(item.id);
    try {
      const next = item.status === "open" ? "resolved" : "open";
      await setSupportMessageStatus(item.id, next);
      setItems((rows) =>
        rows.map((r) => (r.id === item.id ? { ...r, status: next } : r))
      );
      toast(next === "resolved" ? "Resolved mark ho gaya" : "Reopened");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update nahi hua", "error");
    } finally {
      setBusy(null);
    }
  }

  const open = items.filter((i) => i.status === "open");

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Support Inbox"
        description="Sadar / secretary ki taraf se aayi requests â€” suspend, reactivate, plan aur technical issues."
        actions={
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Open requests"
          value={String(open.length)}
          sub="Needs a reply"
          icon={Inbox}
          tone="amber"
        />
        <StatCard
          label="Total messages"
          value={String(items.length)}
          sub="All time"
          icon={Mail}
          tone="brand"
        />
        <StatCard
          label="Resolved"
          value={String(items.length - open.length)}
          sub="Closed"
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      {loading ? (
        <Card className="mt-4 flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Support messages load ho rahe hainâ€¦
        </Card>
      ) : error ? (
        <Card className="mt-4 p-6 text-[13px] text-red-600">{error}</Card>
      ) : items.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-[13px] text-ink-500">
          Abhi koi support message nahi aaya.
        </Card>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={item.status === "open" ? "amber" : "green"}>
                      {item.status === "open" ? "Open" : "Resolved"}
                    </Badge>
                    <span className="text-[11.5px] text-ink-400">
                      {formatDate(item.createdAt)}
                    </span>
                    {item.tenantName && (
                      <span className="text-[11.5px] font-medium text-ink-600">
                        {item.tenantName}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-[14px] font-semibold text-ink-900">
                    {item.subject}
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-600">
                    {item.message}
                  </p>
                  <p className="mt-2 text-[11.5px] text-ink-400">
                    {item.name} Â· {item.email}
                    {item.phone ? ` Â· ${item.phone}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  {item.email && (
                    <a
                      href={`mailto:${item.email}?subject=${encodeURIComponent(
                        `Re: ${item.subject}`
                      )}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[12px] font-medium text-ink-700 hover:bg-ink-50"
                    >
                      <Mail className="h-3.5 w-3.5" /> Reply
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant={item.status === "open" ? "primary" : "secondary"}
                    loading={busy === item.id}
                    onClick={() => void toggle(item)}
                  >
                    {item.status === "open" ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                      </>
                    ) : (
                      <>
                        <RotateCcw className="h-3.5 w-3.5" /> Reopen
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
