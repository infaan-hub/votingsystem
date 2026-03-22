import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";

import GoogleSignInButton from "../components/GoogleSignInButton";

export default function LoginPage({ role, user, onLogin, onGoogleLogin }) {
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

  const meta = {
    admin: {
      title: "Login Here",
      eyebrow: "Admin Portal",
      subtitle: "Use your admin username and password to manage elections.",
      registerPath: "/admin/register",
      registerLabel: "Create admin account",
    },
    voter: {
      title: "Login Here",
      eyebrow: "Voter Portal",
      subtitle: "Use your voter username and password to access the ballot.",
      registerPath: "/voter/register",
      registerLabel: "Create voter account",
    },
    candidate: {
      title: "Login Here",
      eyebrow: "Candidate Portal",
      subtitle: "Sign in with the credentials assigned to your candidate account.",
      registerPath: null,
      registerLabel: "",
    },
  }[role];

  function redirectUser(nextUser) {
    const fallbackTarget =
      role === "admin" ? "/admin/dashboard" : role === "candidate" ? "/candidate/dashboard" : "/voter/dashboard";
    navigate(typeof location.state?.from === "string" ? location.state.from : fallbackTarget, {
      replace: true,
    });
    return nextUser;
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
      redirectUser(nextUser);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleCode(code) {
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await onGoogleLogin({ code, role });
      if (role === "admin" && nextUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }
      if (role !== "admin" && nextUser.role === "admin") {
        throw new Error("Admin accounts must use the admin portal.");
      }
      redirectUser(nextUser);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-stage">
      <div className="auth-card-shell">
        <div className="auth-banner">
          <div className="auth-banner-shape left" />
          <div className="auth-banner-shape right" />
          <p className="auth-banner-kicker">{meta.eyebrow}</p>
          <h2>{meta.title}</h2>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-stack">
            <GoogleSignInButton role={role} onCode={handleGoogleCode} disabled={submitting} />
            <div className="auth-divider">or</div>

            <form className="auth-form-stack" onSubmit={handleSubmit}>
              <div className="auth-field-wrap">
                <input
                  id={`${role}-username`}
                  name="username"
                  className="auth-input"
                  placeholder="Username"
                  autoComplete="username"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  required
                />
              </div>
              <div className="auth-field-wrap password-wrap">
                <input
                  id={`${role}-password`}
                  name="password"
                  type="password"
                  className="auth-input"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
                <span className="password-eye" aria-hidden="true">
                  ◉
                </span>
              </div>

              {error ? <div className="error-banner">{error}</div> : null}

              <button className="auth-submit-button" type="submit" disabled={submitting}>
                {submitting ? "Signing In..." : "Login"}
              </button>
            </form>

            <p className="auth-support-text">
              <Link to="/forgot-password">Request a New Password</Link>
            </p>

            {meta.registerPath ? (
              <p className="auth-footer-link">
                New here? <Link to={meta.registerPath}>{meta.registerLabel}</Link>
              </p>
            ) : (
              <p className="auth-footer-link">Candidates are registered by election administrators.</p>
            )}

            <p className="auth-support-text">
              <Link to="/home">Return Home</Link>
            </p>
            <p className="auth-caption">{meta.subtitle}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
