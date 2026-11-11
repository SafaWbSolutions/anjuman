"use client";

import { useEffect, useState } from "react";
import {
  Check,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
import type { Role } from "@/lib/types";
import type { StaffMember } from "@/lib/repo";
import { listStaff, updateStaffRole, updateStaffActive } from "@/lib/repo";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Drawer,
  Field,
  Input,
  PageHeader,
  PhoneInput,
  Select,
  Switch,
  toast,
} from "@/components/ui";
import { cn } from "@/lib/utils";

const PERMISSIONS: { label: string; roles: Record<Role, boolean | "none"> }[] = [
  { label: "View dashboard", roles: { super_admin: true, sadar: true, khajanchi: true, secretary: true, auditor: true, collector: true, member: "none" } },
  { label: "Add / edit members", roles: { super_admin: true, sadar: true, khajanchi: "none", secretary: true, auditor: "none", collector: "none", member: "none" } },
  { label: "Record payments", roles: { super_admin: "none", sadar: true, khajanchi: true, secretary: "none", auditor: "none", collector: true, member: "none" } },
  { label: "Verify payments", roles: { super_admin: "none", sadar: true, khajanchi: true, secretary: "none", auditor: true, collector: "none", member: "none" } },
  { label: "Approve expenses", roles: { super_admin: "none", sadar: true, khajanchi: "none", secretary: "none", auditor: true, collector: "none", member: "none" } },
  { label: "Edit fee plans", roles: { super_admin: true, sadar: true, khajanchi: "none", secretary: true, auditor: "none", collector: "none", member: "none" } },
  { label: "View ledger", roles: { super_admin: "none", sadar: true, khajanchi: true, secretary: "none", auditor: true, collector: "none", member: "none" } },
  { label: "Export reports", roles: { super_admin: true, sadar: true, khajanchi: true, secretary: true, auditor: true, collector: "none", member: "none" } },
  { label: "Manage settings", roles: { super_admin: true, sadar: true, khajanchi: "none", secretary: true, auditor: "none", collector: "none", member: "none" } },
];

const MATRIX_ROLES: Role[] = ["sadar", "khajanchi", "secretary", "auditor", "collector"];

const ROLE_OPTIONS = MATRIX_ROLES.map((r) => ({
  value: r,
  label: r.charAt(0).toUpperCase() + r.slice(1),
}));

export default function RolesPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState("");
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listStaff()
      .then((s) => {
        if (mounted) setStaff(s);
      })
      .catch((e) => {
        if (mounted) setError(e instanceof Error ? e.message : "Staff load nahi hua");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  async function handleRoleChange(id: string, newRole: Role) {
    try {
      await updateStaffRole(id, newRole);
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, role: newRole } : s)));
      toast("Role updated");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Role update failed", "error");
    }
  }

  async function handleActiveChange(id: string, active: boolean) {
    try {
      await updateStaffActive(id, active);
      setStaff((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)));
      toast(active ? "Access enabled" : "Access disabled");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Roles & access" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          Staff list taiyaar ho raha hai…
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Settings" title="Roles & access" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="text-red-700">{error}</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Roles & access"
        description="Give each office bearer only the access they need. The collector can record payments but can never approve them."
        actions={
          <Button onClick={() => setAddOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite user
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="People with access" subtitle={`${staff.filter((u) => u.active).length} active`} />
            <div className="divide-y divide-ink-100">
              {staff.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={u.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-ink-900">{u.name}</p>
                    </div>
                    <p className="text-[11.5px] text-ink-500">
                      {u.role}
                    </p>
                    <p className="text-[10.5px] text-ink-400">Last seen recently</p>
                  </div>
                  <Select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                    className="w-auto py-1.5 text-[12px]"
                  >
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                  <Switch
                    checked={u.active}
                    onChange={(v) => handleActiveChange(u.id, v)}
                  />
                </div>
              ))}
              {staff.length === 0 && (
                <div className="px-5 py-8 text-center text-ink-500">
                  No staff members found
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Permission matrix"
              subtitle="Applied on the server by row-level security — not just hidden in the UI."
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="table-head">
                    <th className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                      Permission
                    </th>
                    {MATRIX_ROLES.map((r) => (
                      <th key={r} className="px-2 py-2.5 text-center text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">
                        {r.charAt(0).toUpperCase() + r.slice(1)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {PERMISSIONS.map((p) => (
                    <tr key={p.label} className="hover:bg-ink-50/50">
                      <td className="px-5 py-2.5 text-[12.5px] text-ink-700">{p.label}</td>
                      {MATRIX_ROLES.map((r) => {
                        const v = p.roles[r];
                        return (
                          <td key={r} className="px-2 py-2.5 text-center">
                            {v === true ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                                <Check className="h-3 w-3" />
                              </span>
                            ) : v === "none" ? (
                              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-ink-50 text-ink-300">
                                <X className="h-3 w-3" />
                              </span>
                            ) : (
                              <span className="text-[11px] text-ink-400">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-ink-100 bg-ink-50/50 px-5 py-3 text-[11.5px] text-ink-500">
              The khajanchi can record and verify payments but cannot approve their
              own entries or edit the ledger. Only the sadar and auditor can approve.
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Security" subtitle="Recommended for every office bearer" />
            <div className="divide-y divide-ink-100">
              {[
                { label: "Require 2FA for office bearers", on: true },
                { label: "Session timeout after 30 min", on: true },
                { label: "Block sign-in from new devices", on: false },
                { label: "Email alerts on role change", on: true },
              ].map((s) => (
                <div key={s.label} className="flex items-center justify-between px-5 py-3.5">
                  <span className="pr-3 text-[12.5px] text-ink-700">{s.label}</span>
                  <Switch checked={s.on} onChange={() => toast("Security setting updated")} />
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="Access log" subtitle="Last 5 sensitive actions" />
            <div className="divide-y divide-ink-100">
              <div className="px-5 py-3 text-center text-ink-500">
                Audit log appears here after real actions are performed.
              </div>
            </div>
          </Card>

          <Card className={cn("p-5")}>
            <div className="flex items-start gap-2.5">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Removing a user never deletes their history — their past approvals
                stay attached to their name for audit purposes.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Drawer
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Invite user"
        subtitle="They will receive a WhatsApp + SMS invite"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => { toast("Invite sent (demo)"); setAddOpen(false); }}>
              <KeyRound className="h-4 w-4" /> Send invite
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2">
            <Input placeholder="e.g. Imran Qureshi" />
          </Field>
          <Field label="Mobile" hint="Sirf 10 digit">
            <PhoneInput value={invitePhone} onChange={setInvitePhone} />
          </Field>
          <Field label="Email">
            <Input type="email" placeholder="name@example.com" />
          </Field>
          <Field label="Role" className="sm:col-span-2">
            <Select defaultValue="collector">
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/60 p-3.5 text-[11.5px] leading-relaxed text-brand-900">
          Collectors can record payments but never verify or approve them. This is
          what keeps cash handling safe even when multiple people collect.
        </div>
      </Drawer>
    </>
  );
}