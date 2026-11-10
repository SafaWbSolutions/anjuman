// ═══════════════════════════════════════════════════════════════
// Message templates.
//
// The same text is used for WhatsApp, SMS and email. WhatsApp
// templates need positional parameters, so `params` is the exact
// order to register in Meta Business Manager:
//
//   dues_reminder   {{1}} name  {{2}} month  {{3}} amount  {{4}} due  {{5}} masjid
//   overdue_notice  {{1}} name  {{2}} month  {{3}} amount  {{4}} due  {{5}} masjid
//   receipt_issued  {{1}} name  {{2}} amount {{3}} receipt {{4}} masjid
//   notice_alert    {{1}} title {{2}} body   {{3}} masjid
//   test_message    {{1}} masjid
//
// Keep this file and docs/AUTOMATION.md in sync.
// ═══════════════════════════════════════════════════════════════

export interface TenantInfo {
  name?: string | null;
  masjid?: string | null;
  phone?: string | null;
  upi_id?: string | null;
}

export interface RenderedMessage {
  text: string;
  subject: string;
  params: string[];
}

type Payload = Record<string, unknown>;

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

export function money(paise: unknown): string {
  const value = Number(paise ?? 0);
  const rupees = Number.isFinite(value) ? value / 100 : 0;
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: rupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return `₹${formatted}`;
}

function niceDate(value: unknown): string {
  const raw = text(value);
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function masjidOf(tenant: TenantInfo): string {
  return text(tenant.masjid) || text(tenant.name) || "Anjuman";
}

export function render(template: string, payload: Payload, tenant: TenantInfo): RenderedMessage {
  const name = text(payload.member_name) || text(payload.name) || "Sahab";
  const month = text(payload.month_label) || text(payload.period);
  const amount = money(payload.amount_paise);
  const due = niceDate(payload.due_date);
  const receipt = text(payload.receipt_no);
  const title = text(payload.title);
  const body = text(payload.body);
  const masjid = masjidOf(tenant);

  switch (template) {
    case "dues_reminder":
      return {
        subject: `${month} ka chanda — ${masjid}`,
        text:
          `Assalamu alaikum ${name}.\n\n` +
          `${month} ka chanda ${amount} abhi baaki hai. Aakhri tareekh: ${due}.\n` +
          `Aap seedha UPI se bhi jama kar sakte hain` +
          (tenant.upi_id ? `: ${tenant.upi_id}` : ".") +
          `\n\n— ${masjid}`,
        params: [name, month, amount, due, masjid],
      };

    case "overdue_notice":
      return {
        subject: `${month} ka chanda baaki — ${masjid}`,
        text:
          `Assalamu alaikum ${name}.\n\n` +
          `${month} ka ${amount} chanda abhi tak baaki hai (due ${due}). ` +
          `Kripya jaldi jama karein taaki hisaab saaf rahe.\n` +
          (tenant.upi_id ? `UPI: ${tenant.upi_id}\n` : "") +
          `\n— ${masjid}`,
        params: [name, month, amount, due, masjid],
      };

    case "receipt_issued":
      return {
        subject: `Chanda receipt ${receipt} — ${masjid}`,
        text:
          `Jazak Allah khair, ${name}.\n\n` +
          `${amount} ka chanda mil gaya. Receipt: ${receipt}.\n` +
          `Yeh computer-generated receipt hai.\n\n— ${masjid}`,
        params: [name, amount, receipt, masjid],
      };

    case "notice_alert":
      return {
        subject: `${title} — ${masjid}`,
        text: `${title}\n\n${body}\n\n— ${masjid}`,
        params: [title, body, masjid],
      };

    case "test_message":
      return {
        subject: `Test message — ${masjid}`,
        text: `Yeh ${masjid} ki taraf se test message hai. Integration theek kaam kar raha hai.`,
        params: [masjid],
      };

    default:
      return {
        subject: `Message — ${masjid}`,
        text: `${title || template}\n\n${body}`.trim(),
        params: [title || template, body, masjid],
      };
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
