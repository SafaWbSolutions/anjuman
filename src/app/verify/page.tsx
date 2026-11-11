"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { findMemberByCode, getCurrentTenant } from "@/lib/repo";
import { Badge, Button, Card } from "@/components/ui";
import { formatDate } from "@/lib/utils";

/**
 * Public verification page — opened when someone scans the QR on a
 * member ID card. Shows only non-sensitive fields and never exposes
 * dues, payment history or phone numbers.
 */
export default function VerifyPage() {
  const [code, setCode] = useState<string | null>(null);
  const [member, setMember] = useState<Awaited<ReturnType<typeof findMemberByCode>>>(null);
  const [tenant, setTenant] = useState<Awaited<ReturnType<typeof getCurrentTenant>>>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("id")?.trim().toUpperCase() ?? "";
    setCode(q || null);
  }, []);

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    Promise.all([findMemberByCode(code), getCurrentTenant()])
      .then(([m, t]) => {
        setMember(m);
        setTenant(t);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Verification failed"))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-white">
            ا
          </span>
          <div>
            <p className="text-[15px] font-semibold text-ink-900">Anjuman</p>
            <p className="text-[10.5px] uppercase tracking-wider text-ink-500">
              Member verification
            </p>
          </div>
        </div>

        {loading ? (
          <Card className="flex flex-col items-center gap-3 p-10 text-ink-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <p className="text-sm">Checking member ID…</p>
          </Card>
        ) : error ? (
          <Card className="p-8 text-center border-red-200 bg-red-50">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-ink-900">Verification error</p>
            <p className="mt-1 text-[12.5px] text-ink-500">{error}</p>
          </Card>
        ) : member ? (
          <Card className="overflow-hidden">
            <div className="bg-ink-900 p-5 text-white">
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-brand-400" />
                <p className="text-[11.5px] font-medium uppercase tracking-wider text-brand-300">
                  Verified member
                </p>
              </div>
              <p className="mt-2 text-lg font-semibold">{member.name}</p>
              <p className="text-[12px] text-ink-300">
                s/o {member.fatherName}
              </p>
              <p className="mt-2 inline-block rounded bg-white/10 px-2 py-1 font-mono text-[12px] tracking-wider">
                {member.code}
              </p>
            </div>
            <div className="space-y-2.5 p-5 text-[12.5px]">
              <Row label="Anjuman" value={tenant?.name ?? "—"} />
              <Row label="Masjid" value={tenant?.masjid ?? "—"} />
              <Row label="Village" value={`${tenant?.village ?? ""}, ${tenant?.district ?? ""}`.trim() || "—"} />
              <Row label="Household" value={`#${member.household} · ${member.mohalla}`} />
              <Row label="Type" value={member.type} />
              <Row label="Member since" value={formatDate(member.joinedOn)} />
              <div className="flex items-center justify-between pt-1">
                <span className="text-ink-500">Status</span>
                <Badge tone={member.status === "active" ? "green" : "amber"} dot>
                  {member.status}
                </Badge>
              </div>
            </div>
            <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-3 text-[11px] leading-relaxed text-ink-500">
              Is card par di gayi details sirf sadasya ki pehchaan ke liye hain.
              Dues, payments aur phone number yahan nahi dikhaye jaate.
            </div>
          </Card>
        ) : (
          <Card className="p-8 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
              <ShieldAlert className="h-6 w-6" />
            </span>
            <p className="mt-3 text-[15px] font-semibold text-ink-900">
              Member ID not found
            </p>
            <p className="mt-1 text-[12.5px] text-ink-500">
              {code
                ? `“${code}” kisi active anjuman se match nahi hua.`
                : "QR me member ID nahi mila."}
            </p>
            <p className="mt-3 text-[11.5px] text-ink-400">
              Check digit galat ho sakta hai. Card dobara scan karo ya anjuman
              office se sampark karo.
            </p>
          </Card>
        )}

        <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
          <ShieldCheck className="h-3 w-3" />
          <span>IDs are signed by the issuing anjuman.</span>
        </div>

        <div className="mt-6 text-center">
          <Link href="/login/">
            <Button variant="ghost" size="sm">
              Anjuman panel kholo
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-ink-500">{label}</span>
      <span className="text-right font-medium capitalize text-ink-900">{value}</span>
    </div>
  );
}