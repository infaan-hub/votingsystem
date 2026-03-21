import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import AuthForm from "../components/AuthForm";
import PortalLayout from "../components/PortalLayout";

export default function VoterLoginPage({ user, onLogin, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user && user.app_role !== "admin") {
    return <Navigate to="/voter/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(formData, "voter");
      navigate("/voter/dashboard");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout
      eyebrow="Voter Portal"
      title="Voter Login"
      subtitle="Open the election dashboard and campaign pages from a voter account."
      user={user}
      accent="blue"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <AuthForm
        title="Voter Login"
        subtitle="Use your voter credentials to open elections and candidate compains."
        formData={formData}
        onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        submitLabel="Sign in"
        fields={[
          { name: "username", label: "Username", type: "text", required: true },
          { name: "password", label: "Password", type: "password", required: true },
        ]}
        footer={
          <article className="sheet-card soft-card">
            <p className="muted">Need a voter account for this portal?</p>
            <Link className="inline-link" to="/voter/register">
              Open registration
            </Link>
          </article>
        }
      />
    </PortalLayout>
  );
}
