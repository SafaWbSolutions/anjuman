// ═══════════════════════════════════════════════════════════════
// payment-webhook · gateway reconciliation
//
// One endpoint, three gateways. The URL is:
//   /functions/v1/payment-webhook?provider=razorpay
//   /functions/v1/payment-webhook?provider=cashfree
//   /functions/v1/payment-webhook?provider=phonepe
//
// Safety rules:
//   · signature is verified before anything is written
//   · an event can only be processed once (webhook_events)
//   · a payment is auto-verified only if no human entered it
//   · an amount mismatch is never auto-verified — it is flagged
// ═══════════════════════════════════════════════════════════════

import { fromBase64, hmacSha256, safeEqual, sha256 } from "../_shared/crypto.ts";
import { insert, patch, remove, rpc, select, tenantSettings } from "../_shared/db.ts";
import { json, methodNotAllowed, preflight } from "../_shared/http.ts";

type Row = Record<string, any>;

interface Parsed {
  eventId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  memberId?: string | null;
  success: boolean;
  reason?: string;
  payload: unknown;
}

interface Candidate {
  integrationId: string;
  tenantId: string;
  secret: Row;
}

function badRequest(error: string): Response {
  return json({ ok: false, error }, 400);
}

async function loadCandidates(provider: string): Promise<Candidate[]> {
  const integrations = await select<Row[]>("integrations", {
    select: "id,tenant_id,provider",
    type: "eq.payment",
    provider: `eq.${provider}`,
    enabled: "eq.true",
    tenant_id: "not.is.null",
  });

  const out: Candidate[] = [];
  for (const integration of integrations ?? []) {
    const secrets = await select<Row[]>("integration_secrets", {
      select: "secret",
      integration_id: `eq.${integration.id}`,
      limit: 1,
    });
    if (!secrets?.[0]?.secret) continue;
    out.push({
      integrationId: integration.id,
      tenantId: integration.tenant_id,
      secret: secrets[0].secret,
    });
  }
  return out;
}

// ── Razorpay ────────────────────────────────────────────────────
async function verifyRazorpay(
  raw: string,
  headers: Headers,
  secret: Row,
): Promise<Parsed | null> {
  const key = secret.webhook_secret ?? secret.key_secret;
  const supplied = headers.get("x-razorpay-signature");
  if (!key || !supplied) return null;

  const expected = await hmacSha256(key, raw, "hex");
  if (!safeEqual(supplied, expected)) return null;

  const body = JSON.parse(raw);
  const event = String(body?.event ?? "");
  if (event.includes("refund")) {
    return {
      eventId: headers.get("x-razorpay-event-id") ?? `refund:${body?.payload?.refund?.entity?.id ?? body?.id}`,
      orderId: "",
      amountPaise: 0,
      currency: "INR",
      success: false,
      reason: "refund_event_ignored",
      payload: body,
    };
  }

  const payment = body?.payload?.payment?.entity ?? {};
  const status = String(payment.status ?? "");
  const success = status === "captured" || event === "payment.captured" || event === "order.paid";

  return {
    eventId: headers.get("x-razorpay-event-id") ??
      `${payment.id ?? body?.id ?? "unknown"}:${event}`,
    orderId: String(payment.order_id ?? payment.id ?? ""),
    amountPaise: Number(payment.amount ?? 0),
    currency: String(payment.currency ?? "INR"),
    memberId: payment.notes?.member_id ?? null,
    success,
    reason: success ? undefined : `razorpay_status:${status || event}`,
    payload: body,
  };
}

// ── Cashfree ────────────────────────────────────────────────────
async function verifyCashfree(
  raw: string,
  headers: Headers,
  secret: Row,
): Promise<Parsed | null> {
  const key = secret.webhook_secret ?? secret.secret_key;
  const supplied = headers.get("x-webhook-signature");
  const timestamp = headers.get("x-webhook-timestamp") ?? "";
  if (!key || !supplied) return null;

  const expected = await hmacSha256(key, `${timestamp}${raw}`, "base64");
  const candidates = [supplied, supplied.replace(/ /g, "+")];
  try {
    candidates.push(decodeURIComponent(supplied));
  } catch {
    // header was not URL-encoded
  }
  if (!candidates.some((value) => safeEqual(value, expected))) return null;

  const body = JSON.parse(raw);
  const type = String(body?.type ?? "");
  const data = body?.data ?? {};
  const order = data.order ?? {};
  const payment = data.payment ?? {};

  const status = String(payment.payment_status ?? "").toUpperCase();
  const success = type.startsWith("PAYMENT_SUCCESS") || status === "SUCCESS";

  // Cashfree amounts are in rupees, not paise.
  const rupees = Number(payment.payment_amount ?? order.order_amount ?? 0);
  const amountPaise = Number.isFinite(rupees) ? Math.round(rupees * 100) : 0;

  return {
    eventId: headers.get("x-webhook-id") ??
      `${payment.cf_payment_id ?? order.order_id ?? "unknown"}:${type}`,
    orderId: String(order.order_id ?? ""),
    amountPaise,
    currency: String(order.order_currency ?? "INR"),
    memberId: order.order_tags?.member_id ?? order.order_tags?.memberId ?? null,
    success,
    reason: success ? undefined : `cashfree_status:${status || type}`,
    payload: body,
  };
}

// ── PhonePe ─────────────────────────────────────────────────────
async function verifyPhonePe(
  raw: string,
  headers: Headers,
  secret: Row,
): Promise<Parsed | null> {
  const saltKey = secret.salt_key;
  const saltIndex = String(secret.salt_index ?? "");
  const supplied = headers.get("x-verify") ?? headers.get("X-VERIFY") ?? "";
  if (!saltKey || !supplied) return null;

  const body = JSON.parse(raw);
  const response = String(body?.response ?? "");
  if (!response) return null;

  const expected = `${await sha256(response + saltKey)}###${saltIndex}`;
  if (!safeEqual(supplied, expected)) return null;

  const decoded = JSON.parse(new TextDecoder().decode(fromBase64(response)));
  const data = decoded?.data ?? {};
  const state = String(data.state ?? "").toUpperCase();
  const success = state === "COMPLETED" && Number(data.amount) > 0;

  return {
    eventId: String(data.transactionId ?? `${data.merchantTransactionId ?? "unknown"}:${state}`),
    orderId: String(data.merchantTransactionId ?? ""),
    amountPaise: Number(data.amount ?? 0),
    currency: "INR",
    memberId: null,
    success,
    reason: success ? undefined : `phonepe_state:${state || "unknown"}`,
    payload: decoded,
  };
}

async function verify(
  provider: string,
  raw: string,
  headers: Headers,
  secret: Row,
): Promise<Parsed | null> {
  switch (provider) {
    case "razorpay":
      return await verifyRazorpay(raw, headers, secret);
    case "cashfree":
      return await verifyCashfree(raw, headers, secret);
    case "phonepe":
      return await verifyPhonePe(raw, headers, secret);
    default:
      return null;
  }
}

// ── Processing ──────────────────────────────────────────────────
async function processEvent(provider: string, candidate: Candidate, parsed: Parsed): Promise<Response> {
  const eventRows = await insert<Row[]>(
    "webhook_events",
    [{
      provider,
      event_id: parsed.eventId,
      tenant_id: candidate.tenantId,
      signature_ok: true,
      payload: parsed.payload,
      status: "received",
    }],
    { onConflict: "provider,event_id", ignoreDuplicates: true },
  );

  if (!eventRows || eventRows.length === 0) {
    return json({ ok: true, duplicate: true });
  }

  const eventRow = eventRows[0];

  try {
    if (!parsed.success) {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "ignored",
        error: parsed.reason ?? "not_a_success_event",
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, ignored: true, reason: parsed.reason });
    }

    if (parsed.currency && parsed.currency.toUpperCase() !== "INR") {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "ignored",
        error: `unsupported_currency:${parsed.currency}`,
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, ignored: true, reason: "currency" });
    }

    if (!parsed.orderId || !Number.isFinite(parsed.amountPaise) || parsed.amountPaise <= 0) {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "failed",
        error: "missing_order_or_amount",
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, review: true, reason: "missing_order_or_amount" });
    }

    const existing = await select<Row[]>("payments", {
      select: "*",
      tenant_id: `eq.${candidate.tenantId}`,
      reference: `eq.${parsed.orderId}`,
      limit: 1,
    });

    let payment: Row | undefined = existing?.[0];

    if (!payment) {
      if (!parsed.memberId) {
        await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
          status: "ignored",
          error: "missing_member_reference",
          processed_at: new Date().toISOString(),
        });
        return json({ ok: true, ignored: true, reason: "missing_member_reference" });
      }

      const members = await select<Row[]>("members", {
        select: "id",
        id: `eq.${parsed.memberId}`,
        tenant_id: `eq.${candidate.tenantId}`,
        limit: 1,
      });
      if (!members?.length) {
        await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
          status: "ignored",
          error: "member_not_found",
          processed_at: new Date().toISOString(),
        });
        return json({ ok: true, ignored: true, reason: "member_not_found" });
      }

      const created = await insert<Row[]>("payments", [{
        tenant_id: candidate.tenantId,
        member_id: parsed.memberId,
        amount_paise: parsed.amountPaise,
        method: "gateway",
        reference: parsed.orderId,
        status: "pending",
        entered_by: null,
        note: `Gateway ${provider}`,
      }]);
      payment = created?.[0];

      if (!payment) {
        // A race with another webhook: read the row it created.
        const again = await select<Row[]>("payments", {
          select: "*",
          tenant_id: `eq.${candidate.tenantId}`,
          reference: `eq.${parsed.orderId}`,
          limit: 1,
        });
        payment = again?.[0];
      }
    }

    if (!payment) throw new Error("payment_row_missing");

    if (String(payment.method) !== "gateway") {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "failed",
        error: "reference_belongs_to_manual_payment",
        payment_id: payment.id,
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, review: true, reason: "manual_payment_conflict" });
    }

    if (Number(payment.amount_paise) !== parsed.amountPaise) {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "failed",
        error: `amount_mismatch:expected=${payment.amount_paise}:received=${parsed.amountPaise}`,
        payment_id: payment.id,
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, review: true, reason: "amount_mismatch" });
    }

    if (payment.status === "verified") {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "processed",
        payment_id: payment.id,
        error: "already_verified",
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, duplicate: true, payment_id: payment.id });
    }

    if (payment.status !== "pending") {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "ignored",
        payment_id: payment.id,
        error: `payment_${payment.status}`,
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, ignored: true, reason: `payment_${payment.status}` });
    }

    const settings = await tenantSettings(candidate.tenantId);
    if (settings && settings.auto_verify_gateway === false) {
      await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
        status: "processed",
        payment_id: payment.id,
        error: "auto_verify_disabled",
        processed_at: new Date().toISOString(),
      });
      return json({ ok: true, pending_manual_verification: true, payment_id: payment.id });
    }

    const receipt = await rpc<string>("verify_payment_auto", { p_payment_id: payment.id });

    await patch("webhook_events", { id: `eq.${eventRow.id}` }, {
      status: "processed",
      payment_id: payment.id,
      processed_at: new Date().toISOString(),
    });

    return json({ ok: true, payment_id: payment.id, receipt_no: receipt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Allow the gateway to retry: a failed event must not block the
    // next delivery on the unique constraint.
    await remove("webhook_events", { id: `eq.${eventRow.id}` }).catch(() => {});
    console.error("payment-webhook failed", message);
    return json({ ok: false, error: message }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return methodNotAllowed();

  const url = new URL(req.url);
  const provider = (url.searchParams.get("provider") ??
    req.headers.get("x-provider") ??
    "").toLowerCase();

  if (!["razorpay", "cashfree", "phonepe"].includes(provider)) {
    return badRequest("unknown_provider");
  }

  const raw = await req.text();
  if (!raw) return badRequest("empty_body");

  const candidates = await loadCandidates(provider);
  if (candidates.length === 0) {
    return json({ ok: false, error: "no_enabled_integration" }, 503);
  }

  const verified: { candidate: Candidate; parsed: Parsed }[] = [];
  for (const candidate of candidates) {
    try {
      const parsed = await verify(provider, raw, req.headers, candidate.secret);
      if (parsed) verified.push({ candidate, parsed });
    } catch {
      // Malformed body for this tenant's key — try the next one.
    }
  }

  if (verified.length === 0) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let chosen = verified[0];
  if (verified.length > 1) {
    // Shared gateway account: the order reference disambiguates.
    for (const item of verified) {
      if (!item.parsed.orderId) continue;
      const found = await select<Row[]>("payments", {
        select: "id",
        tenant_id: `eq.${item.candidate.tenantId}`,
        reference: `eq.${item.parsed.orderId}`,
        limit: 1,
      });
      if (found?.length) {
        chosen = item;
        break;
      }
    }
  }

  return await processEvent(provider, chosen.candidate, chosen.parsed);
});
