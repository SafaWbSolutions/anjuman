"use client";

import { useState } from "react";
import {
  Check,
  KeyRound,
  Lock,
  Plus,
  ShieldCheck,
  UserPlus,
  X,
} from "lucide-react";
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
  Select,
  Switch,
  toast,
} from "@/components/ui";
import { ROLE_LABEL, type Role } from "@/lib/types";
import { cn } from "@/lib/utils";

interface StaffUser {
  id: string;
  name: string;
  phone: string;
  email: string;
  role: Role;
  active: boolean;
  twoFA: boolean;
  lastSeen: string;
}

const USERS: StaffUser[] = [
  { id: "u1", name: "Muhammad Yusuf", phone: "+91 98765 43210", email: "sadar@bharauli.in", role: "sadar", active: true, twoFA: true, lastSeen: "2 min ago" },
  { id: "u2", name: "Abdul Karim", phone: "+91 98765 43211", email: "khajanchi@bharauli.in", role: "khajanchi", active: true, twoFA: true, lastSeen: "1 hour ago" },
  { id: "u3", name: "Nadeem Ahmad", phone: "+91 98765 43212", email: "secretary@bharauli.in", role: "secretary", active: true, twoFA: false, lastSeen: "Yesterday" },
  { id: "u4", name: "Haji Ashraf Ali", phone: "+91 98765 43213", email: "auditor@bharauli.in", role: "auditor", active: true, twoFA: true, lastSeen: "3 days ago" },
  { id: "u5", name: "Imran Qureshi", phone: "+91 98765 43214", email: "collector@bharauli.in", role: "collector", active: true, twoFA: false, lastSeen: "4 hours ago" },
  { id: "u6", name: "Sajid Ali", phone: "+91 98765 43215", email: "sajid@bharauli.in", role: "collector", active: false, twoFA: false, lastSeen: "2 months ago" },
];

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

export default function RolesPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [users, setUsers] = useState(USERS);

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
            <CardHeader title="People with access" subtitle={`${users.filter((u) => u.active).length} active`} />
            <div className="divide-y divide-ink-100">
              {users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={u.name} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium text-ink-900">{u.name}</p>
                      {u.twoFA && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                          <ShieldCheck className="h-3 w-3" /> 2FA
                        </span>
                      )}
                      {!u.active && <Badge tone="slate">Disabled</Badge>}
                    </div>
                    <p className="text-[11.5px] text-ink-500">
                      {u.email} · {u.phone}
                    </p>
                    <p className="text-[10.5px] text-ink-400">Last active {u.lastSeen}</p>
                  </div>
                  <Select
                    value={u.role}
                    onChange={(e) =>
                      setUsers((prev) =>
                        prev.map((x) =>
                          x.id === u.id ? { ...x, role: e.target.value as Role } : x
                        )
                      )
                    }
                    className="w-auto py-1.5 text-[12px]"
                  >
                    {MATRIX_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </Select>
                  <Switch
                    checked={u.active}
                    onChange={(v) => {
                      setUsers((prev) =>
                        prev.map((x) => (x.id === u.id ? { ...x, active: v } : x))
                      );
                      toast(v ? "Access enabled" : "Access disabled");
                    }}
                  />
                </div>
              ))}
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
                        {ROLE_LABEL[r].split(" ")[0]}
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
              {[
                { who: "Sadar Muhammad Yusuf", what: "Approved expense ₹3,850", when: "10 min ago" },
                { who: "Khajanchi Abdul Karim", what: "Verified payment ₹500", when: "1 hour ago" },
                { who: "Secretary Nadeem Ahmad", what: "Added member BHR-000031-9", when: "3 hours ago" },
                { who: "Auditor Haji Ashraf Ali", what: "Exported audit pack", when: "Yesterday" },
                { who: "Sadar Muhammad Yusuf", what: "Changed collector access", when: "2 days ago" },
              ].map((l) => (
                <div key={l.what} className="px-5 py-3">
                  <p className="text-[12px] font-medium text-ink-800">{l.what}</p>
                  <p className="text-[11px] text-ink-500">
                    {l.who} · {l.when}
                  </p>
                </div>
              ))}
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
            <Button onClick={() => { toast("Invite sent"); setAddOpen(false); }}>
              <KeyRound className="h-4 w-4" /> Send invite
            </Button>
          </div>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" className="sm:col-span-2">
            <Input placeholder="e.g. Imran Qureshi" />
          </Field>
          <Field label="Mobile">
            <Input placeholder="+91 …" inputMode="tel" />
          </Field>
          <Field label="Email">
            <Input type="email" placeholder="name@example.com" />
          </Field>
          <Field label="Role" className="sm:col-span-2">
            <Select defaultValue="collector">
              {MATRIX_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
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
