// ═══════════════════════════════════════════════════════════════
// nightly · the 02:00 IST maintenance run
//
//   · expiry / grace period
//   · monthly invoice generation (1st of the month)
//   · due reminders on the tenant's chosen days
//   · scheduled notice fan-out
//   · failed-message requeue
//   · ledger chain verification
//
// Everything is idempotent, so a missed or repeated run is safe.
// ═══════════════════════════════════════════════════════════════

import {
  finishJob,
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

type Row = Record<string, any>;

interface Body {
  tenant_id?: string;
  force?: boolean;
}

/** Day of month in IST, independent of the server timezone. */
function istDay(): number {
  const shifted = new Date(Date.now() + (5 * 60 + 30) * 60 * 1000);
  return shifted.getUTCDate();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return methodNotAllowed();
  if (!isTrustedCaller(req)) return json({ ok: false, error: "unauthorized" }, 401);

  const body = await readJson<Body>(req);
  const manual = Boolean(body.tenant_id);
  const force = body.force === true || manual;

  const jobId = await startJob("nightly", body.tenant_id ?? null);
  const stats: Row = {
    tenants: 0,
    invoices_created: 0,
    reminders_created: 0,
    notices_queued: 0,
    expired: 0,
    requeued: 0,
    ledger_broken: {} as Record<string, number>,
    errors: [] as string[],
    manual,
    day: istDay(),
  };

  try {
    stats.expired = Number(await rpc<number>("expire_tenants")) || 0;
    stats.requeued = Number(await rpc<number>("requeue_notifications")) || 0;
    stats.notices_queued = Number(await rpc<number>("publish_due_notices")) || 0;

    const tenants: Row[] = body.tenant_id
      ? [{ id: body.tenant_id }]
      : await select<Row[]>("tenants", {
          select: "id,code,name,status",
          status: "in.(active,trial,read_only)",
          order: "created_at.asc",
        });

    const generateToday = manual || force || istDay() === 1;

    for (const tenant of tenants ?? []) {
      stats.tenants += 1;
      const label = tenant.code ?? tenant.id;

      try {
        const settings = await tenantSettings(tenant.id);

        if (generateToday && settings?.auto_generate_invoices !== false) {
          const result = await rpc<Row>("generate_monthly_invoices", { p_tenant: tenant.id });
          stats.invoices_created += Number(result?.created ?? 0);
        }

        if (settings?.auto_send_reminders !== false) {
          const result = await rpc<Row>("queue_reminders", {
            p_tenant: tenant.id,
            p_force: force,
          });
          stats.reminders_created += Number(result?.created ?? 0);
        }

        const broken = await rpc<number | null>("verify_ledger", { p_tenant: tenant.id });
        if (broken !== null && broken !== undefined) {
          stats.ledger_broken[label] = Number(broken);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stats.errors.push(`${label}: ${message}`);
      }
    }

    const broken = Object.keys(stats.ledger_broken).length;
    const status = broken > 0 || stats.errors.length > 0 ? "failed" : "success";

    await finishJob(
      jobId,
      status,
      stats,
      broken > 0 ? `ledger_broken:${Object.keys(stats.ledger_broken).join(",")}` : undefined,
    );

    return json({ ok: status === "success", ...stats }, status === "success" ? 200 : 500);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finishJob(jobId, "failed", stats, message);
    return json({ ok: false, error: message, ...stats }, 500);
  }
});
