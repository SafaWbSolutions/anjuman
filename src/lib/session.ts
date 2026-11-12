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
    .select("id, full_name, phone, email, role, tenant_id, member_id, is_active, photo_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!profile) return null;
  if (profile.is_active === false) {
    throw new Error("This account has been deactivated. Contact the sadar.");
  }

  let tenantName = "";
  let tenantLogoUrl: string | null = null;
  if (profile.tenant_id) {
    // my_tenant_status() bypasses RLS so it keeps working when
    // current_tenant_id() is NULL for a suspended tenant.
    let tenantStatus: string | null = null;
    const { data: statusData } = await supabase.rpc("my_tenant_status");
    if (typeof statusData === "string") tenantStatus = statusData;

    const { data: tenant } = await supabase
      .from("tenants")
      .select("name, status, logo_url")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    tenantName = tenant?.name ?? "";
    tenantLogoUrl = tenant?.logo_url ?? null;
    if (tenantStatus === null && typeof tenant?.status === "string") {
      tenantStatus = tenant.status;
    }

    // A suspended / expired anjuman must not let ANY of its users in -
    // sadar, khajanchi, collector and members alike. Nothing is deleted:
    // reactivating the tenant restores every login and all data as-is.
    if (tenantStatus === "suspended") {
      throw new Error(
        "Aapka Account Suspend kar diya gaya hai. Admin se contact karen."
      );
    }
    if (tenantStatus === "read_only") {
      throw new Error(
        "Aapke Anjuman ka plan expire ho gaya hai. Renewal ke liye Admin se contact karen."
      );
    }
  }

  return {
    id: profile.id,
    name: profile.full_name ?? "User",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    role: (profile.role as Role) ?? "member",
    tenantId: profile.tenant_id ?? null,
    tenantName,
    tenantLogoUrl,
    memberId: profile.member_id ?? null,
    photoUrl: profile.photo_url ?? null,
  };
}

/** Current Supabase user id, or null when signed out. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase || isDemoMode) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
