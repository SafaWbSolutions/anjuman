// ═══════════════════════════════════════════════════════════════
// HTTP helpers: CORS, JSON responses, secret checks.
// ═══════════════════════════════════════════════════════════════

import { env } from "./env.ts";
import { safeEqual } from "./crypto.ts";

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-provider, " +
    "x-webhook-signature, x-webhook-timestamp, x-razorpay-signature, x-razorpay-event-id, x-verify",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export function methodNotAllowed(): Response {
  return json({ ok: false, error: "method_not_allowed" }, 405);
}

export function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Scheduled jobs authenticate with the shared cron secret. The
 * service_role key is also accepted so the function can be invoked
 * manually from the Supabase dashboard or the CLI.
 */
export function isTrustedCaller(req: Request): boolean {
  const expected = env("CRON_SECRET");
  if (!expected) return false;

  const supplied = req.headers.get("x-cron-secret") ?? bearer(req) ?? "";
  if (safeEqual(supplied, expected)) return true;

  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  return Boolean(serviceKey && safeEqual(supplied, serviceKey));
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}

export function clientIp(req: Request): string | null {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    null
  );
}
