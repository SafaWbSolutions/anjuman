"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  CheckCheck,
  CreditCard,
  Info,
  Megaphone,
  ReceiptText,
} from "lucide-react";
import {
  listMyNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type MemberNotification,
} from "@/lib/repo";
import {
  Button,
  Card,
  EmptyState,
  PageHeader,
  toast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

const ICONS = {
  payment: CreditCard,
  due: ReceiptText,
  notice: Megaphone,
  approval: BellRing,
  info: Info,
} as const;

export default function NotificationsPage() {
  const [rows, setRows] = useState<MemberNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await listMyNotifications());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Notifications load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const unread = rows.filter((r) => !r.readAt).length;

  async function readOne(row: MemberNotification) {
    if (row.readAt) return;
    setRows((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, readAt: new Date().toISOString() } : r))
    );
    try {
      await markNotificationRead(row.id);
    } catch {
      /* keep the optimistic state */
    }
  }

  async function readAll() {
    setRows((prev) =>
      prev.map((r) => ({ ...r, readAt: r.readAt ?? new Date().toISOString() }))
    );
    try {
      await markAllNotificationsRead();
      toast("Sab notifications read ho gayi");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Mark read fail", "error");
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="Notifications"
        description="Payment, dues aur notices ki puri jaankari — kuch bhi chhup nahi."
        actions={
          <Button variant="secondary" onClick={readAll} disabled={unread === 0}>
            <CheckCheck className="h-4 w-4" /> Mark all read
          </Button>
        }
      />

      {error && (
        <Card>
          <p className="p-5 text-[13px] text-red-600">{error}</p>
        </Card>
      )}

      <Card>
        {loading ? (
          <p className="p-8 text-center text-[13px] text-ink-500">Loading…</p>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={BellRing}
            title="Abhi koi notification nahi"
            description="Payment, due ya notice aate hi yahan dikhega."
          />
        ) : (
          <div className="divide-y divide-ink-100">
            {rows.map((row) => {
              const Icon = ICONS[row.kind] ?? Info;
              return (
                <button
                  key={row.id}
                  onClick={() => void readOne(row)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-ink-50/70",
                    !row.readAt && "bg-brand-50/40"
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      row.kind === "payment" && "bg-emerald-100 text-emerald-700",
                      row.kind === "due" && "bg-amber-100 text-amber-700",
                      row.kind === "notice" && "bg-sky-100 text-sky-700",
                      row.kind === "approval" && "bg-violet-100 text-violet-700",
                      row.kind === "info" && "bg-ink-100 text-ink-600"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-ink-900">
                        {row.title}
                      </span>
                      {!row.readAt && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                      )}
                    </span>
                    {row.body && (
                      <span className="mt-0.5 block text-[12px] leading-relaxed text-ink-600">
                        {row.body}
                      </span>
                    )}
                    <span className="mt-1 block text-[11px] text-ink-400">
                      {formatDate(row.createdAt, true)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
