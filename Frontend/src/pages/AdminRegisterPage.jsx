import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import AuthForm from "../components/AuthForm";
import PortalLayout from "../components/PortalLayout";

export default function AdminRegisterPage({ user, onRegister, theme, onToggleTheme }) {
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

  if (user?.app_role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await onRegister(formData, "admin");
      navigate("/admin/dashboard");
    } catch (registerError) {
      setError(registerError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PortalLayout
      eyebrow="Admin Setup"
      title="Admin Register"
      subtitle="Create admin access for the election hub system."
      user={user}
      accent="dark"
      theme={theme}
      onToggleTheme={onToggleTheme}
    >
      <AuthForm
        title="Create admin access"
        subtitle="Use a unique username. Admin accounts can manage all election flows."
        formData={formData}
        onChange={(name, value) => setFormData((current) => ({ ...current, [name]: value }))}
        onSubmit={handleSubmit}
        submitting={submitting}
        error={error}
        submitLabel="Create admin account"
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
