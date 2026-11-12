interface Env {
  R2_QUOTA_KV: KVNamespace;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
  ALERT_WEBHOOK_URL?: string;
}

interface R2UsageResponse {
  result: {
    total_bytes: number;
  };
  success: boolean;
}

const LIMIT_GB = 10;
const LIMIT_BYTES = LIMIT_GB * 1024 * 1024 * 1024;
const WARNING_THRESHOLD = 0.95; // 95%

export default {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    console.log('[R2 Quota] Starting daily quota check...');

    try {
      const usage = await getR2Usage(env);
      const usageGB = usage / (1024 * 1024 * 1024);
      console.log(`[R2 Quota] Current usage: ${usageGB.toFixed(2)} GB / ${LIMIT_GB} GB`);

      // Check warning threshold (95%)
      if (usage >= LIMIT_BYTES * WARNING_THRESHOLD && usage < LIMIT_BYTES) {
        await sendAlert(env, 
          `⚠️ R2 Quota Warning: ${usageGB.toFixed(2)} GB used (${Math.round(usage/LIMIT_BYTES*100)}% of ${LIMIT_GB}GB limit)`,
          'warning'
        );
      }

      // Hard limit reached
      if (usage >= LIMIT_BYTES) {
        console.log('[R2 Quota] HARD LIMIT REACHED - Disabling uploads');
        await disableUploads(env);
        await sendAlert(env,
          `🚨 R2 HARD LIMIT REACHED: ${usageGB.toFixed(2)} GB used. Uploads DISABLED.`,
          'critical'
        );
      }

    } catch (error) {
      console.error('[R2 Quota] Error:', error);
      await sendAlert(env, `❌ Quota check failed: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  }
};

async function getR2Usage(env: Env): Promise<number> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/r2/usage`;
  
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`R2 usage API failed: ${response.status} - ${text}`);
  }

  const data: R2UsageResponse = await response.json();
  
  if (!data.success || !data.result) {
    throw new Error('Invalid R2 usage response');
  }

  return data.result.total_bytes || 0;
}

async function disableUploads(env: Env): Promise<void> {
  // Set KV flag to disable uploads
  await env.R2_QUOTA_KV.put('uploads_disabled', 'true', { 
    expirationTtl: 86400 * 30 // 30 days
  });
  console.log('[R2 Quota] Uploads disabled via KV flag');
}

async function sendAlert(env: Env, message: string, level: 'info' | 'warning' | 'critical' | 'error' = 'info'): Promise<void> {
  const emoji = { info: 'ℹ️', warning: '⚠️', critical: '🚨', error: '❌' }[level];
  const fullMessage = `${emoji} [Anjuman R2 Quota] ${message}`;

  console.log(`[R2 Alert] ${level.toUpperCase()}: ${message}`);

  if (env.ALERT_WEBHOOK_URL) {
    try {
      await fetch(env.ALERT_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: fullMessage,
          username: 'Anjuman R2 Monitor',
          icon_emoji: ':cloud:'
        })
      });
    } catch (e) {
      console.error('Failed to send webhook alert:', e);
    }
  }
}