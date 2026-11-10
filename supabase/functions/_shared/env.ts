// ═══════════════════════════════════════════════════════════════
// Runtime helpers shared by every Edge Function.
// No third-party imports on purpose: fewer moving parts, faster
// cold starts, and no dependency that can break during a deploy.
// ═══════════════════════════════════════════════════════════════

export function env(name: string): string | undefined {
  const value = Deno.env.get(name);
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

/** Flip to true to log messages instead of sending them. */
export function isDryRun(): boolean {
  return env("DRY_RUN") === "1" || env("DRY_RUN") === "true";
}
