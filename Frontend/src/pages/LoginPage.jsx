import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";

import ScreenCard from "../components/ScreenCard";

export default function LoginPage({ role, user, onLogin }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    if (role === "admin" && user.role === "admin") {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (role === "candidate" && user.role !== "admin") {
      return <Navigate to="/candidate/dashboard" replace />;
    }
    if (role === "voter" && user.role !== "admin") {
      return <Navigate to="/voter/dashboard" replace />;
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await onLogin(form);
      if (role === "admin" && nextUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }
      if (role !== "admin" && nextUser.role === "admin") {
        throw new Error("Admin accounts must use the admin portal.");
      }
      const fallbackTarget =
        role === "admin" ? "/admin/dashboard" : role === "candidate" ? "/candidate/dashboard" : "/voter/dashboard";
      navigate(typeof location.state?.from === "string" ? location.state.from : fallbackTarget, {
        replace: true,
      });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  const meta = {
    admin: {
      title: "Admin Login",
      subtitle: "Secure election management access",
      registerPath: "/admin/register",
    },
    voter: {
      title: "Voter Login",
      subtitle: "Secure voter access",
      registerPath: "/voter/register",
    },
    candidate: {
      title: "Candidate Login",
      subtitle: "Candidates sign in after being registered by admin",
      registerPath: null,
    },
  }[role];

  return (
    <div className="page-stack">
      <ScreenCard step={1} section="Authentication" title={meta.title} subtitle={meta.subtitle}>
        <form className="form-stack" onSubmit={handleSubmit}>
          <div>
            <label className="field-label" htmlFor={`${role}-username`}>
              Phone / Voter ID / Username
            </label>
            <input
              id={`${role}-username`}
              name="username"
              className="field-input"
              placeholder="Enter your username"
              value={form.username}
              onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor={`${role}-password`}>
              Password
            </label>
            <input
              id={`${role}-password`}
              name="password"
              type="password"
              className="field-input"
              placeholder="********"
              value={form.password}
              onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Signing In..." : "Login"}
          </button>
          <div className="button-grid">
            {meta.registerPath ? (
              <Link className="secondary-button" to={meta.registerPath}>
                Create Account
              </Link>
            ) : (
              <div className="info-note">Candidates are registered by election administrators.</div>
            )}
            <Link className="secondary-button" to="/home">
              Return Home
            </Link>
          </div>
        </form>
      </ScreenCard>
    </div>
  );
}
