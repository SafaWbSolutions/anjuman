// ═══════════════════════════════════════════════════════════════
// Crypto helpers (WebCrypto only — no npm packages).
// ═══════════════════════════════════════════════════════════════

const encoder = new TextEncoder();

export function bytes(input: string | Uint8Array): Uint8Array {
  return typeof input === "string" ? encoder.encode(input) : input;
}

export function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes_ = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  for (const b of bytes_) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  let normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4;
  if (pad === 2) normalized += "==";
  else if (pad === 3) normalized += "=";
  const binary = atob(normalized);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function sha256(
  message: string | Uint8Array,
  format: "hex" | "base64" = "hex",
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes(message));
  return format === "hex" ? toHex(digest) : toBase64(digest);
}

export async function hmacSha256(
  key: string | Uint8Array,
  message: string | Uint8Array,
  format: "hex" | "base64" = "hex",
): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    bytes(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, bytes(message));
  return format === "hex" ? toHex(signature) : toBase64(signature);
}

/**
 * Constant-time string comparison. Used for every signature and
 * shared-secret check so response timing cannot leak the secret.
 */
export function safeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

/** Convert a PEM-encoded PKCS#8 private key to DER bytes for WebCrypto. */
export function pemToDer(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  return fromBase64(body);
}

export function base64UrlEncode(input: string | Uint8Array): string {
  return toBase64(bytes(input))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const json = new TextDecoder().decode(fromBase64(parts[1]));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}
