interface Env {
  R2_QUOTA_KV: KVNamespace;
  R2_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  MAX_UPLOAD_MB: string;
  R2_PUBLIC_BASE?: string;
}

const OFFICE_ROLES = new Set(["sadar", "khajanchi", "secretary", "super_admin"]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Public read for uploaded public assets (avatars / branding / QR).
    if (request.method === "GET" && url.pathname.startsWith("/files/")) {
      return serveFile(request, env, url);
    }

    if (request.method === "POST" && url.pathname === "/upload") {
      return handleUpload(request, env, url);
    }

    if (request.method === "GET" && url.pathname === "/") {
      return json({ ok: true, service: "r2-upload-gate" });
    }

    return json({ error: "Not found" }, 404);
  },
};

async function handleUpload(request: Request, env: Env, url: URL): Promise<Response> {
  // Kill switch controlled by the daily quota checker.
  const disabled = await env.R2_QUOTA_KV.get("uploads_disabled");
  if (disabled === "true") {
    return json(
      { error: "R2 quota exceeded (10 GB). Uploads temporarily disabled.", code: "QUOTA_EXCEEDED" },
      403
    );
  }

  const auth = request.headers.get("Authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const user = token ? await getUser(env, token) : null;
  if (!user) return json({ error: "Sign in required" }, 401);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "multipart/form-data required" }, 400);
  }

  const file = form.get("file");
  const rawKey = String(form.get("key") || "");
  if (!(file instanceof File)) return json({ error: "file field missing" }, 400);

  const key = normaliseKey(rawKey);
  if (!key) return json({ error: "Invalid key" }, 400);

  // Only public assets go to R2. KYC documents stay in the private
  // Supabase bucket.
  if (
    !key.startsWith("avatars/") &&
    !key.startsWith("tenants/") &&
    !key.startsWith("ads/")
  ) {
    return json({ error: "Key not allowed" }, 400);
  }

  const maxMb = Number(env.MAX_UPLOAD_MB || "5");
  if (file.size > maxMb * 1024 * 1024) {
    return json({ error: `File too large (max ${maxMb} MB)` }, 413);
  }

  const type = file.type || "application/octet-stream";
  if (!type.startsWith("image/")) {
    return json({ error: "Only image uploads are allowed here" }, 415);
  }

  // Branding can only be changed by that tenant's office bearers.
  if (key.startsWith("tenants/")) {
    const tenantId = key.split("/")[1];
    const profile = await getProfile(env, token, user.id);
    if (!profile) return json({ error: "Profile not found" }, 403);
    if (profile.role !== "super_admin") {
      if (!OFFICE_ROLES.has(profile.role) || profile.tenant_id !== tenantId) {
        return json({ error: "Only this anjuman's office bearers can upload branding" }, 403);
      }
    }
  }

  // Ads are platform-wide, so only the platform admin may upload them.
  if (key.startsWith("ads/")) {
    const profile = await getProfile(env, token, user.id);
    if (!profile || profile.role !== "super_admin") {
      return json({ error: "Only the platform admin can upload ads" }, 403);
    }
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  await env.R2_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: type, cacheControl: "public, max-age=31536000, immutable" },
    customMetadata: { uploadedBy: user.id, uploadedAt: new Date().toISOString() },
  });

  const base = env.R2_PUBLIC_BASE || url.origin;
  return json({ ok: true, key, url: `${base.replace(/\/$/, "")}/files/${key}` });
}

async function serveFile(request: Request, env: Env, url: URL): Promise<Response> {
  const key = normaliseKey(decodeURIComponent(url.pathname.slice("/files/".length)));
  if (!key) return new Response("Not found", { status: 404 });
  if (
    !key.startsWith("avatars/") &&
    !key.startsWith("tenants/") &&
    !key.startsWith("ads/")
  ) {
    return new Response("Not found", { status: 404 });
  }

  const object = await env.R2_BUCKET.get(key);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers();
  headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
  headers.set("Cache-Control", object.httpMetadata?.cacheControl || "public, max-age=86400");
  headers.set("ETag", object.httpEtag);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(object.body, { headers });
}

async function getUser(env: Env, token: string): Promise<{ id: string } | null> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const user = (await res.json()) as { id?: string };
  return user.id ? { id: user.id } : null;
}

async function getProfile(
  env: Env,
  token: string,
  userId: string
): Promise<{ role: string; tenant_id: string | null } | null> {
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/profiles?select=role,tenant_id&id=eq.${encodeURIComponent(
      userId
    )}&limit=1`,
    { headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ role: string; tenant_id: string | null }>;
  return rows[0] ?? null;
}

function normaliseKey(key: string): string | null {
  const k = key.replace(/^\/+/, "");
  if (!k || k.includes("..") || k.length > 300) return null;
  return k;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}
