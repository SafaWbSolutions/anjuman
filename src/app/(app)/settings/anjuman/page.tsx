"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  ImagePlus,
  MapPin,
  Phone,
  Save,
  ShieldCheck,
} from "lucide-react";
import { activeTenant } from "@/lib/mock";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  toast,
} from "@/components/ui";

export default function AnjumanProfilePage() {
  const [upi, setUpi] = useState(activeTenant.upiId);
  const [regNo, setRegNo] = useState(activeTenant.regNo);

  return (
    <>
      <PageHeader
        eyebrow="Settings"
        title="Anjuman profile"
        description="This information appears on receipts, ID cards, notices and the member app."
        actions={
          <Button onClick={() => toast("Profile saved")}>
            <Save className="h-4 w-4" /> Save changes
          </Button>
        }
      />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Identity" subtitle="Legal name and registration" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Anjuman / committee name" className="sm:col-span-2">
                <Input defaultValue={activeTenant.name} />
              </Field>
              <Field label="Masjid name">
                <Input defaultValue={activeTenant.masjid} />
              </Field>
              <Field label="Registration number">
                <Input value={regNo} onChange={(e) => setRegNo(e.target.value)} />
              </Field>
              <Field label="Village / town">
                <Input defaultValue={activeTenant.village} />
              </Field>
              <Field label="District">
                <Input defaultValue={activeTenant.district} />
              </Field>
              <Field label="State">
                <Select defaultValue={activeTenant.state}>
                  <option>Uttar Pradesh</option>
                  <option>Bihar</option>
                  <option>West Bengal</option>
                  <option>Maharashtra</option>
                  <option>Karnataka</option>
                  <option>Telangana</option>
                  <option>Other</option>
                </Select>
              </Field>
              <Field label="PIN code">
                <Input defaultValue={activeTenant.pincode} inputMode="numeric" />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Contact" subtitle="Shown to members for queries" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Committee phone">
                <Input defaultValue={activeTenant.phone} />
              </Field>
              <Field label="WhatsApp number">
                <Input defaultValue={activeTenant.phone} />
              </Field>
              <Field label="Email">
                <Input type="email" defaultValue="office@bharaulimasjid.in" />
              </Field>
              <Field label="Website (optional)">
                <Input placeholder="https://…" />
              </Field>
              <Field label="Full address" className="sm:col-span-2">
                <textarea
                  className="input min-h-[80px] resize-y"
                  defaultValue={`${activeTenant.masjid}, ${activeTenant.village}, ${activeTenant.district}, ${activeTenant.state} — ${activeTenant.pincode}`}
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader title="Branding" subtitle="Used on ID cards and the member app" />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="label">Logo</label>
                <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 text-ink-500">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[11.5px]">Upload PNG (min 512×512)</span>
                </div>
              </div>
              <div>
                <label className="label">Masjid photo</label>
                <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-ink-300 bg-ink-50/50 text-ink-500">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-[11.5px]">Shown on the home screen</span>
                </div>
              </div>
              <Field label="Member ID prefix" hint="Used for every member ID, e.g. BHR-000123-7">
                <Input defaultValue={activeTenant.code} maxLength={4} className="font-mono uppercase" />
              </Field>
              <Field label="Theme colour">
                <div className="flex gap-2">
                  {["#059669", "#0ea5e9", "#7c3aed", "#d97706", "#dc2626"].map((c) => (
                    <button
                      key={c}
                      className="h-10 w-10 rounded-xl ring-2 ring-white ring-offset-2 ring-offset-ink-100"
                      style={{ background: c }}
                      onClick={() => toast("Theme colour updated")}
                      aria-label={`Theme ${c}`}
                    />
                  ))}
                </div>
              </Field>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="overflow-hidden">
            <div className="bg-ink-900 p-5 text-white">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-sm font-bold">
                  {activeTenant.code}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{activeTenant.name}</p>
                  <p className="text-[11px] text-ink-400">Verified anjuman</p>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-[11.5px] text-ink-300">
                <p className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" /> {activeTenant.village}, {activeTenant.district}
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="h-3 w-3" /> {activeTenant.phone}
                </p>
                <p className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3 w-3" /> Reg {regNo}
                </p>
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-ink-500">Public link</span>
                <button
                  className="inline-flex items-center gap-1 font-medium text-brand-700"
                  onClick={() => toast("Link copied")}
                >
                  <Copy className="h-3 w-3" /> Copy
                </button>
              </div>
              <p className="mt-1 truncate rounded-lg bg-ink-50 px-2.5 py-1.5 font-mono text-[11px] text-ink-600">
                anjuman.app/bharauli
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Verification" subtitle="Required for the verified badge" />
            <div className="space-y-3 p-5 text-[12px]">
              {[
                { label: "Phone verified", done: true },
                { label: "Registration certificate", done: true },
                { label: "Bank account verified", done: true },
                { label: "PAN / trust deed", done: false },
              ].map((v) => (
                <div key={v.label} className="flex items-center justify-between">
                  <span className="text-ink-600">{v.label}</span>
                  {v.done ? (
                    <Badge tone="green" dot>Done</Badge>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => toast("Upload requested")}>
                      Upload
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
              <p className="text-[11.5px] leading-relaxed text-ink-500">
                Changes to the name or registration number are logged and require
                platform verification. This prevents impersonation of another
                committee.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
