"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LifeBuoy,
  Mail,
  MessageSquare,
  Send,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { sendSupportMessage } from "@/lib/repo";
import {
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  toast,
} from "@/components/ui";

const TOPICS = [
  "Reactivation / suspended anjuman",
  "Plan, billing or expiry",
  "Technical problem",
  "Feature request",
  "Other",
];

export default function ContactAdminPage() {
  const { user } = useAuth();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) {
      toast("Message likho", "error");
      return;
    }
    setSending(true);
    try {
      await sendSupportMessage(
        subject.trim() ? `${topic} — ${subject.trim()}` : topic,
        message
      );
      setSent(true);
      setSubject("");
      setMessage("");
      toast("Message admin ko bhej diya gaya");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Message nahi gaya", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Help"
        title="Contact Admin"
        description="Seedha platform admin (Safa Web Solution) ko message bhejo — suspend, reactivate, plan ya kisi bhi problem ke liye."
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
        <Card>
          <CardHeader
            title="New message"
            subtitle={
              user?.tenantName
                ? `${user.tenantName} ki taraf se bheja jayega`
                : "Aapke account se bheja jayega"
            }
          />

          {sent ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <CheckCircle2 className="h-6 w-6" />
              </span>
              <p className="text-[14px] font-semibold text-ink-900">
                Message bhej diya gaya
              </p>
              <p className="max-w-sm text-[12.5px] text-ink-500">
                Admin jab jawab dega to aapko isi panel me update milega. Aur
                messages bhejne ke liye neeche button dabao.
              </p>
              <Button size="sm" variant="secondary" onClick={() => setSent(false)}>
                <Send className="h-3.5 w-3.5" /> Naya message
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="space-y-4 p-5 pt-0">
              <Field label="Topic">
                <Select value={topic} onChange={(e) => setTopic(e.target.value)}>
                  {TOPICS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subject" hint="Chhota sa title (optional).">
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Anjuman reactivate karwaana hai"
                />
              </Field>
              <Field label="Message">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={6}
                  placeholder="Apni problem ya request likho — anjuman ka naam, code aur detail ke saath."
                  className="w-full rounded-xl border border-ink-200 bg-white px-3.5 py-2.5 text-[13px] text-ink-800 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                />
              </Field>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[11.5px] text-ink-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  Admin ko aapka naam, email aur anjuman ki detail jayegi.
                </span>
                <Button type="submit" loading={sending}>
                  <Send className="h-3.5 w-3.5" /> Send to Admin
                </Button>
              </div>
            </form>
          )}
        </Card>

        <Card className="h-fit bg-gradient-to-br from-brand-900 via-ink-900 to-ink-900 p-5 text-white">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <LifeBuoy className="h-5 w-5 text-brand-300" />
          </span>
          <h3 className="mt-4 text-[15px] font-semibold">Safa Web Solution Support</h3>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-300">
            Aapki request seedha platform admin ke Support Inbox me jaati hai.
            Aapka data kabhi delete nahi hota — suspend ya expiry ke baad bhi
            reactivate karte hi sab kuch wapas milta hai.
          </p>
          <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-[12px] text-ink-300">
            <p className="flex items-center gap-2">
              <Mail className="h-3.5 w-3.5 text-brand-300" />
              noreply@bis24.in
            </p>
            <p className="flex items-center gap-2">
              <MessageSquare className="h-3.5 w-3.5 text-brand-300" />
              Reply aapke Support Inbox / email par
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
