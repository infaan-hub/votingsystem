import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import AuthForm from "../components/AuthForm";
import PortalLayout from "../components/PortalLayout";

export default function AdminLoginPage({ user, onLogin, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user?.app_role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(formData, "admin");
      navigate("/admin/dashboard");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout
      eyebrow="Admin Portal"
      title="Admin Login"
      subtitle="Access the election management workspace for candidate and voter onboarding."
      user={user}
      accent="dark"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <AuthForm
        title="Admin Login"
        subtitle="Use an admin account to manage elections, deadlines, candidates, and voters."
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
            <p className="muted">Need a local admin account for this portal?</p>
            <Link className="inline-link" to="/admin/register">
              Open registration
            </Link>
          </article>
        }
      />
    </PortalLayout>
  );
}
