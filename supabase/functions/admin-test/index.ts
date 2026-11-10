// ═══════════════════════════════════════════════════════════════
// admin-test · "paste keys → Test → Enable"
//
// Runs a harmless read-only call against the provider so an office
// bearer knows the keys work before switching the integration on.
// The secret is never returned to the browser.
//
// Deployed with verify_jwt = true: the caller's Supabase session is
// validated by the platform before this code runs.
// ═══════════════════════════════════════════════════════════════

import { decodeJwtPayload } from "../_shared/crypto.ts";
import { patch, select } from "../_shared/db.ts";
import {
  bearer,
  json,
  methodNotAllowed,
  preflight,
  readJson,
} from "../_shared/http.ts";
import { fcmAccessToken, serviceAccount } from "../_shared/providers.ts";

type Row = Record<string, any>;

interface Body {
  integration_id?: string;
  tenant_id?: string | null;
  type?: string;
  provider?: string;
  secret?: Row;
  mode?: string;
}

interface TestResult {
  ok: boolean;
  detail: string;
}

async function call(url: string, headers: Record<string, string>): Promise<TestResult> {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let data: any = null;
    try {
      data = JSON.parse(text);
    } catch {
      // non-JSON response
    }

    if (!response.ok) {
      const detail = data?.error?.message ?? data?.message ?? text.slice(0, 200);
      return { ok: false, detail: `HTTP ${response.status}: ${detail}` };
    }
    return { ok: true, detail: "credentials accepted" };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function testProvider(
  type: string,
  provider: string,
  secret: Row,
): Promise<TestResult> {
  const name = String(provider ?? "").toLowerCase();

  if (type === "whatsapp") {
    if (!secret.phone_number_id || !(secret.token ?? secret.access_token)) {
      return { ok: false, detail: "phone_number_id and token are required" };
    }
    const version = secret.api_version ?? "v21.0";
    const url = `https://graph.facebook.com/${version}/${secret.phone_number_id}` +
      `?fields=display_phone_number,verified_name`;
    return await call(url, { Authorization: `Bearer ${secret.token ?? secret.access_token}` });
  }

  if (type === "sms") {
    if (name.includes("msg91")) {
      if (!secret.authkey) return { ok: false, detail: "authkey is required" };
      return await call("https://control.msg91.com/api/v5/balance", {
        authkey: secret.authkey,
      });
    }
    if (name.includes("fast2sms")) {
      if (!secret.api_key) return { ok: false, detail: "api_key is required" };
      return await call("https://www.fast2sms.com/dev/wallet", {
        Authorization: secret.api_key,
      });
    }
    return { ok: false, detail: `unsupported sms provider: ${provider}` };
  }

  if (type === "email") {
    if (!secret.api_key) return { ok: false, detail: "api_key is required" };
    return await call("https://api.resend.com/domains", {
      Authorization: `Bearer ${secret.api_key}`,
    });
  }

  if (type === "push") {
    const sa = serviceAccount(secret);
    if (!sa) return { ok: false, detail: "service_account JSON is required" };
    try {
      await fcmAccessToken(sa);
      return { ok: true, detail: "service account key accepted" };
    } catch (error) {
      return { ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  if (type === "payment") {
    if (name.includes("razorpay")) {
      if (!secret.key_id || !secret.key_secret) {
        return { ok: false, detail: "key_id and key_secret are required" };
      }
      const basic = btoa(`${secret.key_id}:${secret.key_secret}`);
      return await call("https://api.razorpay.com/v1/payments?count=1", {
        Authorization: `Basic ${basic}`,
      });
    }

    if (name.includes("cashfree")) {
      if (!secret.app_id || !secret.secret_key) {
        return { ok: false, detail: "app_id and secret_key are required" };
      }
      return await call("https://api.cashfree.com/pg/orders?limit=1", {
        "x-client-id": secret.app_id,
        "x-client-secret": secret.secret_key,
        "x-api-version": secret.api_version ?? "2023-08-01",
      });
    }

    if (name.includes("phonepe")) {
      if (!secret.merchant_id || !secret.salt_key || !secret.salt_index) {
        return { ok: false, detail: "merchant_id, salt_key and salt_index are required" };
      }
      return {
        ok: true,
        detail: "keys look complete — PhonePe has no read-only ping; run a ₹1 live test",
      };
    }

    return { ok: false, detail: `unsupported payment provider: ${provider}` };
  }

  return { ok: false, detail: `unsupported integration type: ${type}` };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return methodNotAllowed();

  const token = bearer(req);
  const claims = token ? decodeJwtPayload(token) : null;
  const userId = typeof claims?.sub === "string" ? claims.sub : null;
  if (!userId) return json({ ok: false, error: "not_signed_in" }, 401);

  const profiles = await select<Row[]>("profiles", {
    select: "id,tenant_id,role,is_active",
    id: `eq.${userId}`,
    limit: 1,
  });
  const profile = profiles?.[0];
  if (!profile?.is_active) return json({ ok: false, error: "inactive_profile" }, 403);

  const isPlatformAdmin = profile.role === "super_admin";
  const body = await readJson<Body>(req);

  let type = String(body.type ?? "");
  let provider = String(body.provider ?? "");
  let secret: Row = body.secret ?? {};
  let tenantId: string | null = isPlatformAdmin
    ? (body.tenant_id ?? null)
    : (profile.tenant_id ?? null);
  let integrationId: string | null = body.integration_id ?? null;

  if (integrationId) {
    const rows = await select<Row[]>("integrations", {
      select: "id,scope,tenant_id,type,provider",
      id: `eq.${integrationId}`,
      limit: 1,
    });
    const integration = rows?.[0];
    if (!integration) return json({ ok: false, error: "integration_not_found" }, 404);

    const allowed = integration.scope === "platform"
      ? isPlatformAdmin
      : isPlatformAdmin ||
        (integration.tenant_id === profile.tenant_id &&
          ["sadar", "secretary"].includes(String(profile.role)));

    if (!allowed) return json({ ok: false, error: "forbidden" }, 403);

    type = integration.type;
    provider = integration.provider;
    tenantId = integration.tenant_id ?? null;

    if (!body.secret) {
      const stored = await select<Row[]>("integration_secrets", {
        select: "secret",
        integration_id: `eq.${integration.id}`,
        limit: 1,
      });
      secret = stored?.[0]?.secret ?? {};
    }
  } else {
    if (!isPlatformAdmin && !profile.tenant_id) {
      return json({ ok: false, error: "no_tenant" }, 403);
    }
    if (!type || !provider) {
      return json({ ok: false, error: "type_and_provider_required" }, 400);
    }
  }

  if (!secret || Object.keys(secret).length === 0) {
    return json({ ok: false, error: "secret_required" }, 400);
  }

  const result = await testProvider(type, provider, secret);

  if (integrationId) {
    await patch("integrations", { id: `eq.${integrationId}` }, {
      status: result.ok ? "connected" : "error",
      last_tested_at: new Date().toISOString(),
      mode: body.mode === "live" || body.mode === "test" ? body.mode : undefined,
    }).catch(() => {});
  }

  return json({
    ok: result.ok,
    type,
    provider,
    tenant_id: tenantId,
    detail: result.detail,
  });
});
