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
import { MFA_ROLES, ROLE_LABEL } from "./types";
import { activeTenant } from "./mock";
import { isDemoMode, supabase } from "./supabase";
import { loadSessionUser } from "./session";

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
    memberId: "m-1",
    tenantId: activeTenant.id,
    tenantName: activeTenant.name,
  },
};

interface AuthState {
  user: SessionUser | null;
  ready: boolean;
  demoMode: boolean;
  signIn: (
    role: Role,
    email?: string,
    password?: string
  ) => Promise<{ step: "done" | "totp" | "email" }>;
  verifyMfa: (code: string) => Promise<void>;
  cancelMfa: () => Promise<void>;
  mfaPending: { role: Role; factorId: string } | null;
  emailOtp: { email: string; role: Role } | null;
  verifyEmailOtp: (token: string) => Promise<void>;
  cancelEmailOtp: () => Promise<void>;
  signOut: () => Promise<void>;
  switchRole: (role: Role) => void;
  refreshUser: () => Promise<void>;
  updateLocalUser: (patch: Partial<SessionUser>) => void;
  can: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mfaPending, setMfaPending] = useState<{ role: Role; factorId: string } | null>(null);
  const [emailOtp, setEmailOtp] = useState<{ email: string; role: Role } | null>(null);
  const demoMode = isDemoMode;

  /** Returns the pending 2FA challenge when this role still owes a TOTP step. */
  const checkMfa = useCallback(async (role: Role) => {
    if (!supabase || !MFA_ROLES.includes(role)) return null;
    try {
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!aal || aal.currentLevel === "aal2") return null;
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const factor = factors?.totp?.find((f) => f.status === "verified");
      return factor ? { role, factorId: factor.id } : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    // Wait until after the first client render so server HTML and the first
    // client render match exactly (no hydration mismatch on static export).
    if (!mounted) return;
    let cancelled = false;

    async function restore() {
      // Demo: restore the picked role from localStorage.
      if (demoMode) {
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) setUser(JSON.parse(raw) as SessionUser);
        } catch {
          /* ignore corrupted session */
        }
        if (!cancelled) setReady(true);
        return;
      }

      // Real mode: trust Supabase's own persisted session, then read
      // the role from `profiles` (never from user_metadata).
      if (!supabase) {
        if (!cancelled) setReady(true);
        return;
      }

      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) {
          const sessionUser = await loadSessionUser(data.session.user.id);
          if (sessionUser && !cancelled) {
            sessionUser.email = data.session.user.email ?? sessionUser.email;
            try {
              window.localStorage.setItem(`anjuman.device.${sessionUser.id}`, "1");
            } catch {
              /* private mode */
            }
            const pending = await checkMfa(sessionUser.role);
            if (pending) {
              setMfaPending(pending);
            } else {
              setUser(sessionUser);
            }
          }
        }
      } catch {
        /* expired or revoked token — stay signed out */
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void restore();

    const subscription = supabase?.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setUser(null);
    });

    return () => {
      cancelled = true;
      subscription?.data.subscription.unsubscribe();
    };
  }, [demoMode, mounted]);

  const persist = useCallback((u: SessionUser | null) => {
    setUser(u);
    if (mounted) {
      if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, [mounted]);

  const signIn = useCallback(
    async (role: Role, email?: string, password?: string) => {
      if (demoMode) {
        const base = DEMO_USERS[role];
        persist(email ? { ...base, email } : base);
        return { step: "done" as const };
      }
      if (!supabase) throw new Error("Supabase is not configured");
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email ?? "",
        password: password ?? "",
      });
      if (error) throw error;
      if (!data.user || !data.session) {
        throw new Error("Email confirm nahi hua. Apna inbox check karein, phir login karein.");
      }

      const sessionUser = await loadSessionUser(data.user.id);
      if (!sessionUser) {
        await supabase.auth.signOut();
        throw new Error("Is account ka koi profile nahi mila. Sadar se sampark karein.");
      }
      sessionUser.email = data.user.email ?? sessionUser.email;

      // 1) Authenticator app, if this user chose to enroll it.
      const pending = await checkMfa(sessionUser.role);
      if (pending) {
        setMfaPending(pending);
        return { step: "totp" as const };
      }

      // 2) Office roles on an unrecognised device must prove control of
      //    the email once. The same device stays trusted after that.
      const deviceKey = `anjuman.device.${data.user.id}`;
      let trusted = false;
      try {
        trusted = window.localStorage.getItem(deviceKey) === "1";
      } catch {
        trusted = false;
      }

      if (MFA_ROLES.includes(sessionUser.role) && !trusted) {
        const userEmail = data.user.email ?? email ?? "";
        await supabase.auth.signOut();
        const sent = await supabase.auth.signInWithOtp({
          email: userEmail,
          options: {
            shouldCreateUser: false,
            emailRedirectTo: `${window.location.origin}/login/`,
          },
        });
        if (sent.error) throw sent.error;
        setEmailOtp({ email: userEmail, role: sessionUser.role });
        return { step: "email" as const };
      }

      setUser(sessionUser);
      return { step: "done" as const };
    },
    [demoMode, checkMfa]
  );

  const verifyEmailOtp = useCallback(
    async (token: string) => {
      if (!supabase || !emailOtp) throw new Error("Verification session nahi mila — dobara login karein");
      const { error } = await supabase.auth.verifyOtp({
        email: emailOtp.email,
        token: token.trim(),
        type: "email",
      });
      if (error) throw error;

      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) throw new Error("Session expire ho gaya — dobara login karein");
      const sessionUser = await loadSessionUser(data.session.user.id);
      if (!sessionUser) throw new Error("Profile nahi mila");
      sessionUser.email = data.session.user.email ?? sessionUser.email;
      try {
        window.localStorage.setItem(`anjuman.device.${sessionUser.id}`, "1");
      } catch {
        /* private mode */
      }
      setUser(sessionUser);
      setEmailOtp(null);
    },
    [emailOtp]
  );

  const cancelEmailOtp = useCallback(async () => {
    if (supabase && !demoMode) await supabase.auth.signOut();
    setEmailOtp(null);
  }, [demoMode]);

  const verifyMfa = useCallback(async (code: string) => {
    if (!supabase || !mfaPending) throw new Error("2FA session nahi mila — dobara login karein");
    const challenge = await supabase.auth.mfa.challenge({ factorId: mfaPending.factorId });
    if (challenge.error) throw challenge.error;
    const verified = await supabase.auth.mfa.verify({
      factorId: mfaPending.factorId,
      challengeId: challenge.data.id,
      code: code.trim(),
    });
    if (verified.error) throw verified.error;

    const { data } = await supabase.auth.getSession();
    if (!data.session?.user) throw new Error("Session expire ho gaya — dobara login karein");
    const sessionUser = await loadSessionUser(data.session.user.id);
    if (!sessionUser) throw new Error("Profile nahi mila");
    sessionUser.email = data.session.user.email ?? sessionUser.email;
    try {
      window.localStorage.setItem(`anjuman.device.${sessionUser.id}`, "1");
    } catch {
      /* private mode */
    }
    setUser(sessionUser);
    setMfaPending(null);
  }, [mfaPending]);

  const cancelMfa = useCallback(async () => {
    if (supabase && !demoMode) await supabase.auth.signOut();
    setMfaPending(null);
  }, [demoMode]);

  const signOut = useCallback(async () => {
    if (supabase && !demoMode) await supabase.auth.signOut();
    setMfaPending(null);
    setEmailOtp(null);
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

  const refreshUser = useCallback(async () => {
    if (demoMode || !supabase) return;
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return;
    const fresh = await loadSessionUser(session.user.id);
    if (!fresh) return;
    fresh.email = session.user.email ?? fresh.email;
    setUser(fresh);
  }, [demoMode]);

  const updateLocalUser = useCallback((patch: Partial<SessionUser>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      demoMode,
      signIn,
      verifyMfa,
      cancelMfa,
      mfaPending,
      emailOtp,
      verifyEmailOtp,
      cancelEmailOtp,
      signOut,
      switchRole,
      refreshUser,
      updateLocalUser,
      can,
    }),
    [
      user,
      ready,
      demoMode,
      signIn,
      verifyMfa,
      cancelMfa,
      mfaPending,
      emailOtp,
      verifyEmailOtp,
      cancelEmailOtp,
      signOut,
      switchRole,
      refreshUser,
      updateLocalUser,
      can,
    ]
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
