import { useEffect, useMemo, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { fetchCurrentUser, fetchElections, login, logout } from "./api";
import Layout from "./components/Layout";
import CampaignsPage from "./pages/CampaignsPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import ResultsPage from "./pages/ResultsPage";
import VotePage from "./pages/VotePage";

const TOKEN_KEY = "campus-voting-token";

export default function App() {
  const [elections, setElections] = useState([]);
  const [selectedElectionId, setSelectedElectionId] = useState(null);
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [appError, setAppError] = useState("");

  useEffect(() => {
    let ignore = false;
    fetchElections()
      .then((data) => {
        if (ignore) {
          return;
        }
        setElections(data);
        const preferredElection =
          data.find((entry) => entry.status === "active") ||
          data.find((entry) => entry.status === "upcoming") ||
          data[0];
        setSelectedElectionId((current) => current ?? preferredElection?.id ?? null);
      })
      .catch((error) => {
        if (!ignore) {
          setAppError(error.message);
        }
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }
    let ignore = false;
    fetchCurrentUser(token)
      .then((data) => {
        if (!ignore) {
          setUser(data);
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

  const selectedElection = useMemo(
    () => elections.find((election) => election.id === selectedElectionId) || null,
    [elections, selectedElectionId],
  );

  async function handleLogin(credentials) {
    const response = await login(credentials);
    window.localStorage.setItem(TOKEN_KEY, response.token);
    setToken(response.token);
    setUser(response.user);
  }

  async function handleLogout() {
    try {
      if (token) {
        await logout(token);
      }
    } catch {
      // Local cleanup is enough if the backend token has already expired.
    } finally {
      window.localStorage.removeItem(TOKEN_KEY);
      setToken("");
      setUser(null);
    }
  }

  if (loading) {
    return <div className="loading-screen">Loading election workspace...</div>;
  }

  return (
    <Layout
      elections={elections}
      selectedElectionId={selectedElectionId}
      onSelectElection={setSelectedElectionId}
      user={user}
      onLogout={handleLogout}
    >
      {appError ? <div className="status-banner error">{appError}</div> : null}
      {!selectedElection ? (
        <section className="empty-state card">
          <h2>No elections found.</h2>
          <p className="muted">
            Create and publish an election in the Django admin to populate this interface.
          </p>
        </section>
      ) : (
        <Routes>
          <Route path="/" element={<HomePage electionId={selectedElection.id} token={token} />} />
          <Route path="/campaigns" element={<CampaignsPage electionId={selectedElection.id} />} />
          <Route
            path="/vote"
            element={<VotePage electionId={selectedElection.id} token={token} user={user} />}
          />
          <Route
            path="/results"
            element={<ResultsPage electionId={selectedElection.id} token={token} />}
          />
          <Route path="/login" element={<LoginPage onLogin={handleLogin} user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      )}
    </Layout>
  );
}
