"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock,
  FileCheck2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { approvals } from "@/lib/mock";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  toast,
} from "@/components/ui";
import { cn, formatDate, formatINR } from "@/lib/utils";
import { useAuth } from "@/lib/auth";

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(approvals);
  const [tab, setTab] = useState<"pending" | "done">("pending");

  const list = useMemo(
    () => items.filter((a) => (tab === "pending" ? a.status === "pending" : a.status !== "pending")),
    [items, tab]
  );

  function act(id: string, status: "approved" | "rejected") {
    setItems((prev) => prev.map((a) => (a.id === id ? { ...a, status } : a)));
    toast(status === "approved" ? "Approved and posted to the ledger" : "Rejected — returned to requester", status === "approved" ? "success" : "error");
  }

  return (
    <>
      <PageHeader
        eyebrow="Governance"
        title="Approvals"
        description="Maker–checker queue. Payments, expenses and waivers need a second person before they touch the ledger."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Pending" value={String(items.filter((a) => a.status === "pending").length)} sub="Needs a decision" icon={Clock} tone="amber" />
        <StatCard label="Approved" value={String(items.filter((a) => a.status === "approved").length)} sub="This month" icon={CheckCircle2} tone="green" />
        <StatCard
          label="Value in queue"
          value={formatINR(items.filter((a) => a.status === "pending").reduce((s, a) => s + (a.amountPaise ?? 0), 0))}
          sub="Blocked from ledger"
          icon={ShieldCheck}
          tone="brand"
        />
      </div>

      <div className="mt-5 mb-4 inline-flex rounded-xl border border-ink-200 bg-white p-1">
        {[
          { id: "pending" as const, label: "Pending" },
          { id: "done" as const, label: "Completed" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium",
              tab === t.id ? "bg-ink-900 text-white" : "text-ink-600 hover:bg-ink-50"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Card>
          <EmptyState
            icon={FileCheck2}
            title={tab === "pending" ? "Nothing waiting" : "No completed items"}
            description={tab === "pending" ? "The queue is clear. Everything is posted and receipted." : "Approved and rejected items will appear here."}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((a) => (
            <Card key={a.id} className="overflow-hidden">
              <div className="flex items-start gap-3 p-5">
                <Avatar name={a.requestedBy} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[13.5px] font-semibold text-ink-900">{a.title}</p>
                    <Badge tone={a.entityType === "waiver" ? "violet" : a.entityType === "expense" ? "amber" : "blue"}>
                      {a.entityType}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-500">{a.subtitle}</p>
                  <p className="mt-1 text-[11px] text-ink-400">
                    Requested by {a.requestedBy} · {formatDate(a.requestedAt, true)}
                  </p>
                </div>
                {a.amountPaise !== undefined && (
                  <p className="text-[14px] font-semibold text-ink-900">{formatINR(a.amountPaise)}</p>
                )}
              </div>

              <div className="border-t border-ink-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-ink-400">Approval</span>
                  <div className="flex flex-1 items-center gap-1.5">
                    {Array.from({ length: a.totalSteps }).map((_, i) => (
                      <div key={i} className="flex flex-1 items-center gap-1.5">
                        <span
                          className={cn(
                            "flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold",
                            i < a.step ? "bg-emerald-500 text-white" : "bg-ink-100 text-ink-500"
                          )}
                        >
                          {i < a.step ? "✓" : i + 1}
                        </span>
                        {i < a.totalSteps - 1 && (
                          <span className={cn("h-0.5 flex-1 rounded", i < a.step - 1 ? "bg-emerald-400" : "bg-ink-100")} />
                        )}
                      </div>
                    ))}
                  </div>
                  <span className="text-[11px] font-medium text-ink-600">
                    step {a.step} of {a.totalSteps}
                  </span>
                </div>
              </div>

              {a.status === "pending" ? (
                <div className="flex gap-2 border-t border-ink-100 bg-ink-50/50 p-3">
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => act(a.id, "rejected")}>
                    <XCircle className="h-3.5 w-3.5" /> Reject
                  </Button>
                  <Button size="sm" className="flex-1" onClick={() => act(a.id, "approved")}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-3 text-[12px]">
                  {a.status === "approved" ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-emerald-700">Approved · posted to ledger</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-red-700">Rejected · returned to requester</span>
                    </>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-5">
        <CardHeader title="Separation of duties" subtitle="Why the khajanchi is protected" />
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          {[
            { icon: ShieldCheck, title: "No self-approval", body: `${user?.name ?? "You"} cannot approve an entry you created. The system blocks it.` },
            { icon: FileCheck2, title: "Every action logged", body: "Approver, time, IP and device are stored with the decision." },
            { icon: Clock, title: "Auto-escalation", body: "Pending items escalate to the sadar after 48 hours." },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.title} className="rounded-xl border border-ink-100 p-4">
                <Icon className="h-5 w-5 text-brand-600" />
                <p className="mt-2 text-[12.5px] font-semibold text-ink-900">{s.title}</p>
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-500">{s.body}</p>
              </div>
            );
          })}
        </div>
      </Card>
    </>
  );
}
