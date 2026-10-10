"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { fetchCurrentUser, fetchElections, login, loginWithGoogle, logout } from "@/src/lib/api-client";

const TOKEN_KEY = "election-hub-token";
const THEME_KEY = "election-hub-theme";
const ELECTIONS_CACHE_KEY = "election-hub-elections";
const SELECTED_ELECTION_KEY = "election-hub-selected-election";

function readCachedElections() {
  try {
    const cachedValue = window.localStorage.getItem(ELECTIONS_CACHE_KEY);
    if (!cachedValue) {
      return [];
    }
    const parsedValue = JSON.parse(cachedValue);
    return Array.isArray(parsedValue) ? parsedValue : [];
  } catch {
    return [];
  }
}

function getPreferredElectionId(electionEntries, currentSelection) {
  if (!electionEntries.length) {
    return null;
  }
  const matchingSelection = electionEntries.find((entry) => String(entry.id) === String(currentSelection));
  if (matchingSelection) {
    return String(matchingSelection.id);
  }
  const preferredElection =
    electionEntries.find((entry) => entry.status === "active") ||
    electionEntries.find((entry) => entry.status === "upcoming") ||
    electionEntries[0];
  return preferredElection ? String(preferredElection.id) : null;
}

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [token, setToken] = useState(() =>
    typeof window === "undefined" ? "" : window.localStorage.getItem(TOKEN_KEY) || "",
  );
  const [theme, setTheme] = useState(() =>
    typeof window === "undefined" ? "light" : window.localStorage.getItem(THEME_KEY) || "light",
  );
  const [user, setUser] = useState(null);
  const [elections, setElections] = useState(() => (typeof window === "undefined" ? [] : readCachedElections()));
  const [selectedElectionId, setSelectedElectionId] = useState(() => {
    if (typeof window === "undefined") {
      return null;
    }
    const cachedElections = readCachedElections();
    const cachedSelection = window.localStorage.getItem(SELECTED_ELECTION_KEY);
    return getPreferredElectionId(cachedElections, cachedSelection);
  });
  const [appError, setAppError] = useState("");

  useEffect(() => {
    window.localStorage.setItem(THEME_KEY, theme);
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    let ignore = false;
    fetchElections()
      .then((response) => {
        if (ignore) {
          return;
        }
        setElections(response);
        setSelectedElectionId((currentSelection) => getPreferredElectionId(response, currentSelection));
        setAppError("");
      })
      .catch((requestError) => {
        if (!ignore) {
          setAppError(requestError.message);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(ELECTIONS_CACHE_KEY, JSON.stringify(elections));
  }, [elections]);

  useEffect(() => {
    if (selectedElectionId) {
      window.localStorage.setItem(SELECTED_ELECTION_KEY, selectedElectionId);
      return;
    }
    window.localStorage.removeItem(SELECTED_ELECTION_KEY);
  }, [selectedElectionId]);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let ignore = false;
    fetchCurrentUser(token)
      .then((response) => {
        if (!ignore) {
          setUser(response);
        }
      })
      .catch(() => {
        if (!ignore) {
          window.localStorage.removeItem(TOKEN_KEY);
          setToken("");
          setUser(null);
        }
      });
    return () => {
      ignore = true;
    };
  }, [token]);

  const handleLogin = useCallback(async (credentials) => {
    const response = await login(credentials);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const handleRegistration = useCallback(async (authResponse) => {
    window.localStorage.setItem(TOKEN_KEY, authResponse.token);
    setToken(authResponse.token);
    setUser(authResponse.user);
    return authResponse.user;
  }, []);

  const handleGoogleLogin = useCallback(async (payload) => {
    const response = await loginWithGoogle(payload);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }, []);

  const handleLogout = useCallback(async () => {
    if (token) {
      try {
        await logout(token);
      } catch {
        // Local cleanup is enough.
      }
    }
    window.localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
  }, [token]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(
    () => ({
      token,
      theme,
      user,
      elections,
      selectedElectionId,
      setSelectedElectionId,
      appError,
      handleLogin,
      handleRegistration,
      handleGoogleLogin,
      handleLogout,
      toggleTheme,
    }),
    [
      token,
      theme,
      user,
      elections,
      selectedElectionId,
      appError,
      handleLogin,
      handleRegistration,
      handleGoogleLogin,
      handleLogout,
      toggleTheme,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  return useContext(AppContext);
}
