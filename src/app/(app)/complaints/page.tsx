"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  RefreshCw,
  ShieldQuestion,
  UserCheck,
} from "lucide-react";
import type { Complaint, Member } from "@/lib/types";
import {
  createComplaint,
  listComplaints,
  listMembers,
  listStaff,
  updateComplaint,
  type StaffMember,
} from "@/lib/repo";
import { isDemoMode } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
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

const CATEGORIES = [
  "Masjid Cleanliness",
  "Finance",
  "Imam / Staff",
  "Construction",
  "Water / Electricity",
  "Other",
];

export default function ComplaintsPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [compose, setCompose] = useState(false);

  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isOffice =
    user?.role === "sadar" ||
    user?.role === "secretary" ||
    user?.role === "khajanchi" ||
    user?.role === "auditor" ||
    user?.role === "collector";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [complaintRows, memberRows, staffRows] = await Promise.all([
        listComplaints(),
        listMembers(),
        listStaff(),
      ]);
      setComplaints(complaintRows);
      setMembers(memberRows);
      setStaff(staffRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complaints load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

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
    [complaints, q, status]
  );

  const open = complaints.filter((c) => c.status !== "resolved" && c.status !== "closed");

  async function triage(
    c: Complaint,
    patch: {
      status?: Complaint["status"];
      priority?: Complaint["priority"];
      assignedTo?: string | null;
    }
  ) {
    setBusy(true);
    try {
      await updateComplaint(c.id, patch);
      const next = { ...c, ...patch } as Complaint;
      if (patch.status === "resolved" || patch.status === "closed") {
        next.resolvedAt = next.resolvedAt ?? new Date().toISOString();
      }
      setComplaints((prev) => prev.map((x) => (x.id === c.id ? next : x)));
      setSelected((prev) => (prev && prev.id === c.id ? next : prev));
      toast(
        patch.status === "resolved"
          ? "Complaint resolved — member notified"
          : "Complaint updated"
      );
      if (!isDemoMode) await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Complaint update nahi hua", "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Complaints"
        description="Members can raise issues anonymously. Every complaint gets a tracking code and an SLA clock."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Refresh
            </Button>
            <Button onClick={() => setCompose(true)}>
              <MessageSquareWarning className="h-4 w-4" /> Raise complaint
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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={String(open.length)} sub="Needs action" icon={AlertCircle} tone="amber" />
        <StatCard label="High priority" value={String(complaints.filter((c) => c.priority === "high" && c.status !== "resolved" && c.status !== "closed").length)} sub="SLA 24 hours" icon={Clock} tone="red" />
        <StatCard label="Resolved" value={String(complaints.filter((c) => c.status === "resolved").length)} sub="All time" icon={CheckCircle2} tone="green" />
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

      {loading && complaints.length === 0 ? (
        <Card>
          <div className="p-10 text-center text-[12.5px] text-ink-500">
            Complaints load ho rahe hain…
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const m = c.memberId ? memberMap.get(c.memberId) : undefined;
            const owner = c.assignedTo ? staffMap.get(c.assignedTo) : undefined;
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
                    {owner ? (
                      <p className="inline-flex items-center gap-1 text-[11px] text-ink-500">
                        <UserCheck className="h-3 w-3" /> {owner.name.split(" ")[0]}
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
      )}

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
                Received {formatDate(selected.createdAt, true)} · SLA {selected.slaHours}h
                {selected.resolvedAt ? ` · Resolved ${formatDate(selected.resolvedAt, true)}` : ""}
              </p>
            </div>

            {isOffice ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Assign to">
                    <Select
                      value={selected.assignedTo ?? ""}
                      disabled={busy}
                      onChange={(e) =>
                        void triage(selected, { assignedTo: e.target.value || null })
                      }
                    >
                      <option value="">Unassigned</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Status">
                    <Select
                      value={selected.status}
                      disabled={busy}
                      onChange={(e) =>
                        void triage(selected, {
                          status: e.target.value as Complaint["status"],
                        })
                      }
                    >
                      <option value="open">Open</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_progress">In progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </Select>
                  </Field>
                </div>

                <Field label="Priority">
                  <Select
                    value={selected.priority}
                    disabled={busy}
                    onChange={(e) =>
                      void triage(selected, {
                        priority: e.target.value as Complaint["priority"],
                      })
                    }
                  >
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High — 24 hour SLA</option>
                  </Select>
                </Field>
              </>
            ) : (
              <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-3 text-[12px] text-ink-500">
                Only office bearers can assign or close a complaint.
              </div>
            )}

            <div className={cn("rounded-xl border p-3 text-[11.5px] leading-relaxed", "border-brand-100 bg-brand-50/60 text-brand-900")}>
              {selected.anonymous
                ? "This member chose to stay anonymous. Their identity is not stored with the complaint — do not ask other members to identify them."
                : "The member will receive status updates on WhatsApp and in the app."}
            </div>

            {isOffice && selected.status !== "resolved" && selected.status !== "closed" && (
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => void triage(selected, { status: "resolved" })}
              >
                <CheckCircle2 className="h-4 w-4" />
                {busy ? "Saving…" : "Mark resolved"}
              </Button>
            )}
          </div>
        )}
      </Drawer>

      {/* compose */}
      <ComposeDrawer
        open={compose}
        members={members}
        defaultMemberId={user?.memberId ?? null}
        onClose={() => setCompose(false)}
        onSaved={async (complaint) => {
          setComplaints((prev) => [complaint, ...prev]);
          setCompose(false);
          if (!isDemoMode) await load();
          toast(`Complaint submitted · tracking code ${complaint.trackingCode}`);
        }}
      />
    </>
  );
}

/* ── Compose drawer ───────────────────────────────────────────── */

function ComposeDrawer({
  open,
  members,
  defaultMemberId,
  onClose,
  onSaved,
}: {
  open: boolean;
  members: Member[];
  defaultMemberId: string | null;
  onClose: () => void;
  onSaved: (complaint: Complaint) => void | Promise<void>;
}) {
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [memberId, setMemberId] = useState(defaultMemberId ?? "");
  const [priority, setPriority] = useState<Complaint["priority"]>("normal");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memberId && defaultMemberId) setMemberId(defaultMemberId);
  }, [memberId, defaultMemberId]);

  async function submit() {
    if (!subject.trim() || !body.trim()) {
      toast("Subject and details are required", "error");
      return;
    }
    setSaving(true);
    try {
      const complaint = await createComplaint({
        category,
        subject,
        body,
        anonymous,
        memberId: anonymous ? null : memberId || null,
        priority,
      });
      setSubject("");
      setBody("");
      setAnonymous(false);
      setPriority("normal");
      await onSaved(complaint);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Complaint submit nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Raise a complaint"
      subtitle="You can stay anonymous"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "Submitting…" : "Submit"}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <Field label="Category">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Subject">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Short summary"
          />
        </Field>
        <Field label="Details">
          <textarea
            className="input min-h-[120px] resize-y"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe the issue…"
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Complaint["priority"])}
            >
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Raised by" hint="Optional — link this to a member.">
            <Select
              value={anonymous ? "" : memberId}
              onChange={(e) => setMemberId(e.target.value)}
              disabled={anonymous}
            >
              <option value="">Not linked</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.code}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2.5 rounded-xl border border-ink-200 px-3.5 py-3 text-[12.5px] text-ink-700">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-600"
            checked={anonymous}
            onChange={(e) => setAnonymous(e.target.checked)}
          />
          Submit anonymously (your name is not linked)
        </label>
        <p className="text-[11.5px] leading-relaxed text-ink-500">
          You will get a tracking code. Keep it safe — it is the only way to
          follow up, especially for anonymous complaints.
        </p>
      </div>
    </Drawer>
  );
}
