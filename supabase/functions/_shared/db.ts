// ═══════════════════════════════════════════════════════════════
// Thin PostgREST client.
//
// Every call runs with the service_role key. That key bypasses RLS,
// so it must only ever live inside an Edge Function — never in the
// browser bundle.
// ═══════════════════════════════════════════════════════════════

import { requireEnv } from "./env.ts";

type Row = Record<string, any>;

function baseUrl(): string {
  return requireEnv("SUPABASE_URL").replace(/\/+$/, "");
}

function serviceKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: serviceKey(),
    Authorization: `Bearer ${serviceKey()}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export function query(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function rest<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl()}/rest/v1${path}`, {
    ...init,
    headers: headers(init.headers as Record<string, string> | undefined),
  });

  const body = await parse(response);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as Row).message)
        : typeof body === "string"
          ? body
          : `HTTP ${response.status}`;
    throw new Error(`PostgREST ${response.status}: ${message}`);
  }
  return body as T;
}

export function select<T = Row[]>(
  table: string,
  params: Record<string, string | number | boolean | undefined | null> = {},
): Promise<T> {
  return rest<T>(`/${table}${query(params)}`, { method: "GET" });
}

export function insert<T = Row[]>(
  table: string,
  rows: Row | Row[],
  options: { onConflict?: string; ignoreDuplicates?: boolean } = {},
): Promise<T> {
  const prefer = ["return=representation"];
  if (options.ignoreDuplicates) prefer.unshift("resolution=ignore-duplicates");

  return rest<T>(`/${table}${options.onConflict ? query({ on_conflict: options.onConflict }) : ""}`, {
    method: "POST",
    headers: { Prefer: prefer.join(",") },
    body: JSON.stringify(rows),
  });
}

export async function patch(
  table: string,
  params: Record<string, string | number | boolean | undefined | null>,
  values: Row,
): Promise<void> {
  await rest(`/${table}${query(params)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(values),
  });
}

export async function remove(
  table: string,
  params: Record<string, string | number | boolean | undefined | null>,
): Promise<void> {
  await rest(`/${table}${query(params)}`, { method: "DELETE" });
}

export async function rpc<T = unknown>(fn: string, args: Row = {}): Promise<T> {
  return rest<T>(`/rpc/${fn}`, {
    method: "POST",
    body: JSON.stringify(args),
  });
}

// ── Job history ──────────────────────────────────────────────────
export async function startJob(job: string, tenantId?: string | null): Promise<string | null> {
  try {
    const rows = await insert<Row[]>("job_runs", [
      { job, tenant_id: tenantId ?? null, status: "running" },
    ]);
    return rows?.[0]?.id ?? null;
  } catch (error) {
    console.error("job_runs insert failed", error);
    return null;
  }
}

export async function finishJob(
  id: string | null,
  status: "success" | "failed" | "skipped",
  stats: Row = {},
  error?: string,
): Promise<void> {
  if (!id) return;
  try {
    await patch("job_runs", { id: `eq.${id}` }, {
      status,
      stats,
      error: error ?? null,
      finished_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("job_runs update failed", err);
  }
}

// ── Convenience lookups ──────────────────────────────────────────
export async function tenantSettings(tenantId: string): Promise<Row | null> {
  const rows = await select<Row[]>("tenant_settings", {
    select: "*",
    tenant_id: `eq.${tenantId}`,
    limit: 1,
  });
  return rows?.[0] ?? null;
}

export async function integrationFor(
  tenantId: string,
  type: string,
): Promise<{ integration: Row; secret: Row } | null> {
  const integrations = await select<Row[]>("integrations", {
    select: "id,type,provider,mode,enabled",
    tenant_id: `eq.${tenantId}`,
    type: `eq.${type}`,
    enabled: "eq.true",
    order: "created_at.desc",
    limit: 1,
  });

  const integration = integrations?.[0];
  if (!integration) return null;

  const secrets = await select<Row[]>("integration_secrets", {
    select: "secret",
    integration_id: `eq.${integration.id}`,
    limit: 1,
  });

  return { integration, secret: secrets?.[0]?.secret ?? {} };
}
