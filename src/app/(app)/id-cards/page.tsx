"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import {
  CheckSquare,
  Download,
  FileText,
  Printer,
  Share2,
  Square,
  Users,
} from "lucide-react";
import type { Member, Tenant } from "@/lib/types";
import { listMembers, getCurrentTenant } from "@/lib/repo";
import { useAuth } from "@/lib/auth";
import {
  cn,
  downloadNodePng,
  printArea,
  shareNodeOnWhatsApp,
} from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  PageHeader,
  SearchInput,
  Select,
  toast,
} from "@/components/ui";

export default function IdCardsPage() {
  const { user } = useAuth();
  const isMember = user?.role === "member";

  const [q, setQ] = useState("");
  const [mohalla, setMohalla] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [qr, setQr] = useState<Record<string, string>>({});
  const [layout, setLayout] = useState<"8" | "6">("8");
  const [members, setMembers] = useState<Member[]>([]);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // A member opening "My ID card" only ever sees their own card.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("member");
    if (id) setSelected(new Set([id]));
  }, []);

  // Load data
  useEffect(() => {
    let isMounted = true;
    Promise.all([listMembers(), getCurrentTenant()])
      .then(([m, t]) => {
        if (isMounted) {
          setMembers(m);
          setTenant(t);
        }
      })
      .catch((e) => {
        if (isMounted) setError(e instanceof Error ? e.message : "Members load nahi ho sake");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const myMember = useMemo(() => {
    if (!isMember) return null;
    return (
      members.find((m) => m.id === user?.memberId) ??
      members.find((m) => !!user?.phone && m.phone === user.phone) ??
      (isMember ? members[0] ?? null : null)
    );
  }, [isMember, members, user?.memberId, user?.phone]);

  // QR codes are only needed for the cards that can actually be shown.
  const qrMembers = useMemo(
    () => (isMember ? (myMember ? [myMember] : []) : members),
    [isMember, myMember, members]
  );

  // Generate QR codes - only runs on client side after mount
  useEffect(() => {
    if (!mounted || qrMembers.length === 0) return;
    let cancelled = false;
    setQrLoading(true);
    setQrError(null);
    (async () => {
      try {
        const next: Record<string, string> = {};
        // Use relative URL to avoid hydration mismatch during static export
        // The browser will resolve it correctly when scanned
        for (const m of qrMembers) {
          if (cancelled) break;
          const url = `/verify/?id=${m.code}`;
          next[m.id] = await QRCode.toDataURL(url, {
            margin: 1,
            width: 240,
            color: { dark: "#0f172a", light: "#ffffff" },
          });
        }
        if (!cancelled) setQr(next);
      } catch (e) {
        if (!cancelled) {
          setQrError("QR code generate nahi hua: " + (e instanceof Error ? e.message : "Unknown error"));
          console.error("QR generation failed:", e);
        }
      } finally {
        if (!cancelled) setQrLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [qrMembers, mounted]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return members.filter((m) => {
      if (mohalla !== "all" && m.mohalla !== mohalla) return false;
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.code.toLowerCase().includes(term) ||
        m.phone.includes(term)
      );
    });
  }, [q, mohalla, members]);

  const mohallas = useMemo(
    () => Array.from(new Set(members.map((m) => m.mohalla))).sort(),
    [members]
  );

  const chosen = useMemo(
    () => members.filter((m) => selected.has(m.id)),
    [members, selected]
  );

  const pageSize = Number(layout);

  // Sheet pages: 8 (or 6) cards per A4 page, never more.
  const pages = useMemo(() => {
    const list = isMember
      ? myMember
        ? [myMember]
        : []
      : chosen.length
        ? chosen
        : members.slice(0, pageSize);
    const out: Member[][] = [];
    for (let i = 0; i < list.length; i += pageSize) {
      out.push(list.slice(i, i + pageSize));
    }
    return out;
  }, [isMember, myMember, chosen, members, pageSize]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function cardNode(id: string) {
    return document.querySelector<HTMLElement>(`[data-card-member="${id}"]`);
  }

  async function downloadCard(m: Member) {
    const node = cardNode(m.id);
    if (!node) return toast("Card taiyaar nahi hai", "error");
    setBusy(`dl-${m.id}`);
    try {
      await downloadNodePng(node, `${m.code}-id-card.png`);
      toast("ID card PNG download ho gaya");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Download fail ho gaya", "error");
    } finally {
      setBusy(null);
    }
  }

  function cardShareText(m: Member) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return [
      `${tenant?.name ?? "Anjuman"} — member ID card`,
      `${m.name} · ${m.code}`,
      `Verify: ${origin}/verify/?id=${m.code}`,
    ].join("\n");
  }

  async function shareCard(m: Member) {
    const node = cardNode(m.id);
    if (!node) return toast("Card taiyaar nahi hai", "error");
    setBusy(`share-${m.id}`);
    try {
      const res = await shareNodeOnWhatsApp(node, `${m.code}-id-card.png`, cardShareText(m));
      if (res === "shared") toast("WhatsApp share sheet khul gaya");
      else if (res === "downloaded") toast("PNG download hua — WhatsApp me attach kar dein");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Share fail ho gaya", "error");
    } finally {
      setBusy(null);
    }
  }

  /** Bulk download selected cards (or all visible cards) as a multi-page PDF,
   * 8 cards per A4 sheet, printable area only. */
  async function downloadCardsPdf() {
    const toExport = chosen.length ? chosen : filtered.slice(0, Number(layout));
    if (toExport.length === 0) return toast("Select at least one member", "error");

    setBusy("pdf");
    try {
      const { toBlob } = await import("html-to-image");
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const pageWidth = pdf.internal.pageSize.getWidth(); // 210 mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297 mm
      const cardWidth = 43; // 85mm / 2 = 42.5mm per card
      const cardHeight = 27; // 54mm / 2 = 27mm per card
      const gap = 4;
      const cols = 2;
      const rows = 4;
      const xStart = (pageWidth - cols * cardWidth - (cols - 1) * gap) / 2;
      const yStart = 10;

      let cardIdx = 0;
      let page = 1;

      for (const m of toExport) {
        if (cardIdx >= cols * rows) {
          pdf.addPage();
          page++;
          cardIdx = 0;
        }

        const node = document.querySelector<HTMLElement>(`[data-card-member="${m.id}"]`);
        if (!node) continue;

        const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true });
        if (!blob) continue;

        const imgData = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.readAsDataURL(blob);
          reader.onloadend = () => resolve(reader.result as string);
        });

        const col = cardIdx % cols;
        const row = Math.floor(cardIdx / cols);
        const x = xStart + col * (cardWidth + gap);
        const y = yStart + row * (cardHeight + gap);

        pdf.addImage(imgData, "PNG", x, y, cardWidth, cardHeight);
        cardIdx++;
      }

      const fileName = `${tenant?.code ?? "anjuman"}-id-cards.pdf`;
      pdf.save(fileName);
      toast("ID cards PDF download ho gaya");
    } catch (e) {
      toast(e instanceof Error ? e.message : "PDF banane mein kami rahi", "error");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Community" title="ID cards" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          ID cards taiyaar ho rahe hain…
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Community" title="ID cards" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
        </Card>
      </>
    );
  }

  /* ── Member view: exactly one card, download / share / print ───── */
  if (isMember) {
    return (
      <>
        <PageHeader
          eyebrow="My account"
          title="My ID card"
          description="Aapka Anjuman member card — download karein, WhatsApp par bhejein ya print nikaalein."
          actions={
            myMember ? (
              <>
                <Button
                  variant="secondary"
                  loading={busy === `dl-${myMember.id}`}
                  onClick={() => void downloadCard(myMember)}
                >
                  <Download className="h-4 w-4" /> Download
                </Button>
                <Button
                  variant="secondary"
                  loading={busy === `share-${myMember.id}`}
                  onClick={() => void shareCard(myMember)}
                >
                  <Share2 className="h-4 w-4" /> WhatsApp
                </Button>
                <Button onClick={() => printArea()}>
                  <Printer className="h-4 w-4" /> Print
                </Button>
              </>
            ) : undefined
          }
        />

        {!myMember ? (
          <Card className="mx-auto max-w-lg p-10 text-center">
            <Users className="mx-auto h-8 w-8 text-ink-300" />
            <p className="mt-2 text-[13.5px] font-medium text-ink-800">
              Aapka member record link nahi hai
            </p>
            <p className="mt-1 text-[12px] text-ink-500">
              Sadar se sampark karein taake aapka account member list se link ho jaye.
            </p>
          </Card>
        ) : (
          <div className="mx-auto w-fit">
            <div className="rounded-2xl bg-white p-4 shadow-[var(--shadow-card)] ring-1 ring-ink-200">
              <div className="print-area">
                <MemberCard member={myMember} qr={qr[myMember.id]} tenant={tenant} />
              </div>
            </div>
            <p className="no-print mt-3 text-center text-[12px] text-ink-500">
              Ye card Aadhaar-size (85 × 54 mm) hai. Print karne par sirf card hi
              nikalta hai.
            </p>
          </div>
        )}
      </>
    );
  }

  /* ── Office view: build A4 sheets of 8 (or 6) cards ────────────── */
  const single = chosen.length === 1 ? chosen[0] : null;

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="ID cards"
        description="Aadhaar-style member cards with a scannable QR that opens the member's verified profile. Print 8 per A4 sheet."
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setSelected(new Set(filtered.map((m) => m.id)))}
            >
              <CheckSquare className="h-4 w-4" /> Select all ({filtered.length})
            </Button>
            <Button
              variant="secondary"
              disabled={!single}
              loading={!!single && busy === `dl-${single.id}`}
              onClick={() => single && void downloadCard(single)}
            >
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button
              variant="secondary"
              disabled={chosen.length === 0}
              loading={busy === "pdf"}
              onClick={() => void downloadCardsPdf()}
            >
              <FileText className="h-4 w-4" /> PDF
            </Button>
            <Button
              variant="secondary"
              disabled={!single}
              loading={!!single && busy === `share-${single.id}`}
              onClick={() => single && void shareCard(single)}
            >
              <Share2 className="h-4 w-4" /> WhatsApp
            </Button>
            <Button
              onClick={() => {
                if (chosen.length === 0) return toast("Select at least one member", "error");
                printArea();
              }}
            >
              <Printer className="h-4 w-4" /> Print {chosen.length || ""}
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        {/* ── Selection panel ─────────────────────────────── */}
        <div className="no-print space-y-3">
          <Card className="p-4">
            <SearchInput
              value={q}
              onChange={setQ}
              placeholder="Search members…"
            />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Select
                value={mohalla}
                onChange={(e) => setMohalla(e.target.value)}
                className="py-2 text-[12.5px]"
              >
                <option value="all">All mohallas</option>
                {mohallas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
              <Select
                value={layout}
                onChange={(e) => setLayout(e.target.value as "8" | "6")}
                className="py-2 text-[12.5px]"
              >
                <option value="8">8 per sheet</option>
                <option value="6">6 per sheet</option>
              </Select>
            </div>
            <div className="mt-3 flex items-center justify-between text-[12px] text-ink-500">
              <span>{chosen.length} selected</span>
              <button
                className="font-medium text-brand-700"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </button>
            </div>
            {chosen.length > 1 && (
              <p className="mt-2 text-[11px] text-ink-400">
                Download / WhatsApp ke liye sirf 1 member select karein.
              </p>
            )}
          </Card>

          <Card className="max-h-[520px] overflow-y-auto">
            <ul className="divide-y divide-ink-100">
              {filtered.map((m) => {
                const on = selected.has(m.id);
                return (
                  <li key={m.id}>
                    <button
                      onClick={() => toggle(m.id)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-ink-50/70"
                    >
                      {on ? (
                        <CheckSquare className="h-4.5 w-4.5 shrink-0 text-brand-600" />
                      ) : (
                        <Square className="h-4.5 w-4.5 shrink-0 text-ink-300" />
                      )}
                      <Avatar name={m.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink-800">
                          {m.name}
                        </p>
                        <p className="font-mono text-[10.5px] text-ink-500">
                          {m.code}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
              {filtered.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-ink-500">
                  No members found
                </li>
              )}
            </ul>
          </Card>
        </div>

        {/* ── Preview / print sheets ──────────────────────── */}
        <div>
          <div className="no-print mb-3 flex flex-wrap items-center gap-2">
            <Badge tone="brand">A4 preview</Badge>
            <span className="text-[12px] text-ink-500">
              {layout === "8" ? "2 × 4 grid" : "2 × 3 grid"} · cards print at
              85 × 54 mm
            </span>
            <span className="ml-auto text-[12px] text-ink-400">
              {pages.length} page{pages.length === 1 ? "" : "s"}
            </span>
            {qrLoading && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-brand-600">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
                QR generating…
              </span>
            )}
            {qrError && (
              <span className="ml-2 inline-flex items-center gap-1 text-[11px] text-red-600">
                ⚠ {qrError}
              </span>
            )}
          </div>

          {mounted && members.length > 0 ? (
            <div className="space-y-6">
              {pages.map((page, idx) => (
                <div key={idx}>
                  {pages.length > 1 && (
                    <p className="no-print mb-2 text-center text-[11px] text-ink-400">
                      Sheet {idx + 1} of {pages.length}
                    </p>
                  )}
                  <div className="print-area">
                    <div
                      className={cn(
                        "mx-auto rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] ring-1 ring-ink-200 print:rounded-none print:p-0 print:shadow-none print:ring-0",
                        "id-sheet"
                      )}
                      style={{
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      }}
                    >
                      {page.map((m) => (
                        <MemberCard key={m.id} member={m} qr={qr[m.id]} tenant={tenant} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="mx-auto rounded-2xl bg-white p-6 shadow-[var(--shadow-card)] ring-1 ring-ink-200 text-center text-ink-500">
                <p>Loading ID cards…</p>
              </div>
            </div>
          )}

          {!chosen.length && (
            <p className="no-print mt-3 text-center text-[12px] text-ink-500">
              Showing first {pageSize} members as a sample. Select members to build
              the real sheet.
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function MemberCard({
  member,
  qr,
  tenant,
}: {
  member: Member;
  qr?: string;
  tenant: Tenant | null;
}) {
  return (
    <div className="id-card flex flex-col text-ink-900" data-card-member={member.id}>
      {/* header */}
      <div className="relative flex items-center gap-2 bg-ink-900 px-3 py-2 text-white">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-md bg-brand-500 text-[11px] font-bold">
          {tenant?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt="" className="h-full w-full bg-white object-contain" />
          ) : (
            "ا"
          )}
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[9px] font-semibold tracking-wide">
            {tenant?.name.toUpperCase() ?? "ANJUMAN"}
          </p>
          <p className="truncate text-[7px] text-ink-300">
            {tenant?.village} · {tenant?.district} · Reg {tenant?.regNo}
          </p>
        </div>
        <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[6.5px] font-semibold uppercase tracking-wider">
          Member
        </span>
      </div>

      {/* body */}
      <div className="flex flex-1 gap-2.5 px-3 py-2">
        <div className="flex flex-col items-center gap-1">
          <div className="flex h-[17mm] w-[14mm] items-center justify-center overflow-hidden rounded-[1.5mm] bg-ink-100 ring-1 ring-ink-200">
            {member.photoUrl ? (
              <img
                src={member.photoUrl}
                alt={member.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-[15px] font-semibold text-ink-500">
                {member.name
                  .split(" ")
                  .slice(0, 2)
                  .map((p) => p[0])
                  .join("")}
              </span>
            )}
          </div>
          <span className="rounded bg-brand-50 px-1 py-0.5 text-[5.5px] font-semibold uppercase text-brand-700">
            {member.type}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[10.5px] font-bold leading-tight">
            {member.name}
          </p>
          <p className="truncate text-[7px] text-ink-500">
            s/o {member.fatherName}
          </p>
          <div className="mt-1 inline-block rounded bg-ink-900 px-1.5 py-0.5 font-mono text-[8px] font-semibold tracking-wider text-white">
            {member.code}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[6.5px] leading-snug">
            <p className="text-ink-400">House</p>
            <p className="font-medium">#{member.household}</p>
            <p className="text-ink-400">Mohalla</p>
            <p className="truncate font-medium">{member.mohalla.replace("Mohalla ", "")}</p>
            <p className="text-ink-400">Mobile</p>
            <p className="truncate font-medium">{member.phone}</p>
            <p className="text-ink-400">Blood</p>
            <p className="font-medium">{member.bloodGroup ?? "—"}</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`QR ${member.code}`} className="h-[15mm] w-[15mm]" />
          ) : (
            <div className="h-[15mm] w-[15mm] animate-pulse rounded bg-ink-100" />
          )}
          <p className="text-[5px] leading-tight text-ink-400">Scan to verify</p>
        </div>
      </div>

      {/* footer */}
      <div className="flex items-center justify-between border-t border-dashed border-ink-200 px-3 py-1">
        <p className="text-[5.5px] text-ink-400">
          Valid while member is active · Not a govt. ID
        </p>
        <p className="text-[5.5px] font-semibold text-brand-700">
          anjuman.app
        </p>
      </div>
    </div>
  );
}
