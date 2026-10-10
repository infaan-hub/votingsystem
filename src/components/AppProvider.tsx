"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, fetchElections, login, loginWithGoogle, logout } from "@/src/lib/api-client";

const TOKEN_KEY = "election-hub-token";
const THEME_KEY = "election-hub-theme";
/** Marks that the user toggled the theme manually, pinning it against the OS. */
const THEME_EXPLICIT_KEY = "election-hub-theme-explicit";
const ELECTIONS_CACHE_KEY = "election-hub-elections";

type UserSummary = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  auth_provider: string;
};

type AuthResponse = {
  token: string;
  user: UserSummary;
};

type AppContextType = {
  token: string;
  theme: string;
  user: UserSummary | null;
  elections: unknown[];
  appError: string;
  handleLogin: (credentials: { username: string; password: string }) => Promise<UserSummary>;
  handleRegistration: (authResponse: AuthResponse) => Promise<UserSummary>;
  handleGoogleLogin: (payload: { credential: string }) => Promise<UserSummary>;
  handleLogout: () => Promise<void>;
  toggleTheme: () => void;
};

const AppContext = createContext<AppContextType | null>(null);

function readCachedElections(): unknown[] {
  try {
    const cachedValue = window.localStorage.getItem(ELECTIONS_CACHE_KEY);
    if (!cachedValue) return [];
    const parsedValue = JSON.parse(cachedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

/** Reads the OS preference. Falls back to light when the API is unavailable. */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) || "",
  );
  // Stored choice wins; otherwise follow the OS setting (iOS + Android).
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(THEME_KEY) || (systemPrefersDark() ? "dark" : "light");
  });
  const [user, setUser] = useState<UserSummary | null>(null);
  const [elections, setElections] = useState<unknown[]>(() => (typeof window === "undefined" ? [] : readCachedElections()));
  const [appError, setAppError] = useState("");

  // Keep the document class in sync. The choice is only *persisted* once the
  // user has explicitly toggled, so an unset theme keeps tracking the OS.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.style.colorScheme = theme === "dark" ? "dark" : "light";
    if (window.localStorage.getItem(THEME_EXPLICIT_KEY)) {
      window.localStorage.setItem(THEME_KEY, theme);
    }
  }, [theme]);

  // Track OS contrast preference so the `.hc` variant stays accurate.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-contrast: more)");
    const apply = () =>
      document.documentElement.classList.toggle("hc", query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  // Follow OS theme changes only while the user has not made an explicit choice.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!window.localStorage.getItem(THEME_EXPLICIT_KEY)) {
        setTheme(event.matches ? "dark" : "light");
      }
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    let ignore = false;
    fetchElections()
      .then((response) => {
        if (ignore) return;
        setElections(response);
        setAppError("");
      })
      .catch((requestError: Error) => {
        if (!ignore) setAppError(requestError.message);
      });
    return () => { ignore = true; };
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let ignore = false;
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

  const handleLogin = useCallback(async (credentials: { username: string; password: string }) => {
    const response = await login(credentials);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const handleRegistration = useCallback(async (authResponse: AuthResponse) => {
    window.localStorage.setItem(TOKEN_KEY, authResponse.token);
    setToken(authResponse.token);
    setUser(authResponse.user);
    return authResponse.user;
  }, []);

  const handleGoogleLogin = useCallback(async (payload: { credential: string }) => {
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

  const toggleTheme = useCallback(() => {
    window.localStorage.setItem(THEME_EXPLICIT_KEY, "1");
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(
    () => ({ token, theme, user, elections, appError, handleLogin, handleRegistration, handleGoogleLogin, handleLogout, toggleTheme }),
    [token, theme, user, elections, appError, handleLogin, handleRegistration, handleGoogleLogin, handleLogout, toggleTheme],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}