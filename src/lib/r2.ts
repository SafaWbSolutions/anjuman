/**
 * Public asset uploads go through the `r2-upload-gate` Worker.
 *
 * Why not upload directly from the browser? R2 secret keys must never
 * reach the client bundle. The Worker checks the Supabase session,
 * enforces the tenant role for branding, and writes to the bucket.
 *
 * Set NEXT_PUBLIC_R2_UPLOAD_URL at build time (Cloudflare Pages env or
 * .env.local). The fallback keeps the current production deployment
 * working without extra configuration.
 */
import { supabase } from "./supabase";

const DEFAULT_UPLOAD_URL = "https://r2-upload-gate.starservices0026.workers.dev";

export function r2UploadUrl(): string {
  return (process.env.NEXT_PUBLIC_R2_UPLOAD_URL || DEFAULT_UPLOAD_URL).replace(
    /\/$/,
    ""
  );
}

/** Public URL for an object already stored in R2. */
export function r2PublicUrl(key: string): string {
  return `${r2UploadUrl()}/files/${key.replace(/^\/+/, "")}`;
}

/**
 * Upload a public image (member avatar, tenant logo, masjid photo, UPI QR).
 * Returns the public URL.
 */
export async function uploadToR2(
  file: File,
  key: string,
  _options: { contentType?: string; maxMb?: number } = {}
): Promise<string> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  const token = data.session?.access_token;
  if (!token) throw new Error("Upload ke liye login zaroori hai");

  const form = new FormData();
  form.append("file", file);
  form.append("key", key);

  const res = await fetch(`${r2UploadUrl()}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  const body = (await res.json().catch(() => ({}))) as {
    url?: string;
    error?: string;
  };
  if (!res.ok || !body.url) {
    throw new Error(body.error || `Upload failed (${res.status})`);
  }
  return body.url;
}
