import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { resetPassword } from "../api";
import ScreenCard from "../components/ScreenCard";

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
    <div className="page-stack">
      <ScreenCard
        step={1}
        section="Authentication"
        title="Reset Password"
        subtitle="Enter your username or email, then choose a new password."
      >
        <form className="form-stack" onSubmit={handleSubmit}>
          <div>
            <label className="field-label" htmlFor="reset-identity">
              Username or Email
            </label>
            <input
              id="reset-identity"
              name="identity"
              className="field-input"
              placeholder="Enter username or email"
              autoComplete="username"
              value={form.identity}
              onChange={(event) => setForm((current) => ({ ...current, identity: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="reset-password">
              New Password
            </label>
            <input
              id="reset-password"
              name="new_password"
              type="password"
              className="field-input"
              placeholder="Enter new password"
              autoComplete="new-password"
              value={form.new_password}
              onChange={(event) => setForm((current) => ({ ...current, new_password: event.target.value }))}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="reset-confirm-password">
              Confirm Password
            </label>
            <input
              id="reset-confirm-password"
              name="confirm_password"
              type="password"
              className="field-input"
              placeholder="Confirm new password"
              autoComplete="new-password"
              value={form.confirm_password}
              onChange={(event) =>
                setForm((current) => ({ ...current, confirm_password: event.target.value }))
              }
              required
            />
          </div>
          {error ? <div className="error-banner">{error}</div> : null}
          {success ? <div className="success-banner">{success}</div> : null}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? "Updating Password..." : "Reset Password"}
          </button>
          <div className="button-grid">
            <Link className="secondary-button" to="/admin/login">
              Admin Login
            </Link>
            <Link className="secondary-button" to="/voter/login">
              Voter Login
            </Link>
          </div>
        </form>
      </ScreenCard>
    </div>
  );
}
