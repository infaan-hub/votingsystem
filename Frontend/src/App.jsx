import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { fetchCurrentUser, fetchElections, login, loginWithGoogle, logout } from "./api";
import AppShell from "./components/AppShell";
import AdminDashboardPage from "./pages/AdminDashboardPage";
import CandidateCampaignDetailsPage from "./pages/CandidateCampaignDetailsPage";
import CandidateDashboardPage from "./pages/CandidateDashboardPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import VoterCampaignPage from "./pages/VoterCampaignPage";
import VoterDashboardPage from "./pages/VoterDashboardPage";

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

export default function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [theme, setTheme] = useState(() => window.localStorage.getItem(THEME_KEY) || "light");
  const [user, setUser] = useState(null);
  const [elections, setElections] = useState(() => readCachedElections());
  const [selectedElectionId, setSelectedElectionId] = useState(() => {
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

  async function handleLogin(credentials) {
    const response = await login(credentials);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }

  async function handleRegistration(authResponse) {
    window.localStorage.setItem(TOKEN_KEY, authResponse.token);
    setToken(authResponse.token);
    setUser(authResponse.user);
    return authResponse.user;
  }

  async function handleGoogleLogin(payload) {
    const response = await loginWithGoogle(payload);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
    return response.user;
  }

  async function handleLogout() {
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
  }

  return (
    <AppShell user={user} onLogout={handleLogout} theme={theme} onToggleTheme={() => setTheme((current) => (current === "light" ? "dark" : "light"))}>
      {appError ? <div className="error-banner">{appError}</div> : null}
      <Routes>
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route
          path="/home"
          element={
            <HomePage
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
              user={user}
            />
          }
        />
        <Route
          path="/admin/login"
          element={<LoginPage role="admin" user={user} onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />}
        />
        <Route
          path="/voter/login"
          element={<LoginPage role="voter" user={user} onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />}
        />
        <Route
          path="/candidate/login"
          element={
            <LoginPage role="candidate" user={user} onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} />
          }
        />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route
          path="/admin/register"
          element={<RegisterPage role="admin" onRegister={handleRegistration} onGoogleLogin={handleGoogleLogin} />}
        />
        <Route
          path="/voter/register"
          element={<RegisterPage role="voter" onRegister={handleRegistration} onGoogleLogin={handleGoogleLogin} />}
        />
        <Route
          path="/admin/dashboard"
          element={
            <AdminDashboardPage
              user={user}
              token={token}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route
          path="/voter/dashboard"
          element={
            <VoterDashboardPage
              user={user}
              token={token}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route path="/voter/dashboad" element={<Navigate to="/voter/dashboard" replace />} />
        <Route
          path="/voter/compain"
          element={
            <VoterCampaignPage
              user={user}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route
          path="/candidate/dashboard"
          element={
            <CandidateDashboardPage
              user={user}
              token={token}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route path="/candidate/dashboad" element={<Navigate to="/candidate/dashboard" replace />} />
        <Route
          path="/candidate/compaindetails"
          element={
            <CandidateCampaignDetailsPage
              user={user}
              token={token}
              elections={elections}
              selectedElectionId={selectedElectionId}
              onSelectElection={setSelectedElectionId}
            />
          }
        />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </AppShell>
  );
}
