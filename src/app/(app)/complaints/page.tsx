"use client";

import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  ShieldQuestion,
  UserCheck,
} from "lucide-react";
import { complaints, members } from "@/lib/mock";
import type { Complaint } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
  toast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

const PRIORITY_TONE = { high: "red", normal: "amber", low: "slate" } as const;

export default function ComplaintsPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [compose, setCompose] = useState(false);

  const rows = useMemo(
    () =>
      complaints.filter((c) => {
        if (status !== "all" && c.status !== status) return false;
        const term = q.trim().toLowerCase();
        if (!term) return true;
        return (
          c.subject.toLowerCase().includes(term) ||
          c.trackingCode.toLowerCase().includes(term) ||
          c.category.toLowerCase().includes(term)
        );
      }),
    [q, status]
  );

  const open = complaints.filter((c) => c.status !== "resolved" && c.status !== "closed");

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Complaints"
        description="Members can raise issues anonymously. Every complaint gets a tracking code and an SLA clock."
        actions={
          <Button onClick={() => setCompose(true)}>
            <MessageSquareWarning className="h-4 w-4" /> Raise complaint
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={String(open.length)} sub="Needs action" icon={AlertCircle} tone="amber" />
        <StatCard label="High priority" value={String(complaints.filter((c) => c.priority === "high" && c.status !== "resolved").length)} sub="SLA 24 hours" icon={Clock} tone="red" />
        <StatCard label="Resolved" value={String(complaints.filter((c) => c.status === "resolved").length)} sub="This month" icon={CheckCircle2} tone="green" />
        <StatCard label="Anonymous" value={String(complaints.filter((c) => c.anonymous).length)} sub="Identity protected" icon={ShieldQuestion} tone="violet" />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Subject, tracking code…" className="w-full sm:w-72" />
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto py-2 text-[12.5px]">
          <option value="all">Any status</option>
          <option value="open">Open</option>
          <option value="assigned">Assigned</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">{rows.length} complaints</span>
      </div>

      <div className="space-y-3">
        {rows.map((c) => {
          const m = c.memberId ? members.find((x) => x.id === c.memberId) : undefined;
          return (
            <Card
              key={c.id}
              className="cursor-pointer p-5 transition hover:border-ink-300"
              onClick={() => setSelected(c)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[10.5px] text-ink-400">{c.trackingCode}</span>
                    <Badge tone={PRIORITY_TONE[c.priority]}>{c.priority}</Badge>
                    <Badge tone="slate">{c.category}</Badge>
                    {c.anonymous && <Badge tone="violet">Anonymous</Badge>}
                  </div>
                  <h3 className="mt-1.5 text-[14px] font-semibold text-ink-900">{c.subject}</h3>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-ink-500">{c.body}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusPill status={c.status} />
                  <p className="text-[11px] text-ink-400">{formatDate(c.createdAt, true)}</p>
                  {c.assignedTo ? (
                    <p className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                      <UserCheck className="h-3 w-3" /> {c.assignedTo.split(" ")[0]}
                    </p>
                  ) : (
                    <span className="text-[11px] text-amber-600">Unassigned</span>
                  )}
                </div>
              </div>
              {m && (
                <p className="mt-2 border-t border-ink-100 pt-2 text-[11px] text-ink-400">
                  Raised by {m.name} · {m.code}
                </p>
              )}
            </Card>
          );
        })}
        {rows.length === 0 && (
          <Card className="p-10 text-center text-sm text-ink-500">
            No complaints match your filter.
          </Card>
        )}
      </div>

      {/* detail */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.subject ?? ""}
        subtitle={selected?.trackingCode}
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <StatusPill status={selected.status} />
              <Badge tone={PRIORITY_TONE[selected.priority]}>{selected.priority} priority</Badge>
              <Badge tone="slate">{selected.category}</Badge>
              {selected.anonymous && <Badge tone="violet">Anonymous</Badge>}
            </div>

            <div className="rounded-xl border border-ink-100 p-4">
              <p className="text-[13px] leading-relaxed text-ink-700">{selected.body}</p>
              <p className="mt-3 text-[11px] text-ink-400">
                Received {formatDate(selected.createdAt, true)} · SLA{" "}
                {selected.slaHours}h
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Assign to">
                <Select defaultValue={selected.assignedTo ?? ""}>
                  <option value="">Unassigned</option>
                  <option>Sadar Muhammad Yusuf</option>
                  <option>Khajanchi Abdul Karim</option>
                  <option>Secretary Nadeem Ahmad</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select defaultValue={selected.status}>
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </Select>
              </Field>
            </div>

            <Field label="Internal note" hint="Not visible to the member.">
              <Input placeholder="What action was taken?" />
            </Field>

            <div className={cn("rounded-xl border p-3 text-[11.5px] leading-relaxed", "border-brand-100 bg-brand-50/60 text-brand-900")}>
              {selected.anonymous
                ? "This member chose to stay anonymous. Their identity is not stored with the complaint — do not ask other members to identify them."
                : "The member will receive status updates on WhatsApp and in the app."}
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => toast("Reply sent to member")}>
                Reply
              </Button>
              <Button className="flex-1" onClick={() => { toast("Complaint resolved"); setSelected(null); }}>
                <CheckCircle2 className="h-4 w-4" /> Mark resolved
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* compose */}
      <Drawer
        open={compose}
        onClose={() => setCompose(false)}
        title="Raise a complaint"
        subtitle="You can stay anonymous"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCompose(false)}>Cancel</Button>
            <Button onClick={() => { toast("Complaint submitted · tracking code CMP-4X2Q"); setCompose(false); }}>
              Submit
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          <Field label="Category">
            <Select defaultValue="Masjid Cleanliness">
              {["Masjid Cleanliness", "Finance", "Imam / Staff", "Construction", "Water / Electricity", "Other"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Subject">
            <Input placeholder="Short summary" />
          </Field>
          <Field label="Details">
            <textarea className="input min-h-[120px] resize-y" placeholder="Describe the issue…" />
          </Field>
          <label className="flex items-center gap-2.5 rounded-xl border border-ink-200 px-3.5 py-3 text-[12.5px] text-ink-700">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" />
            Submit anonymously (your name is not linked)
          </label>
        </div>
      </Drawer>
    </>
  );
}
