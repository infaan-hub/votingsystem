import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { resetPassword } from "../api";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    identity: "",
    new_password: "",
    confirm_password: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const response = await resetPassword(form);
      setSuccess(response.detail || "Password updated successfully.");
      window.setTimeout(() => {
        navigate("/voter/login", { replace: true });
      }, 900);
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
          <p className="auth-banner-kicker">Account Recovery</p>
          <h2>Reset Password</h2>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-stack">
            <div className="auth-divider">Update your password</div>

            <form className="auth-form-stack" onSubmit={handleSubmit}>
              <div className="auth-field-wrap">
                <input
                  id="reset-identity"
                  name="identity"
                  className="auth-input"
                  placeholder="Username or Email"
                  autoComplete="username"
                  value={form.identity}
                  onChange={(event) => setForm((current) => ({ ...current, identity: event.target.value }))}
                  required
                />
              </div>
              <div className="auth-field-wrap password-wrap">
                <input
                  id="reset-password"
                  name="new_password"
                  type="password"
                  className="auth-input"
                  placeholder="New Password"
                  autoComplete="new-password"
                  value={form.new_password}
                  onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
                  required
                />
                <span className="password-eye" aria-hidden="true">
                  ◉
                </span>
              </div>
              <div className="auth-field-wrap password-wrap">
                <input
                  id="reset-confirm-password"
                  name="confirm_password"
                  type="password"
                  className="auth-input"
                  placeholder="Confirm Password"
                  autoComplete="new-password"
                  value={form.confirm_password}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, confirm_password: event.target.value }))
                  }
                  required
                />
                <span className="password-eye" aria-hidden="true">
                  ◉
                </span>
              </div>

              {error ? <div className="error-banner">{error}</div> : null}
              {success ? <div className="success-banner">{success}</div> : null}

              <button className="auth-submit-button" type="submit" disabled={submitting}>
                {submitting ? "Updating Password..." : "Reset Password"}
              </button>
            </form>

            <p className="auth-footer-link">
              Remembered your password? <Link to="/voter/login">Log in here</Link>
            </p>
            <p className="auth-support-text">
              <Link to="/home">Return Home</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
