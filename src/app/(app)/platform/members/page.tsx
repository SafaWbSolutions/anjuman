"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Building,
  Camera,
  Loader2,
  Pencil,
  Save,
  Search,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import type { Member } from "@/lib/types";
import {
  listAllMembers,
  saveMemberDetails,
  setMemberActiveAcrossTenants,
  updateMemberAcrossTenants,
  uploadAvatar,
} from "@/lib/repo";
import { useAuth } from "@/lib/auth";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Drawer,
  Field,
  Input,
  PageHeader,
  PhoneInput,
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
  const [editing, setEditing] = useState<(Member & { tenantName: string }) | null>(null);

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
                      onClick={() => setEditing(m)}
                      className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
                      aria-label="Edit member"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
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

      <PlatformMemberDrawer
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void loadMembers();
        }}
      />
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

function PlatformMemberDrawer({
  member,
  onClose,
  onSaved,
}: {
  member: (Member & { tenantName: string }) | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [father, setFather] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [house, setHouse] = useState("");
  const [mohalla, setMohalla] = useState("");
  const [blood, setBlood] = useState("");
  const [type, setType] = useState<Member["type"]>("member");
  const [status, setStatus] = useState<Member["status"]>("active");
  const [fee, setFee] = useState("0");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!member) return;
    setName(member.name);
    setFather(member.fatherName);
    setPhone(member.phone);
    setEmail(member.email ?? "");
    setHouse(member.household);
    setMohalla(member.mohalla);
    setBlood(member.bloodGroup ?? "");
    setType(member.type);
    setStatus(member.status);
    setFee(String(member.feePaise / 100));
    setPhotoUrl(member.photoUrl ?? null);
  }, [member?.id]);

  if (!member) return null;

  async function pickPhoto(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
      toast("JPG/PNG chuno, max 3 MB", "error");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file, user.id);
      setPhotoUrl(url);
      toast("Photo upload ho gayi — Save dabao");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Photo upload nahi hui", "error");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (!member) return;
    if (!name.trim()) return toast("Naam likho", "error");
    const cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone && cleanPhone.length !== 10) {
      return toast("Mobile number 10 digit ka hona chahiye", "error");
    }
    setSaving(true);
    try {
      await saveMemberDetails(member.id, {
        name,
        fatherName: father,
        phone: cleanPhone,
        email,
        household: house,
        mohalla,
        bloodGroup: blood,
        photoUrl,
      });
      await updateMemberAcrossTenants(member.id, member.tenantId, {
        type,
        status,
        feePaise: Math.round(Number(fee || "0") * 100),
      });
      toast("Member update ho gaya");
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save nahi hua", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={!!member}
      onClose={onClose}
      title={`Edit · ${member.name}`}
      subtitle={`${member.code} · ${member.tenantName}`}
      width="max-w-xl"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} loading={saving}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        </div>
      }
    >
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar name={name || member.name} size="lg" photoUrl={photoUrl} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow hover:bg-brand-700 disabled:opacity-60"
            aria-label="Change photo"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Camera className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void pickPhoto(e.target.files?.[0])}
          />
        </div>
        <p className="text-[12px] leading-relaxed text-ink-500">
          Photo ID card aur member portal par dikhegi. JPG/PNG · max 3 MB.
        </p>
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <Field label="Full name" className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Father's name">
          <Input value={father} onChange={(e) => setFather(e.target.value)} />
        </Field>
        <Field label="Mobile number" hint="Sirf 10 digit">
          <PhoneInput value={phone} onChange={setPhone} />
        </Field>
        <Field label="Email">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="House number">
          <Input value={house} onChange={(e) => setHouse(e.target.value)} />
        </Field>
        <Field label="Mohalla">
          <Input value={mohalla} onChange={(e) => setMohalla(e.target.value)} />
        </Field>
        <Field label="Blood group">
          <Input
            value={blood}
            onChange={(e) => setBlood(e.target.value.toUpperCase())}
            maxLength={3}
          />
        </Field>
        <Field label="Type">
          <Select value={type} onChange={(e) => setType(e.target.value as Member["type"])}>
            <option value="member">Member</option>
            <option value="donor">Donor</option>
            <option value="imam">Imam</option>
            <option value="muazzin">Muazzin</option>
            <option value="staff">Staff</option>
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as Member["status"])}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="pending">Pending</option>
          </Select>
        </Field>
        <Field label="Monthly chanda (₹)" className="sm:col-span-2">
          <Input value={fee} onChange={(e) => setFee(e.target.value)} inputMode="numeric" />
        </Field>
      </div>
    </Drawer>
  );
}
