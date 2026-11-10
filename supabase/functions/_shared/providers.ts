// ═══════════════════════════════════════════════════════════════
// Provider adapters.
//
// Each tenant stores their own keys in integration_secrets. The
// platform never bills members and never holds their money, so a
// failed send is always logged and retried — never silently lost.
// ═══════════════════════════════════════════════════════════════

import { base64UrlEncode, pemToDer } from "./crypto.ts";
import { escapeHtml, type RenderedMessage } from "./templates.ts";

export interface ProviderSecret {
  [key: string]: any;
}

export interface SendResult {
  ok: boolean;
  provider: string;
  messageId?: string;
  costPaise?: number;
  skipped?: boolean;
  error?: string;
}

function failure(provider: string, error: string): SendResult {
  return { ok: false, provider, error };
}

function digits(value: string): string {
  return String(value ?? "").replace(/\D/g, "");
}

/** 9876543210 → 919876543210 (India default). */
export function normalizePhone(raw: string, countryCode = "91"): string {
  let value = digits(raw);
  if (!value) return "";
  if (countryCode && value.length === 10) value = `${countryCode}${value}`;
  if (countryCode && value.startsWith("0")) value = `${countryCode}${value.replace(/^0+/, "")}`;
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ── WhatsApp Cloud API ──────────────────────────────────────────
async function sendWhatsApp(
  secret: ProviderSecret,
  to: string,
  message: RenderedMessage,
  templateKey: string,
): Promise<SendResult> {
  const phoneNumberId = secret.phone_number_id;
  const token = secret.token ?? secret.access_token;
  if (!phoneNumberId || !token) {
    return failure("whatsapp", "missing phone_number_id or token");
  }

  const version = secret.api_version ?? "v21.0";
  const phone = normalizePhone(to, secret.country_code ?? "91");
  const templateMap = secret.template_map ?? {};
  const templateName = templateMap[templateKey];

  const payload: Record<string, unknown> = templateName
    ? {
        messaging_product: "whatsapp",
        to: phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: secret.template_language ?? "en" },
          components: [{
            type: "body",
            parameters: message.params.map((value) => ({ type: "text", text: value || "-" })),
          }],
        },
      }
    : {
        messaging_product: "whatsapp",
        to: phone,
        type: "text",
        text: { preview_url: false, body: message.text },
      };

  const response = await fetch(
    `https://graph.facebook.com/${version}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    return failure("whatsapp", data?.error?.message ?? `HTTP ${response.status}`);
  }
  return { ok: true, provider: "whatsapp", messageId: data?.messages?.[0]?.id };
}

// ── MSG91 (DLT flow API) ────────────────────────────────────────
async function sendMsg91(
  secret: ProviderSecret,
  to: string,
  message: RenderedMessage,
): Promise<SendResult> {
  const authkey = secret.authkey ?? secret.auth_key;
  const templateId = secret.template_id;
  if (!authkey || !templateId) {
    return failure("msg91", "missing authkey or template_id");
  }

  const recipient: Record<string, string> = {
    mobiles: normalizePhone(to, secret.country_code ?? "91"),
  };
  message.params.forEach((value, index) => {
    recipient[`VAR${index + 1}`] = value || "-";
  });

  const response = await fetch("https://control.msg91.com/api/v5/flow/", {
    method: "POST",
    headers: { authkey, "Content-Type": "application/json" },
    body: JSON.stringify({ template_id: templateId, short_url: "0", recipients: [recipient] }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.type === "error") {
    return failure("msg91", data?.message ?? `HTTP ${response.status}`);
  }
  return {
    ok: true,
    provider: "msg91",
    messageId: data?.message?.[0] ?? data?.request_id ?? data?.data?.[0]?.message,
  };
}

// ── Fast2SMS ────────────────────────────────────────────────────
async function sendFast2Sms(
  secret: ProviderSecret,
  to: string,
  message: RenderedMessage,
): Promise<SendResult> {
  const apiKey = secret.api_key ?? secret.authkey;
  if (!apiKey) return failure("fast2sms", "missing api_key");

  const dltTemplate = secret.dlt_template_id;
  const route = secret.route ?? (dltTemplate ? "dlt" : "q");
  const payload: Record<string, unknown> = {
    route,
    numbers: digits(to).replace(/^91(?=\d{10}$)/, ""),
    message: message.text,
  };
  if (secret.sender_id) payload.sender_id = secret.sender_id;
  if (dltTemplate) payload.dlt_template_id = dltTemplate;

  const response = await fetch("https://www.fast2sms.com/dev/bulkV2", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
      "cache-control": "no-cache",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || data?.return === false) {
    return failure("fast2sms", data?.message ?? `HTTP ${response.status}`);
  }
  const ids = data?.message_id ?? data?.message;
  return {
    ok: true,
    provider: "fast2sms",
    messageId: Array.isArray(ids) ? ids[0] : ids ? String(ids) : undefined,
  };
}

// ── Resend (email) ──────────────────────────────────────────────
async function sendEmail(
  secret: ProviderSecret,
  to: string,
  message: RenderedMessage,
): Promise<SendResult> {
  const apiKey = secret.api_key ?? secret.token;
  const from = secret.from;
  if (!apiKey || !from) return failure("resend", "missing api_key or from address");

  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#111">${
    escapeHtml(message.text).replace(/\n/g, "<br>")
  }</div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: message.subject,
      text: message.text,
      html,
      ...(secret.reply_to ? { reply_to: secret.reply_to } : {}),
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) return failure("resend", data?.message ?? `HTTP ${response.status}`);
  return { ok: true, provider: "resend", messageId: data?.id };
}

// ── FCM v1 (push) ───────────────────────────────────────────────
let fcmCache: { token: string; expiresAt: number } | null = null;

export function serviceAccount(secret: ProviderSecret): Record<string, any> | null {
  const raw = secret.service_account;
  if (raw && typeof raw === "object") return raw as Record<string, any>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (secret.project_id && secret.client_email && secret.private_key) {
    return {
      project_id: secret.project_id,
      client_email: secret.client_email,
      private_key: secret.private_key,
    };
  }
  return null;
}

export async function fcmAccessToken(sa: Record<string, any>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmCache && fcmCache.expiresAt - 60 > now) return fcmCache.token;

  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64UrlEncode(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(String(sa.private_key)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.access_token) {
    throw new Error(data?.error_description ?? `FCM token HTTP ${response.status}`);
  }

  fcmCache = {
    token: data.access_token,
    expiresAt: now + Number(data.expires_in ?? 3600),
  };
  return fcmCache.token;
}

async function sendPush(
  secret: ProviderSecret,
  to: string,
  message: RenderedMessage,
): Promise<SendResult> {
  const sa = serviceAccount(secret);
  if (!sa) return failure("fcm", "missing service_account");

  try {
    const token = await fcmAccessToken(sa);
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: {
            token: to,
            notification: { title: message.subject, body: message.text },
          },
        }),
      },
    );
    const data = await response.json().catch(() => null);
    if (!response.ok) return failure("fcm", data?.error?.message ?? `HTTP ${response.status}`);
    return { ok: true, provider: "fcm", messageId: data?.name };
  } catch (error) {
    return failure("fcm", error instanceof Error ? error.message : String(error));
  }
}

// ── Dispatcher ──────────────────────────────────────────────────
export async function sendMessage(
  channel: string,
  provider: string,
  secret: ProviderSecret,
  to: string,
  message: RenderedMessage,
  templateKey: string,
): Promise<SendResult> {
  if (!to || !String(to).trim()) {
    return { ok: false, provider, skipped: true, error: "empty_recipient" };
  }

  const name = String(provider ?? "").toLowerCase();

  try {
    switch (channel) {
      case "whatsapp":
        return await sendWhatsApp(secret, to, message, templateKey);
      case "email":
        return await sendEmail(secret, to, message);
      case "push":
        return await sendPush(secret, to, message);
      case "sms": {
        if (name.includes("msg91")) return await sendMsg91(secret, to, message);
        if (name.includes("fast2sms")) return await sendFast2Sms(secret, to, message);
        return { ok: false, provider, skipped: true, error: `unsupported_sms_provider:${provider}` };
      }
      default:
        return { ok: false, provider, skipped: true, error: `unsupported_channel:${channel}` };
    }
  } catch (error) {
    return failure(provider, error instanceof Error ? error.message : String(error));
  }
}

/** Split a long list into batches (used by bulk sends). */
export { chunk };
