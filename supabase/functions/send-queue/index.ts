// ═══════════════════════════════════════════════════════════════
// send-queue · drains notification_queue
//
// Called every 5 minutes by pg_cron (or manually). Claims a batch,
// renders the message, sends it through the tenant's own provider,
// and records the result. Failures are re-queued with backoff by
// requeue_notifications().
// ═══════════════════════════════════════════════════════════════

import { isDryRun } from "../_shared/env.ts";
import {
  finishJob,
  integrationFor,
  patch,
  rpc,
  select,
  startJob,
  tenantSettings,
} from "../_shared/db.ts";
import {
  isTrustedCaller,
  json,
  methodNotAllowed,
  preflight,
  readJson,
} from "../_shared/http.ts";
import { render, type TenantInfo } from "../_shared/templates.ts";
import { chunk, sendMessage } from "../_shared/providers.ts";

type Row = Record<string, any>;

interface Body {
  batch?: number;
  max_rounds?: number;
  dry_run?: boolean;
}

const CONCURRENCY = 5;

async function tenantInfo(tenantId: string, cache: Map<string, TenantInfo>): Promise<TenantInfo> {
  const cached = cache.get(tenantId);
  if (cached) return cached;

  const rows = await select<Row[]>("tenants", {
    select: "name,masjid,phone,upi_id",
    id: `eq.${tenantId}`,
    limit: 1,
  });
  const info = (rows?.[0] ?? {}) as TenantInfo;
  cache.set(tenantId, info);
  return info;
}

async function mark(
  row: Row,
  status: "sent" | "failed" | "skipped",
  values: Row = {},
): Promise<void> {
  await patch("notification_queue", { id: `eq.${row.id}` }, {
    status,
    ...values,
  });
}

async function processOne(
  row: Row,
  tenants: Map<string, TenantInfo>,
  dryRun: boolean,
): Promise<"sent" | "failed" | "skipped"> {
  try {
    const found = await integrationFor(row.tenant_id, row.channel);
    if (!found) {
      await mark(row, "skipped", { error: "no_enabled_integration" });
      return "skipped";
    }

    if (dryRun) {
      const preview = render(row.template, row.payload ?? {}, await tenantInfo(row.tenant_id, tenants));
      await mark(row, "skipped", { error: `dry_run: ${preview.text.slice(0, 120)}` });
      return "skipped";
    }

    const tenant = await tenantInfo(row.tenant_id, tenants);
    const message = render(row.template, row.payload ?? {}, tenant);

    // Respect the tenant's automation switch for anything except a
    // receipt, which is always worth sending.
    if (row.template !== "receipt_issued") {
      const settings = await tenantSettings(row.tenant_id);
      if (settings && settings.auto_send_reminders === false) {
        await mark(row, "skipped", { error: "automation_disabled" });
        return "skipped";
      }
    }

    const result = await sendMessage(
      row.channel,
      found.integration.provider,
      found.secret,
      row.recipient,
      message,
      row.template,
    );

    if (result.skipped) {
      await mark(row, "skipped", {
        provider: result.provider,
        error: result.error ?? "skipped",
      });
      return "skipped";
    }

    if (!result.ok) {
      await mark(row, "failed", {
        provider: result.provider,
        error: result.error ?? "provider_error",
      });
      return "failed";
    }

    await mark(row, "sent", {
      sent_at: new Date().toISOString(),
      provider: result.provider,
      provider_message_id: result.messageId ?? null,
      cost_paise: result.costPaise ?? 0,
      error: null,
    });
    return "sent";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await mark(row, "failed", { error: message });
    return "failed";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return methodNotAllowed();
  if (!isTrustedCaller(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await readJson<Body>(req);
  const dryRun = body.dry_run === true || isDryRun();
  const batch = Math.min(Math.max(Number(body.batch ?? 25), 1), 100);
  const maxRounds = Math.min(Math.max(Number(body.max_rounds ?? 10), 1), 50);

  const jobId = await startJob("send-queue", null);
  const stats = { rounds: 0, claimed: 0, sent: 0, failed: 0, skipped: 0, dry_run: dryRun };
  const tenants = new Map<string, TenantInfo>();

  try {
    await rpc("requeue_notifications");

    for (let round = 0; round < maxRounds; round++) {
      const rows = await rpc<Row[]>("claim_notifications", { p_limit: batch });
      if (!rows || rows.length === 0) break;

      stats.rounds += 1;
      stats.claimed += rows.length;

      for (const group of chunk(rows, CONCURRENCY)) {
        const outcomes = await Promise.all(group.map((row) => processOne(row, tenants, dryRun)));
        for (const outcome of outcomes) stats[outcome] += 1;
      }

      if (rows.length < batch) break;
    }

    await finishJob(jobId, "success", stats);
    return json({ ok: true, ...stats });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJob(jobId, "failed", stats, message);
    return json({ ok: false, error: message, ...stats }, 500);
  }
});
