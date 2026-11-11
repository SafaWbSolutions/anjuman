"use client";

import { useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  Camera,
  IdCard,
  KeyRound,
  Loader2,
  Mail,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { getMyMember, saveMyProfile, uploadAvatar } from "@/lib/repo";
import type { Member } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";
import { isDemoMode, supabase } from "@/lib/supabase";
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  PhoneInput,
  toast,
} from "@/components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MyProfilePage() {
  const { user, updateLocalUser, refreshUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [member, setMember] = useState<Member | null>(null);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setPhone(user.phone);
    setEmail(user.email);
    setPhotoUrl(user.photoUrl ?? null);
    void getMyMember().then(setMember).catch(() => setMember(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function pickPhoto(file: File | undefined) {
    if (!file || !user) return;
    if (!file.type.startsWith("image/")) {
      toast("Sirf image file chuno (JPG / PNG)", "error");
      return;
    }
    if (file.size > 3 * 1024 * 1024) {
      toast("Photo 3 MB se chhoti honi chahiye", "error");
      return;
    }
    setUploading(true);
    try {
      const url = await uploadAvatar(file, user.id);
      setPhotoUrl(url);
      toast("Photo upload ho gayi — ab Save dabao");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Photo upload nahi hui", "error");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    const cleanPhone = phone.replace(/\D/g, "");
    if (!name.trim()) return toast("Naam likho", "error");
    if (cleanPhone && cleanPhone.length !== 10) {
      return toast("Mobile number 10 digit ka hona chahiye", "error");
    }
    if (email.trim() && !EMAIL_RE.test(email.trim())) {
      return toast("Sahi email daalo", "error");
    }

    setSaving(true);
    try {
      await saveMyProfile({
        name,
        phone: cleanPhone,
        email: email.trim(),
        photoUrl,
      });
      updateLocalUser({
        name: name.trim(),
        phone: cleanPhone,
        email: email.trim().toLowerCase(),
        photoUrl,
      });
      if (!isDemoMode) await refreshUser();
      toast("Profile save ho gayi");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Profile save nahi hui", "error");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    if (password.length < 6) return toast("Password kam se kam 6 characters", "error");
    if (password !== confirm) return toast("Dono password match nahi kar rahe", "error");
    if (!supabase) return toast("Supabase configured nahi hai", "error");
    setChanging(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setPassword("");
      setConfirm("");
      toast("Password badal gaya");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Password nahi badla", "error");
    } finally {
      setChanging(false);
    }
  }

  if (!user) return null;

  return (
    <>
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Apni photo, naam, mobile aur email khud badlo — sab panels mein yehi details dikhengi."
        actions={
          <Button onClick={() => void save()} loading={saving}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Profile photo" subtitle="ID card aur panel dono par dikhegi" />
          <div className="flex flex-col items-center gap-4 p-6">
            <div className="relative">
              <Avatar
                name={name || user.name}
                size="lg"
                photoUrl={photoUrl}
                className="h-24 w-24 text-2xl"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-brand-600 text-white shadow-md hover:bg-brand-700 disabled:opacity-60"
                aria-label="Change photo"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
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
            <div className="text-center">
              <p className="text-[15px] font-semibold text-ink-900">{name || user.name}</p>
              <p className="mt-0.5 text-[12px] text-ink-500">{ROLE_LABEL[user.role]}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5">
                <Badge tone="brand">{user.tenantName || "Platform"}</Badge>
                {member && <Badge tone="slate">{member.code}</Badge>}
              </div>
            </div>
            <p className="text-center text-[11.5px] leading-relaxed text-ink-400">
              JPG / PNG · max 3 MB. Photo tab badalti hai jab <b>Save changes</b> dabao.
            </p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Personal details" subtitle="Mobile 10 digit par locked hai" />
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Full name" className="sm:col-span-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Muhammad Idris"
                autoComplete="name"
              />
            </Field>

            <Field label="Mobile number" hint="Sirf 10 digit · +91 apne aap lagega">
              <PhoneInput value={phone} onChange={setPhone} />
            </Field>

            <Field label="Email (contact)" hint="Login ID alag hota hai, wo neeche dikh raha hai">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>

            <Field label="Role">
              <Input value={ROLE_LABEL[user.role]} disabled />
            </Field>

            <Field label="Anjuman">
              <Input value={user.tenantName || "Platform admin"} disabled />
            </Field>

            <Field label="Login email (read-only)" className="sm:col-span-2">
              <Input
                value={user.email || "—"}
                disabled
                icon={Mail}
                title="Login email badalne ke liye platform admin se sampark karein"
              />
            </Field>

            {member && (
              <>
                <Field label="Member ID">
                  <Input value={member.code} disabled icon={IdCard} />
                </Field>
                <Field label="Father's name">
                  <Input value={member.fatherName || "—"} disabled />
                </Field>
                <Field label="Mohalla">
                  <Input value={member.mohalla || "—"} disabled />
                </Field>
                <Field label="House number">
                  <Input value={member.household || "—"} disabled />
                </Field>
                <p className="text-[11.5px] leading-relaxed text-ink-500 sm:col-span-2">
                  Member ID, mohalla aur ghar ka number sirf anjuman office badal sakta hai.
                  Baaki sab kuch aap khud edit kar sakte ho.
                </p>
              </>
            )}
          </div>
        </Card>

        {!isDemoMode && (
          <Card className="lg:col-span-3">
            <CardHeader
              title="Password"
              subtitle="Apna login password badlo"
              action={
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" /> Secure session
                </span>
              }
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="New password" hint="Kam se kam 6 characters">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  icon={KeyRound}
                />
              </Field>
              <Field label="Confirm new password">
                <Input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  icon={KeyRound}
                />
              </Field>
              <div className="sm:col-span-2">
                <Button
                  variant="secondary"
                  onClick={() => void changePassword()}
                  loading={changing}
                  disabled={!password || !confirm}
                >
                  <BadgeCheck className="h-4 w-4" /> Update password
                </Button>
              </div>
            </div>
          </Card>
        )}
      </div>

      <div className="mt-5 flex items-center gap-2 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-[12px] leading-relaxed text-brand-900">
        <UserRound className="h-4 w-4 shrink-0" />
        Ye details receipts, ID card aur member portal par automatically use hoti hain.
      </div>
    </>
  );
}
