import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import AuthForm from "../components/AuthForm";
import PortalLayout from "../components/PortalLayout";

export default function VoterRegisterPage({ user, onRegister, theme, onToggleTheme }) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    full_name: "",
    username: "",
    password: "",
    email: "",
    phone_number: "",
    department_name: "",
  });
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
      await onRegister(formData, "voter");
      navigate("/voter/dashboard");
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout
      eyebrow="Voter Setup"
      title="Voter Register"
      subtitle="Create a voter account to access elections and compains."
      user={user}
      accent="blue"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <AuthForm
        title="Create voter access"
        subtitle="Use a unique username. After registration you can open the voter dashboard."
        formData={formData}
        onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        submitLabel="Create voter account"
        fields={[
          { name: "full_name", label: "Full name", type: "text", required: true },
          { name: "username", label: "Username", type: "text", required: true },
          { name: "password", label: "Password", type: "password", required: true },
          { name: "email", label: "Email", type: "email", required: false },
          { name: "phone_number", label: "Phone number", type: "tel", required: false },
          { name: "department_name", label: "Department", type: "text", required: false },
        ]}
      />
    </PortalLayout>
  );
}
