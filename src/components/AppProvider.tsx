"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { fetchCurrentUser, fetchElections, login, loginWithGoogle, logout } from "@/src/lib/api-client";

const TOKEN_KEY = "election-hub-token";
const THEME_KEY = "election-hub-theme";
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) || "",
  );
  const [theme, setTheme] = useState(() =>
    typeof window === "undefined" ? "light" : window.localStorage.getItem(THEME_KEY) || "light",
  );
  const [user, setUser] = useState<UserSummary | null>(null);
  const [elections, setElections] = useState<unknown[]>(() => (typeof window === "undefined" ? [] : readCachedElections()));
  const [appError, setAppError] = useState("");

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

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