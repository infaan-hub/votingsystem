import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function LoginPage({ onLogin, user }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setIsSubmitting(true);
      setError("");
      await onLogin(formData);
      navigate("/home");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (user) {
    return (
      <section className="empty-state card section-surface">
        <h2>You are already logged in.</h2>
        <p className="muted">Open the ballot page to cast your vote.</p>
      </section>
    );
  }

  return (
    <section className="login-wrap">
      <div className="auth-showcase">
        <div className="auth-cover">
          <p className="eyebrow hero-eyebrow">Access Ballot</p>
          <h2>Sign in to vote</h2>
          <p>
            Use your student or staff account to open the election app, review campaigns,
            and submit your secure ballot.
          </p>
        </div>

        <form className="form-card auth-form" onSubmit={handleSubmit}>
          <div className="form-heading">
            <strong>Campus login</strong>
            <p className="muted">Enter the credentials assigned to your role.</p>
          </div>

          <label className="field auth-field">
            <span>Username</span>
            <input
              className="input"
              type="text"
              value={formData.username}
              onChange={(event) =>
                setFormData((current) => ({ ...current, username: event.target.value }))
              }
              required
            />
          </label>

          <label className="field auth-field">
            <span>Password</span>
            <input
              className="input"
              type="password"
              value={formData.password}
              onChange={(event) =>
                setFormData((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </label>

          {error ? <div className="status-banner error">{error}</div> : null}

          <button className="action-button wide" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : "Login"}
          </button>

          <div className="demo-strip">
            <div>
              <span className="demo-label">Student demo</span>
              <strong>student_a / Pass1234!</strong>
            </div>
            <div>
              <span className="demo-label">Admin demo</span>
              <strong>admin / Admin123!</strong>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
