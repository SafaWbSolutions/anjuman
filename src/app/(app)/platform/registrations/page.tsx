"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  Inbox,
  Loader2,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";
import {
  decideRegistrationRequest,
  getRegistrationDocUrl,
  listRegistrationRequests,
} from "@/lib/repo";
import type { RegistrationRequest, RegistrationStatus } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Drawer,
  PageHeader,
  StatCard,
  toast,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default function RegistrationsPage() {
  const [items, setItems] = useState<RegistrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<RegistrationRequest | null>(null);
  const [docs, setDocs] = useState<Record<string, string | null>>({});
  const [docsLoading, setDocsLoading] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<RegistrationStatus | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await listRegistrationRequests());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Requests load nahi hui");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setNote("");
    const paths = {
      "Sadar KYC": selected.sadarKycUrl,
      "Khajanchi KYC": selected.khajanchiKycUrl,
      "Anjuman proof": selected.proofUrl,
    };
    const entries = Object.entries(paths).filter(([, v]) => Boolean(v));
    if (entries.length === 0) {
      setDocs({});
      return;
    }
    setDocsLoading(true);
    Promise.all(
      entries.map(async ([key, path]) => [key, await getRegistrationDocUrl(path!)] as const)
    )
      .then((rows) => setDocs(Object.fromEntries(rows)))
      .finally(() => setDocsLoading(false));
  }, [selected]);

  async function decide(status: "approved" | "rejected") {
    if (!selected) return;
    setBusy(status);
    try {
      await decideRegistrationRequest(selected.id, status, note.trim() || undefined);
      toast(status === "approved" ? "Request approved" : "Request rejected");
      setSelected(null);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Decision save nahi hua", "error");
    } finally {
      setBusy(null);
    }
  }

  const pending = items.filter((i) => i.status === "pending");
  const approved = items.filter((i) => i.status === "approved");

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Registration requests"
        description="Login page se aayi nayi anjuman requests. Documents verify karke approve ya reject karein."
        actions={
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Pending"
          value={String(pending.length)}
          sub="Verification baaki"
          icon={Inbox}
          tone="amber"
        />
        <StatCard
          label="Approved"
          value={String(approved.length)}
          sub="Account create karna hai"
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Total requests"
          value={String(items.length)}
          sub="All time"
          icon={Building2}
          tone="brand"
        />
      </div>

      {loading ? (
        <Card className="mt-4 flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Requests load ho rahi hain…
        </Card>
      ) : error ? (
        <Card className="mt-4 p-6 text-[13px] text-red-600">{error}</Card>
      ) : items.length === 0 ? (
        <Card className="mt-4 p-10 text-center text-[13px] text-ink-500">
          Abhi koi registration request nahi aayi.
        </Card>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.status} />
                    <span className="text-[11.5px] text-ink-400">
                      {formatDate(item.createdAt)}
                    </span>
                    {item.isRegistered && item.regNo && (
                      <span className="font-mono text-[11px] text-ink-500">
                        {item.regNo}
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1.5 text-[14.5px] font-semibold text-ink-900">
                    {item.anjumanName}
                  </h3>
                  <p className="mt-0.5 flex items-start gap-1.5 text-[12px] text-ink-500">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">
                      {[item.address, item.district, item.state, item.pincode]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> {item.sadarName}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {item.sadarPhone}
                    </span>
                    {item.totalMembers != null && (
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3 w-3" /> {item.totalMembers} members
                      </span>
                    )}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSelected(item)}>
                  View
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={selected?.anjumanName ?? "Registration request"}
        subtitle={selected ? `Ref ${selected.id.slice(0, 8).toUpperCase()}` : undefined}
        width="max-w-2xl"
        footer={
          selected ? (
            <div className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] text-ink-500">
                {selected.status === "pending"
                  ? "Approve karne par status update hoga."
                  : `Already ${selected.status}.`}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy === "rejected"}
                  disabled={busy !== null}
                  onClick={() => void decide("rejected")}
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
                <Button
                  size="sm"
                  loading={busy === "approved"}
                  disabled={busy !== null}
                  onClick={() => void decide("approved")}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </Button>
              </div>
            </div>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={selected.status} />
              {selected.isRegistered ? (
                <Badge tone="blue">Already registered</Badge>
              ) : (
                <Badge tone="slate">New registration</Badge>
              )}
              {selected.regNo && (
                <span className="font-mono text-[11.5px] text-ink-500">
                  Reg: {selected.regNo}
                </span>
              )}
            </div>

            <InfoBlock title="Anjuman" icon={Building2}>
              <Row label="Name" value={selected.anjumanName} />
              <Row label="Address" value={selected.address} />
              <Row
                label="District / State"
                value={[selected.district, selected.state].filter(Boolean).join(", ")}
              />
              <Row label="Pincode" value={selected.pincode} />
              <Row
                label="Total members"
                value={selected.totalMembers != null ? String(selected.totalMembers) : ""}
              />
            </InfoBlock>

            <InfoBlock title="Sadar" icon={ShieldCheck}>
              <Row label="Name" value={selected.sadarName} />
              <Row label="Mobile" value={selected.sadarPhone} />
              <Row label="Email" value={selected.sadarEmail} />
            </InfoBlock>

            <InfoBlock title="Khajanchi" icon={Wallet}>
              <Row label="Name" value={selected.khajanchiName} />
              <Row label="Mobile" value={selected.khajanchiPhone} />
              <Row label="Email" value={selected.khajanchiEmail} />
            </InfoBlock>

            <InfoBlock title="Documents" icon={FileText}>
              {docsLoading ? (
                <p className="flex items-center gap-2 text-[12px] text-ink-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Signed links ban rahe
                  hain…
                </p>
              ) : Object.keys(docs).length === 0 ? (
                <p className="text-[12px] text-ink-500">Koi document upload nahi hua.</p>
              ) : (
                <div className="space-y-2">
                  {Object.entries(docs).map(([label, url]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 px-3 py-2"
                    >
                      <span className="text-[12.5px] text-ink-700">{label}</span>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline"
                        >
                          Open <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        <span className="text-[11.5px] text-red-500">Link failed</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </InfoBlock>

            {selected.note && (
              <InfoBlock title="Note from applicant" icon={Mail}>
                <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink-600">
                  {selected.note}
                </p>
              </InfoBlock>
            )}

            <div>
              <label className="label">Decision note (optional)</label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Documents verified, account create kar diya."
                className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            {selected.decisionNote && (
              <p className="rounded-xl bg-ink-50 p-3 text-[12px] text-ink-600">
                <b>Previous decision:</b> {selected.decisionNote}
              </p>
            )}

            <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[11.5px] leading-relaxed text-brand-800">
              <BadgeCheck className="mr-1 inline h-3.5 w-3.5" />
              Approve ke baad <b>Anjumans</b> page se naya tenant banayein aur
              Sadar/Khajanchi ke email par login details bhejein.
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}

function StatusBadge({ status }: { status: RegistrationStatus }) {
  if (status === "approved") return <Badge tone="green" dot>Approved</Badge>;
  if (status === "rejected") return <Badge tone="red" dot>Rejected</Badge>;
  return <Badge tone="amber" dot>Pending</Badge>;
}

function InfoBlock({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Building2;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 border-b border-ink-100 pb-1.5 text-[12.5px] font-semibold text-ink-800">
        <Icon className="h-3.5 w-3.5 text-brand-600" /> {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 text-[12.5px]">
      <span className="w-28 shrink-0 text-ink-400">{label}</span>
      <span className="min-w-0 flex-1 break-words text-ink-800">{value}</span>
    </div>
  );
}
