"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchCurrentUser, login, loginWithGoogle, logout } from "@/src/lib/api-client";
import type { PushSubscriptionPayload } from "@/src/lib/notifications/types";

const TOKEN_KEY = "election-hub-token";
/** A tab may re-check the signed-in user at most this often. */
const USER_REVALIDATE_MS = 30_000;

type UserSummary = {
  id: number;
  username: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  role: string;
  auth_provider: string;
  photo_url: string | null;
  phone_number?: string | null;
};

type AuthResponse = {
  token: string;
  user: UserSummary;
};

/** Login either signs in directly, or hands the user an OTP challenge. */
type LoginResult =
  | { status: "authenticated"; user: UserSummary }
  | { status: "otp_required"; challengeId: number; expiresAt: string };

type AppContextType = {
  token: string;
  user: UserSummary | null;
  handleLogin: (credentials: {
    username: string;
    password: string;
    /** Browser push subscription created during the sign-in tap, if any. */
    pushSubscription?: PushSubscriptionPayload | null;
  }) => Promise<LoginResult>;
  /** Stores the token after the OTP code was verified on /otp-verification. */
  completeOtpLogin: (authResponse: AuthResponse) => Promise<UserSummary>;
  handleRegistration: (authResponse: AuthResponse) => Promise<UserSummary>;
  handleGoogleLogin: (payload: { credential?: string; code?: string }) => Promise<UserSummary>;
  handleLogout: () => Promise<void>;
  /** Re-fetches the signed-in user (e.g. after a photo upload). */
  refreshUser: () => Promise<UserSummary | null>;
};

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) || "",
  );
  const [user, setUser] = useState<UserSummary | null>(null);
  const lastUserCheckRef = useRef(0);

  // Sign-in and sign-out in another tab are mirrored here: the `storage`
  // event only fires in the tabs that did not write the value.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== TOKEN_KEY) return;
      const next = event.newValue ?? "";
      setToken((current) => (current === next ? current : next));
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let ignore = false;
    lastUserCheckRef.current = Date.now();
    fetchCurrentUser(token)
      .then((response) => {
        if (!ignore) setUser(response);
      })
      .catch(() => {
        if (!ignore) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setUser(null);
        }
      });
    return () => { ignore = true; };
  }, [token]);

  // Returning to a tab re-checks the account so role or profile changes made
  // elsewhere (an admin promoting this user, a photo update on another
  // device) show up without a manual reload. Throttled, visible tabs only.
  useEffect(() => {
    if (!token) return;
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastUserCheckRef.current < USER_REVALIDATE_MS) return;
      lastUserCheckRef.current = Date.now();
      fetchCurrentUser(token)
        .then((response) => setUser(response))
        .catch(() => {
          /* transient; the next interval or the token effect handles it */
        });
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [token]);

  const handleLogin = useCallback(
    async (credentials: {
      username: string;
      password: string;
      pushSubscription?: PushSubscriptionPayload | null;
    }): Promise<LoginResult> => {
      const response = await login(credentials);
      if (response.otp_required) {
        return {
          status: "otp_required",
          challengeId: response.challenge_id,
          expiresAt: response.expires_at,
        };
      }
      window.localStorage.setItem(TOKEN_KEY, response.token);
      setToken(response.token);
      setUser(response.user);
      return { status: "authenticated", user: response.user };
    },
    [],
  );

  const completeOtpLogin = useCallback(async (authResponse: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, authResponse.token);
    setToken(authResponse.token);
    setUser(authResponse.user);
    return authResponse.user;
  }, []);

  const handleRegistration = useCallback(async (authResponse: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, authResponse.token);
    setToken(authResponse.token);
    setUser(authResponse.user);
    return authResponse.user;
  }, []);

  const handleGoogleLogin = useCallback(async (payload: { credential?: string; code?: string }) => {
    const response = await loginWithGoogle(payload);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const handleLogout = useCallback(async () => {
    if (token) {
      try { await logout(token); } catch { /* ignore */ }
    }
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  }, [token]);

  const refreshUser = useCallback(async () => {
    if (!token) return null;
    try {
      const response = await fetchCurrentUser(token);
      setUser(response);
      return response;
    } catch {
      return null;
    }
  }, [token]);

  const value = useMemo(
    () => ({ token, user, handleLogin, completeOtpLogin, handleRegistration, handleGoogleLogin, handleLogout, refreshUser }),
    [token, user, handleLogin, completeOtpLogin, handleRegistration, handleGoogleLogin, handleLogout, refreshUser],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}