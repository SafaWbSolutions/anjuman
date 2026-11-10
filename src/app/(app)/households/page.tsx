"use client";

import { useMemo, useState } from "react";
import { Home, Search, Users, Wallet } from "lucide-react";
import { members, invoices } from "@/lib/mock";
import { formatINR, cn } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SearchInput,
  StatCard,
} from "@/components/ui";

interface Household {
  number: string;
  mohalla: string;
  members: typeof members;
  billed: number;
  paid: number;
}

export default function HouseholdsPage() {
  const [q, setQ] = useState("");

  const households = useMemo<Household[]>(() => {
    const map = new Map<string, Household>();
    members.forEach((m) => {
      const key = `${m.mohalla}#${m.household}`;
      if (!map.has(key)) {
        map.set(key, {
          number: m.household,
          mohalla: m.mohalla,
          members: [],
          billed: 0,
          paid: 0,
        });
      }
      map.get(key)!.members.push(m);
    });
    map.forEach((h) => {
      h.members.forEach((m) => {
        invoices
          .filter((i) => i.memberId === m.id)
          .forEach((i) => {
            h.billed += i.amountPaise;
            h.paid += i.paidPaise;
          });
      });
    });
    return [...map.values()].sort((a, b) =>
      `${a.mohalla}${a.number}`.localeCompare(`${b.mohalla}${b.number}`)
    );
  }, []);

  const filtered = households.filter((h) => {
    const term = q.trim().toLowerCase();
    if (!term) return true;
    return (
      h.number.includes(term) ||
      h.mohalla.toLowerCase().includes(term) ||
      h.members.some((m) => m.name.toLowerCase().includes(term))
    );
  });

  const totalBilled = households.reduce((s, h) => s + h.billed, 0);
  const totalPaid = households.reduce((s, h) => s + h.paid, 0);

  return (
    <>
      <PageHeader
        eyebrow="Community"
        title="Households"
        description="Group members by house to see one family's combined dues and payment behaviour."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Households" value={String(households.length)} icon={Home} tone="brand" />
        <StatCard label="Members covered" value={String(members.length)} icon={Users} tone="blue" />
        <StatCard label="Total billed" value={formatINR(totalBilled)} icon={Wallet} tone="slate" />
        <StatCard
          label="Collection rate"
          value={`${totalBilled ? Math.round((totalPaid / totalBilled) * 100) : 0}%`}
          icon={Wallet}
          tone="green"
        />
      </div>

      <div className="mt-5 mb-4 flex items-center gap-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search house number, mohalla or member…"
          className="w-full max-w-sm"
        />
        <span className="ml-auto text-[12px] text-ink-500">
          {filtered.length} households
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Search}
            title="No households found"
            description="Try a different house number or name."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((h) => {
            const due = h.billed - h.paid;
            const rate = h.billed ? Math.round((h.paid / h.billed) * 100) : 100;
            return (
              <Card key={`${h.mohalla}-${h.number}`} className="overflow-hidden">
                <CardHeader
                  title={
                    <span className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink-100 text-[11px] font-semibold text-ink-600">
                        #{h.number}
                      </span>
                      {h.mohalla.replace("Mohalla ", "")}
                    </span>
                  }
                  subtitle={`${h.members.length} member${h.members.length > 1 ? "s" : ""}`}
                  action={
                    due > 0 ? (
                      <Badge tone="amber">{formatINR(due)} due</Badge>
                    ) : (
                      <Badge tone="green" dot>
                        Clear
                      </Badge>
                    )
                  }
                />
                <div className="space-y-2 p-4">
                  {h.members.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5">
                      <Avatar name={m.name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12.5px] font-medium text-ink-800">
                          {m.name}
                        </p>
                        <p className="font-mono text-[10.5px] text-ink-400">
                          {m.code}
                        </p>
                      </div>
                      <span className="text-[11.5px] text-ink-500">
                        {m.feePaise === 0 ? "Waived" : formatINR(m.feePaise)}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="border-t border-ink-100 px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
                    <span className="text-ink-500">Paid {formatINR(h.paid)}</span>
                    <span
                      className={cn(
                        "font-semibold",
                        rate >= 90 ? "text-emerald-600" : rate >= 60 ? "text-amber-600" : "text-red-600"
                      )}
                    >
                      {rate}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        rate >= 90 ? "bg-emerald-500" : rate >= 60 ? "bg-amber-500" : "bg-red-500"
                      )}
                      style={{ width: `${rate}%` }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
