import type { Role, SessionUser } from "./types";
import { isDemoMode, supabase } from "./supabase";

/**
 * Build the panel's session object from the database, never from
 * user-editable metadata. `profiles` is protected by RLS, so this
 * query can only ever return the caller's own row.
 */
export async function loadSessionUser(userId: string): Promise<SessionUser | null> {
  if (!supabase || isDemoMode) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, phone, role, tenant_id, is_active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) return null;
  if (profile.is_active === false) {
    throw new Error("This account has been deactivated. Contact the sadar.");
  }

  let tenantName = "";
  if (profile.tenant_id) {
    const { data: tenant } = await supabase
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    tenantName = tenant?.name ?? "";
  }

  return {
    id: profile.id,
    name: profile.full_name ?? "User",
    phone: profile.phone ?? "",
    email: "",
    role: (profile.role as Role) ?? "member",
    tenantId: profile.tenant_id ?? null,
    tenantName,
  };
}

/** Current Supabase user id, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase || isDemoMode) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
