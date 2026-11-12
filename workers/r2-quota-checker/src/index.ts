interface Env {
  R2_QUOTA_KV: KVNamespace;
  R2_BUCKET: R2Bucket;
  R2_BUCKET_NAME: string;
  WARNING_THRESHOLD: string;
  QUOTA_LIMIT_GB: string;
  ALERT_WEBHOOK_URL?: string;
}

const DEFAULT_LIMIT_GB = 10;

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const limitGb = Number(env.QUOTA_LIMIT_GB || DEFAULT_LIMIT_GB);
    const limitBytes = limitGb * 1024 * 1024 * 1024;
    const warning = Number(env.WARNING_THRESHOLD || "0.95");

    console.log(`[R2 Quota] Checking usage (limit ${limitGb} GB)...`);

    try {
      const usage = await getR2Usage(env);
      const gb = usage / (1024 * 1024 * 1024);
      console.log(`[R2 Quota] Usage: ${gb.toFixed(2)} GB (${usage} bytes)`);

      if (usage >= limitBytes) {
        await env.R2_QUOTA_KV.put("uploads_disabled", "true", {
          expirationTtl: 86400 * 30,
        });
        await sendAlert(
          env,
          `🚨 HARD LIMIT: ${gb.toFixed(2)} GB / ${limitGb} GB. Uploads DISABLED.`,
          "critical"
        );
        return;
      }

      // Below the hard limit again: make sure uploads are enabled.
      await env.R2_QUOTA_KV.delete("uploads_disabled");

      if (usage >= limitBytes * warning) {
        await sendAlert(
          env,
          `⚠️ Warning: ${gb.toFixed(2)} GB used (${Math.round((usage / limitBytes) * 100)}% of ${limitGb} GB).`,
          "warning"
        );
      }
    } catch (error) {
      console.error("[R2 Quota] Check failed:", error);
      await sendAlert(
        env,
        `❌ Quota check failed: ${error instanceof Error ? error.message : "unknown"}`,
        "error"
      );
    }
  },
};

/** Sum every object in the bucket. No Cloudflare API token needed. */
async function getR2Usage(env: Env): Promise<number> {
  let total = 0;
  let cursor: string | undefined;

  do {
    const page = await env.R2_BUCKET.list({ cursor, limit: 1000 });
    for (const object of page.objects) total += object.size;
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return total;
}

async function sendAlert(
  env: Env,
  message: string,
  level: "info" | "warning" | "critical" | "error" = "info"
): Promise<void> {
  const emoji = { info: "ℹ️", warning: "⚠️", critical: "🚨", error: "❌" }[level];
  console.log(`[R2 Alert] ${level.toUpperCase()}: ${message}`);

  if (!env.ALERT_WEBHOOK_URL) return;
  try {
    await fetch(env.ALERT_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `${emoji} [Anjuman R2] ${message}`,
        username: "Anjuman R2 Monitor",
      }),
    });
  } catch (e) {
    console.error("Webhook failed:", e);
  }
}
