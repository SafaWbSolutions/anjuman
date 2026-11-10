import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Browser client. Uses the public `anon` key — safe to ship, because every
 * row is protected by Postgres Row Level Security keyed on the JWT claims.
 *
 * The `service_role` key must NEVER appear in this bundle. Privileged
 * operations live in Supabase Edge Functions.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { headers: { "x-client-info": "anjuman-admin" } },
    })
  : null;
