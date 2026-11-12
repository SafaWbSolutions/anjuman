"use client";

import { useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  FileText,
  Mail,
  Paperclip,
  ShieldCheck,
  Upload,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { Button, Field, Input, PhoneInput, Select } from "@/components/ui";
import { INDIAN_STATES } from "@/lib/states";
import {
  submitRegistrationRequest,
  uploadRegistrationDoc,
} from "@/lib/repo";
import { cn } from "@/lib/utils";

export function RegistrationRequestForm({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [isRegistered, setIsRegistered] = useState(false);
  const [regNo, setRegNo] = useState("");
  const [anjumanName, setAnjumanName] = useState("");
  const [address, setAddress] = useState("");
  const [district, setDistrict] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [totalMembers, setTotalMembers] = useState("");

  const [sadarName, setSadarName] = useState("");
  const [sadarPhone, setSadarPhone] = useState("");
  const [sadarEmail, setSadarEmail] = useState("");
  const [sadarKyc, setSadarKyc] = useState<File | null>(null);

  const [khajanchiName, setKhajanchiName] = useState("");
  const [khajanchiPhone, setKhajanchiPhone] = useState("");
  const [khajanchiEmail, setKhajanchiEmail] = useState("");
  const [khajanchiKyc, setKhajanchiKyc] = useState<File | null>(null);

  const [proof, setProof] = useState<File | null>(null);
  const [contactEmail, setContactEmail] = useState("");
  const [note, setNote] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  if (!open) return null;

  function close() {
    if (busy) return;
    onClose();
  }

  function validate(): string | null {
    if (!anjumanName.trim()) return "Anjuman ka naam likho";
    if (!address.trim()) return "Anjuman ka address likho";
    if (!sadarName.trim()) return "Sadar ka naam likho";
    if (sadarPhone.replace(/\D/g, "").length !== 10)
      return "Sadar ka mobile number 10 digit hona chahiye";
    if (khajanchiPhone && khajanchiPhone.replace(/\D/g, "").length !== 10)
      return "Khajanchi ka mobile number 10 digit hona chahiye";
    if (totalMembers && Number(totalMembers) < 0)
      return "Total members sahi likho";
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const [sadarKycPath, khajanchiKycPath, proofPath] = await Promise.all([
        sadarKyc ? uploadRegistrationDoc(sadarKyc, "sadar-kyc", token) : Promise.resolve(""),
        khajanchiKyc
          ? uploadRegistrationDoc(khajanchiKyc, "khajanchi-kyc", token)
          : Promise.resolve(""),
        proof ? uploadRegistrationDoc(proof, "proof", token) : Promise.resolve(""),
      ]);

      const id = await submitRegistrationRequest({
        anjumanName: anjumanName.trim(),
        address: address.trim(),
        district: district.trim() || undefined,
        state: stateName || undefined,
        pincode: pincode.trim() || undefined,
        totalMembers: totalMembers ? Number(totalMembers) : undefined,
        isRegistered,
        regNo: isRegistered ? regNo.trim() || undefined : undefined,
        sadarName: sadarName.trim(),
        sadarPhone: sadarPhone.replace(/\D/g, ""),
        sadarEmail: sadarEmail.trim() || undefined,
        sadarKycUrl: sadarKycPath || undefined,
        khajanchiName: khajanchiName.trim() || undefined,
        khajanchiPhone: khajanchiPhone
          ? khajanchiPhone.replace(/\D/g, "")
          : undefined,
        khajanchiEmail: khajanchiEmail.trim() || undefined,
        khajanchiKycUrl: khajanchiKycPath || undefined,
        proofUrl: proofPath || undefined,
        contactEmail: contactEmail.trim() || undefined,
        note: note.trim() || undefined,
      });

      setSuccessId(id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Request submit nahi hui — dobara try karein"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/60 p-4 backdrop-blur-sm sm:p-6">
      <div className="my-4 w-full max-w-3xl overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-ink-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <p className="text-[15px] font-semibold text-ink-900">
                Anjuman Registration Request
              </p>
              <p className="text-[12px] text-ink-500">
                Details bhariye — Super Admin verify karke aapka anjuman account
                bana denge.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
            aria-label="Close"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {successId ? (
          <div className="p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="h-7 w-7" />
            </span>
            <h3 className="mt-4 text-lg font-semibold text-ink-900">
              Request submit ho gayi
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-ink-600">
              Aapki request Super Admin ke paas pahunch gayi hai. Verify hone ke
              baad aapke Sadar/Khajanchi email par login details bhej di jayengi.
            </p>
            <p className="mt-3 inline-flex rounded-lg bg-ink-50 px-3 py-1.5 font-mono text-[11.5px] text-ink-500">
              Ref: {successId.slice(0, 8).toUpperCase()}
            </p>
            <div className="mt-6 flex justify-center">
              <Button onClick={onClose}>Done</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-6 p-5 sm:p-6">
            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Anjuman */}
            <section className="space-y-4">
              <SectionTitle icon={Building2} title="Anjuman ki details" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Anjuman ka naam" className="sm:col-span-2">
                  <Input
                    required
                    value={anjumanName}
                    onChange={(e) => setAnjumanName(e.target.value)}
                    placeholder="e.g. Anjuman Islamia, Rahmat Nagar"
                  />
                </Field>
                <Field label="Pura address" className="sm:col-span-2">
                  <textarea
                    required
                    rows={2}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Mohalla, gaon / shahar, landmark"
                    className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </Field>
                <Field label="District">
                  <Input
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="District"
                  />
                </Field>
                <Field label="State">
                  <Select
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                  >
                    <option value="">Select state</option>
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Pincode">
                  <Input
                    value={pincode}
                    onChange={(e) =>
                      setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="6-digit pincode"
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Total members">
                  <Input
                    value={totalMembers}
                    onChange={(e) =>
                      setTotalMembers(e.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    placeholder="e.g. 250"
                    inputMode="numeric"
                  />
                </Field>
              </div>

              <div className="rounded-xl border border-ink-100 bg-ink-50/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[12.5px] font-medium text-ink-800">
                      Anjuman pehle se registered hai?
                    </p>
                    <p className="text-[11px] text-ink-500">
                      Registration number dena optional hai.
                    </p>
                  </div>
                  <div className="flex rounded-lg border border-ink-200 bg-white p-0.5">
                    {[false, true].map((v) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setIsRegistered(v)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-[12px] font-medium transition",
                          isRegistered === v
                            ? "bg-brand-600 text-white"
                            : "text-ink-500 hover:text-ink-800"
                        )}
                      >
                        {v ? "Haan" : "Nahi"}
                      </button>
                    ))}
                  </div>
                </div>
                {isRegistered && (
                  <Field
                    label="Registration number (optional)"
                    className="mt-3"
                    hint="Society / trust registration number, agar hai."
                  >
                    <Input
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      placeholder="e.g. UP/2019/0123456"
                      className="font-mono"
                    />
                  </Field>
                )}
              </div>
            </section>

            {/* Sadar */}
            <section className="space-y-4">
              <SectionTitle icon={ShieldCheck} title="Sadar ki details" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Sadar ka naam" className="sm:col-span-2">
                  <Input
                    required
                    value={sadarName}
                    onChange={(e) => setSadarName(e.target.value)}
                    placeholder="Pura naam"
                  />
                </Field>
                <Field label="Mobile number" hint="Sirf 10 digit, bina +91.">
                  <PhoneInput
                    value={sadarPhone}
                    onChange={(v) => setSadarPhone(v.replace(/\D/g, "").slice(0, 10))}
                  />
                </Field>
                <Field label="Email">
                  <Input
                    icon={Mail}
                    type="email"
                    value={sadarEmail}
                    onChange={(e) => setSadarEmail(e.target.value)}
                    placeholder="sadar@example.com"
                  />
                </Field>
              </div>
              <FileField
                label="Sadar KYC"
                hint="Aadhaar / PAN / voter ID (image ya PDF, max 5 MB)"
                file={sadarKyc}
                onChange={setSadarKyc}
              />
            </section>

            {/* Khajanchi */}
            <section className="space-y-4">
              <SectionTitle icon={Wallet} title="Khajanchi ki details" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Khajanchi ka naam" className="sm:col-span-2">
                  <Input
                    value={khajanchiName}
                    onChange={(e) => setKhajanchiName(e.target.value)}
                    placeholder="Pura naam"
                  />
                </Field>
                <Field label="Mobile number" hint="Sirf 10 digit, bina +91.">
                  <PhoneInput
                    value={khajanchiPhone}
                    onChange={(v) =>
                      setKhajanchiPhone(v.replace(/\D/g, "").slice(0, 10))
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    icon={Mail}
                    type="email"
                    value={khajanchiEmail}
                    onChange={(e) => setKhajanchiEmail(e.target.value)}
                    placeholder="khajanchi@example.com"
                  />
                </Field>
              </div>
              <FileField
                label="Khajanchi KYC"
                hint="Aadhaar / PAN / voter ID (image ya PDF, max 5 MB)"
                file={khajanchiKyc}
                onChange={setKhajanchiKyc}
              />
            </section>

            {/* Proof */}
            <section className="space-y-4">
              <SectionTitle icon={FileText} title="Anjuman ka proof" />
              <FileField
                label="Rasheed / letterhead / registration proof"
                hint="Koi bhi ek document jisse anjuman verify ho sake (image ya PDF, max 5 MB)"
                file={proof}
                onChange={setProof}
              />
              <Field label="Contact email (optional)" hint="Jawab yahan bhi bheja ja sakta hai.">
                <Input
                  icon={Mail}
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="aapka@example.com"
                />
              </Field>
              <Field label="Kuch aur batana hai? (optional)">
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Koi khaas baat, e.g. masjid + kabristan dono ka hisaab chahiye."
                  className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </Field>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-4">
              <p className="flex items-center gap-1.5 text-[11.5px] text-ink-500">
                <BadgeCheck className="h-3.5 w-3.5 text-brand-600" />
                Documents private rehte hain — sirf Super Admin dekh sakta hai.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy}>
                  {busy ? "Bhej rahe hain…" : "Submit request"}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function SectionTitle({
  icon: Icon,
  title,
}: {
  icon: typeof UserRound;
  title: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-ink-100 pb-2">
      <Icon className="h-4 w-4 text-brand-600" />
      <p className="text-[13px] font-semibold text-ink-900">{title}</p>
    </div>
  );
}

function FileField({
  label,
  hint,
  file,
  onChange,
}: {
  label: string;
  hint?: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      <label
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 transition",
          file
            ? "border-brand-300 bg-brand-50/60"
            : "border-ink-200 bg-white hover:border-brand-300"
        )}
      >
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            file ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500"
          )}
        >
          {file ? <Paperclip className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium text-ink-800">
            {file ? file.name : "Choose file to upload"}
          </span>
          <span className="block text-[11px] text-ink-500">
            {file
              ? `${(file.size / 1024).toFixed(0)} KB · click to change`
              : hint ?? "Image ya PDF"}
          </span>
        </span>
        {file && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(null);
            }}
            className="rounded-md p-1 text-ink-400 hover:bg-white hover:text-red-600"
            aria-label="Remove file"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <input
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && f.size > 5 * 1024 * 1024) {
              alert("File 5 MB se chhoti honi chahiye");
              e.target.value = "";
              return;
            }
            onChange(f);
          }}
        />
      </label>
    </div>
  );
}
