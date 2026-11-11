// Creates a login for a member or office bearer from the panel.
// Runs with the service role, but only after verifying that the caller
// is a sadar / secretary of the same tenant (or a platform admin).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";

  const caller = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await caller.auth.getUser();
  if (!auth.user) return json({ error: "Not signed in" }, 401);

  const admin = createClient(url, service);
  const { data: me } = await admin
    .from("profiles")
    .select("role, tenant_id, is_active")
    .eq("id", auth.user.id)
    .maybeSingle();

  if (!me || !me.is_active) return json({ error: "No active profile" }, 403);
  if (!["sadar", "secretary", "super_admin"].includes(me.role)) {
    return json({ error: "Only the sadar, secretary or platform admin can create logins" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const role = String(body.role ?? "member");
  const memberId = body.member_id ? String(body.member_id) : null;

  if (!/^.+@.+\..+$/.test(email)) return json({ error: "Valid email required" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);
  if (!["member", "sadar", "khajanchi", "secretary", "auditor", "collector"].includes(role)) {
    return json({ error: "Invalid role" }, 400);
  }

  const tenantId = me.role === "super_admin" && body.tenant_id
    ? String(body.tenant_id)
    : me.tenant_id;
  if (!tenantId) return json({ error: "No anjuman for this account" }, 400);

  if (memberId) {
    const { data: member } = await admin
      .from("members")
      .select("id, tenant_id")
      .eq("id", memberId)
      .maybeSingle();
    if (!member || member.tenant_id !== tenantId) {
      return json({ error: "Member does not belong to this anjuman" }, 400);
    }
  }

  let userId: string | undefined;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });

  if (created.error) {
    // Already registered? Reuse the account and reset its password.
    const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 500 });
    const existing = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
    if (!existing) return json({ error: created.error.message }, 400);
    userId = existing.id;
    const upd = await admin.auth.admin.updateUserById(userId, { password });
    if (upd.error) return json({ error: upd.error.message }, 400);
  } else {
    userId = created.data.user?.id;
  }

  if (!userId) return json({ error: "Could not create the user" }, 500);

  const { error: profileError } = await admin.from("profiles").upsert(
    {
      id: userId,
      tenant_id: tenantId,
      full_name: fullName || null,
      phone: phone || null,
      email,
      role,
      member_id: memberId,
      is_active: true,
    },
    { onConflict: "id" }
  );

  if (profileError) return json({ error: profileError.message }, 400);

  return json({ ok: true, user_id: userId, email, role });
});
