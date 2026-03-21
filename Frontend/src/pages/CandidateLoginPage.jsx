import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import AuthForm from "../components/AuthForm";
import PortalLayout from "../components/PortalLayout";

export default function CandidateLoginPage({ user, onLogin, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user && user.app_role !== "admin") {
    return <Navigate to="/candidate/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onLogin(formData, "candidate");
      navigate("/candidate/dashboard");
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout
      eyebrow="Candidate Portal"
      title="Candidate Login"
      subtitle="Candidates sign in after being registered by the admin workspace."
      user={user}
      accent="amber"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <AuthForm
        title="Candidate Login"
        subtitle="Candidate accounts are created by admin, then used to open candidate dashboards and compain details."
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
      />
    </PortalLayout>
  );
}
