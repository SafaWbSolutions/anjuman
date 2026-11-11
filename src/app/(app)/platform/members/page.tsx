"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Building,
  Search,
  UserCheck,
  UserPlus,
  Users,
  Loader2,
} from "lucide-react";
import type { Member } from "@/lib/types";
import { listAllMembers, setMemberActiveAcrossTenants, updateMemberAcrossTenants } from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  StatusPill,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";
import { formatINR } from "@/lib/utils";

export default function SuperAdminMembersPage() {
  const [q, setQ] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [members, setMembers] = useState<(Member & { tenantName: string })[]>([]);
  const [tenants, setTenants] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listAllMembers()
      .then((m) => {
        if (!mounted) return;
        setMembers(m);
        const tList = [...new Set(m.map((x) => ({ id: x.tenantId, name: x.tenantName })))];
        setTenants(tList);
        setLoading(false);
      })
      .catch((e) => {
        if (!mounted) return;
        setError(e instanceof Error ? e.message : "Members load nahi hue");
        setLoading(false);
      });
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return members.filter((m) => {
      if (tenantFilter !== "all" && m.tenantId !== tenantFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (!term) return true;
      return (
        m.name.toLowerCase().includes(term) ||
        m.code.toLowerCase().includes(term) ||
        m.phone.includes(term) ||
        m.tenantName.toLowerCase().includes(term)
      );
    });
  }, [q, tenantFilter, statusFilter, members]);

  const activeCount = members.filter((m) => m.status === "active").length;

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="All members" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Members taiyaar ho rahe hain…
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="All members" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="All members"
        description="Every member across all anjumans. Deactivate to block access without deleting data."
        actions={
          <Button variant="secondary">
            <UserPlus className="h-4 w-4" /> Add member
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total members" value={members.length.toLocaleString("en-IN")} sub="Across all anjumans" icon={Users} tone="brand" />
        <StatCard label="Active" value={activeCount.toLocaleString("en-IN")} sub="Can sign in" icon={UserCheck} tone="green" />
        <StatCard label="Inactive" value={(members.length - activeCount).toLocaleString("en-IN")} sub="Blocked access" icon={Ban} tone="red" />
        <StatCard label="Anjumans" value={tenants.length.toLocaleString("en-IN")} sub="Registered committees" icon={Building} tone="blue" />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput value={q} onChange={setQ} placeholder="Name, code, phone…" className="w-full sm:w-80" />
        <Select value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} className="w-auto py-2 text-[12.5px]">
          <option value="all">All anjumans</option>
          {tenants.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-auto py-2 text-[12.5px]">
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="pending">Pending</option>
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">{filtered.length} members</span>
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr className="table-head">
              <Th>Member</Th>
              <Th>Code</Th>
              <Th>Anjuman</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th>Fee / month</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {filtered.map((m) => (
              <tr key={m.id} className="hover:bg-ink-50/60">
                <Td>
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-100 text-[10px] font-semibold text-ink-600">
                      {m.name.split(" ").map((p) => p[0]).join("").toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] font-medium text-ink-900">{m.name}</p>
                      <p className="text-[11px] text-ink-500">{m.phone}</p>
                    </div>
                  </div>
                </Td>
                <Td>
                  <span className="font-mono text-[11.5px] text-ink-600">{m.code}</span>
                </Td>
                <Td>
                  <span className="text-[12px] text-ink-700">{m.tenantName}</span>
                </Td>
                <Td>
                  <Badge tone="slate" className="text-[10px]">
                    {m.type.charAt(0).toUpperCase() + m.type.slice(1)}
                  </Badge>
                </Td>
                <Td>
                  <StatusPill status={m.status} />
                </Td>
                <Td className="text-[12px] text-ink-700">{formatINR(m.feePaise)}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-1">
                    <button
                      onClick={() => {
                        const next = m.status === "active" ? false : true;
                        setSaving(m.id);
                        setMemberActiveAcrossTenants(m.id, m.tenantId, next)
                          .then(() => {
                            toast(next ? "Member activated" : "Member deactivated");
                            setSaving(null);
                            void loadMembers();
                          })
                          .catch((e) => {
                            toast(e instanceof Error ? e.message : "Action failed", "error");
                            setSaving(null);
                          });
                      }}
                      className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                      aria-label={m.status === "active" ? "Deactivate" : "Activate"}
                    >
                      {m.status === "active" ? (
                        <Ban className="h-4 w-4" />
                      ) : (
                        <UserCheck className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>

      {filtered.length === 0 && (
        <Card className="mt-5 p-8 text-center text-ink-500">
          No members found.
        </Card>
      )}
    </>
  );

  async function loadMembers() {
    setLoading(true);
    try {
      const m = await listAllMembers();
      setMembers(m);
      const tList = [...new Set(m.map((x) => ({ id: x.tenantId, name: x.tenantName })))];
      setTenants(tList);
    } finally {
      setLoading(false);
    }
  }
}
