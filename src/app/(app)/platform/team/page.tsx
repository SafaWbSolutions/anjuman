"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Role } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";
import {
  listAllAccounts,
  setAccountActive,
  setAccountRole,
  type PlatformAccount,
} from "@/lib/repo";
import { formatDate } from "@/lib/utils";
import {
  Avatar,
  Badge,
  Button,
  Card,
  PageHeader,
  SearchInput,
  Select,
  TableWrap,
  Td,
  Th,
  toast,
} from "@/components/ui";

const ROLES: Role[] = [
  "super_admin",
  "sadar",
  "khajanchi",
  "secretary",
  "auditor",
  "collector",
  "member",
];

export default function GlobalTeamPage() {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<PlatformAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAccounts(await listAllAccounts());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accounts load nahi ho sake");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tenants = useMemo(
    () => Array.from(new Set(accounts.map((a) => a.tenantName))).sort(),
    [accounts]
  );

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return accounts.filter((a) => {
      if (tenantFilter !== "all" && a.tenantName !== tenantFilter) return false;
      if (!term) return true;
      return (
        a.name.toLowerCase().includes(term) ||
        a.email.toLowerCase().includes(term) ||
        a.phone.includes(term) ||
        a.memberCode.toLowerCase().includes(term)
      );
    });
  }, [accounts, q, tenantFilter]);

  async function changeRole(a: PlatformAccount, role: Role) {
    if (a.id === user?.id) {
      toast("Apni role yahan se change nahi kar sakte", "error");
      return;
    }
    setBusyId(a.id);
    try {
      await setAccountRole(a.id, role);
      setAccounts((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, role } : x))
      );
      toast(`${a.name} → ${ROLE_LABEL[role]}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Role change nahi hui", "error");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(a: PlatformAccount) {
    if (a.id === user?.id) {
      toast("Apna account band nahi kar sakte", "error");
      return;
    }
    setBusyId(a.id);
    try {
      await setAccountActive(a.id, !a.active);
      setAccounts((prev) =>
        prev.map((x) => (x.id === a.id ? { ...x, active: !a.active } : x))
      );
      toast(`${a.name} ${a.active ? "disabled" : "enabled"}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update fail", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Team & access"
        description="Har anjuman ke saare logins ek jagah. Role badlo ya account band karo — sab kuch database-level par enforce hota hai."
        actions={
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
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

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-72">
          <SearchInput
            value={q}
            onChange={setQ}
            placeholder="Naam, email, mobile, member code…"
          />
        </div>
        <Select
          value={tenantFilter}
          onChange={(e) => setTenantFilter(e.target.value)}
          className="w-auto py-2 text-[12.5px]"
        >
          <option value="all">All anjumans</option>
          {tenants.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">
          {rows.length} account(s)
        </span>
      </div>

      <Card>
        <TableWrap>
          <thead>
            <tr>
              <Th>Account</Th>
              <Th>Anjuman</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th className="text-right">Access</Th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-ink-500">
                  Accounts load ho rahe hain…
                </td>
              </tr>
            )}
            {rows.map((a) => {
              const self = a.id === user?.id;
              return (
                <tr key={a.id}>
                  <Td>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={a.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-ink-900">
                          {a.name}
                          {self && (
                            <span className="ml-1.5 text-[10px] text-brand-700">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="truncate text-[11px] text-ink-500">
                          {a.email || a.phone || "—"}
                        </p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-[12px] text-ink-600">
                    {a.tenantName}
                    {a.memberCode && (
                      <span className="ml-1 font-mono text-[10px] text-ink-400">
                        {a.memberCode}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <Select
                      value={a.role}
                      disabled={self || busyId === a.id}
                      onChange={(e) => void changeRole(a, e.target.value as Role)}
                      className="w-auto py-1.5 text-[12px]"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  </Td>
                  <Td>
                    {a.active ? (
                      <Badge tone="green" dot>
                        Active
                      </Badge>
                    ) : (
                      <Badge tone="slate" dot>
                        Disabled
                      </Badge>
                    )}
                  </Td>
                  <Td className="text-[11.5px] text-ink-500">
                    {formatDate(a.createdAt)}
                  </Td>
                  <Td className="text-right">
                    <button
                      onClick={() => void toggleActive(a)}
                      disabled={self || busyId === a.id}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink-600 hover:bg-ink-50 disabled:opacity-40"
                    >
                      {a.active ? (
                        <>
                          <UserX className="h-3.5 w-3.5" /> Disable
                        </>
                      ) : (
                        <>
                          <UserCheck className="h-3.5 w-3.5" /> Enable
                        </>
                      )}
                    </button>
                  </Td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-ink-400">
                  <Search className="mx-auto h-5 w-5" />
                  <p className="mt-2 text-[12.5px]">Koi account nahi mila.</p>
                </td>
              </tr>
            )}
          </tbody>
        </TableWrap>
      </Card>

      <div className="mt-4 flex flex-wrap gap-4 rounded-xl border border-ink-100 bg-ink-50/50 p-4 text-[11.5px] leading-relaxed text-ink-600">
        <p className="inline-flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 text-emerald-600" />
          Role change turant lagta hai — agla request usi naye role se chalega.
        </p>
        <p className="inline-flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 text-amber-600" />
          Disable karne par login block ho jata hai, data safe rehta hai.
        </p>
      </div>
    </>
  );
}
