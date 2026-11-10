"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Role, SessionUser } from "./types";
import { ROLE_LABEL } from "./types";
import { activeTenant } from "./mock";
import { isSupabaseConfigured, supabase } from "./supabase";

const STORAGE_KEY = "anjuman.session";

const DEMO_USERS: Record<Role, SessionUser> = {
  super_admin: {
    id: "u-super",
    name: "Platform Admin",
    phone: "+91 90000 00001",
    email: "admin@anjuman.app",
    role: "super_admin",
    tenantId: null,
    tenantName: "Anjuman Platform",
  },
  sadar: {
    id: "u-sadar",
    name: "Muhammad Yusuf",
    phone: "+91 98765 43210",
    email: "sadar@bharauli.in",
    role: "sadar",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
  khajanchi: {
    id: "u-khajanchi",
    name: "Abdul Karim",
    phone: "+91 98765 43211",
    email: "khajanchi@bharauli.in",
    role: "khajanchi",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
  secretary: {
    id: "u-secretary",
    name: "Nadeem Ahmad",
    phone: "+91 98765 43212",
    email: "secretary@bharauli.in",
    role: "secretary",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
  auditor: {
    id: "u-auditor",
    name: "Haji Ashraf Ali",
    phone: "+91 98765 43213",
    email: "auditor@bharauli.in",
    role: "auditor",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
  collector: {
    id: "u-collector",
    name: "Imran Qureshi",
    phone: "+91 98765 43214",
    email: "collector@bharauli.in",
    role: "collector",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
  member: {
    id: "m-1",
    name: "Muhammad Idris",
    phone: "+91 9800000001",
    email: "member@bharauli.in",
    role: "member",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
};

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  demoMode: boolean;
  signIn: (role: Role, email?: string, password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: Role) => void;
  can: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const demoMode = !isSupabaseConfigured;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setUser(JSON.parse(raw) as SessionUser);
    } catch {
      /* ignore corrupted session */
    }
    setReady(true);
  }, []);

  const persist = useCallback((u: SessionUser | null) => {
    setUser(u);
    if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    else window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const signIn = useCallback(
    async (role: Role, email?: string, password?: string) => {
      if (demoMode) {
        const base = DEMO_USERS[role];
        persist(email ? { ...base, email } : base);
        return;
      }
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email ?? "",
        password: password ?? "",
      });
      if (error) throw error;
      const meta = (data.user?.user_metadata ?? {}) as {
        full_name?: string;
        role?: Role;
        tenant_id?: string;
      };
      persist({
        id: data.user!.id,
        name: meta.full_name ?? data.user!.email ?? "User",
        phone: (data.user?.phone as string) ?? "",
        email: data.user?.email ?? "",
        role: (meta.role as Role) ?? "member",
        tenantId: meta.tenant_id ?? null,
        tenantName: "",
      });
    },
    [demoMode, persist]
  );

  const signOut = useCallback(async () => {
    if (supabase && !demoMode) await supabase.auth.signOut();
    persist(null);
  }, [demoMode, persist]);

  const switchRole = useCallback(
    (role: Role) => {
      if (!demoMode) return;
      persist(DEMO_USERS[role]);
    },
    [demoMode, persist]
  );

  const can = useCallback(
    (roles: Role[]) => (user ? roles.includes(user.role) : false),
    [user]
  );

  const value = useMemo(
    () => ({ user, ready, demoMode, signIn, signOut, switchRole, can }),
    [user, ready, demoMode, signIn, signOut, switchRole, can]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function roleLabel(role: Role) {
  return ROLE_LABEL[role];
}
