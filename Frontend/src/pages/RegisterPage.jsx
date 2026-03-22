import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerAdmin, registerVoter } from "../api";
import GoogleSignInButton from "../components/GoogleSignInButton";
import ScreenCard from "../components/ScreenCard";

const FIELD_CONFIG = {
  admin: [
    { key: "full_name", label: "Full Name", autoComplete: "name", required: true },
    { key: "username", label: "Username", autoComplete: "username", required: true },
    { key: "email", label: "Email", type: "email", autoComplete: "email", required: true },
    { key: "staff_id", label: "Staff ID", autoComplete: "off", required: true },
    { key: "password", label: "Password", type: "password", autoComplete: "new-password", required: true },
    {
      key: "confirm_password",
      label: "Confirm Password",
      type: "password",
      autoComplete: "new-password",
      required: true,
    },
  ],
  voter: [
    { key: "first_name", label: "First Name", autoComplete: "given-name", required: true },
    { key: "last_name", label: "Last Name", autoComplete: "family-name", required: true },
    { key: "username", label: "Username", autoComplete: "username", required: true },
    { key: "email", label: "Email", type: "email", autoComplete: "email", required: true },
    {
      key: "registration_number",
      label: "Registration Number",
      autoComplete: "off",
      required: true,
    },
    { key: "password", label: "Password", type: "password", autoComplete: "new-password", required: true },
    {
      key: "confirm_password",
      label: "Confirm Password",
      type: "password",
      autoComplete: "new-password",
      required: true,
    },
  ],
};

const INITIAL_FORM = {
  full_name: "",
  first_name: "",
  last_name: "",
  username: "",
  email: "",
  staff_id: "",
  registration_number: "",
  password: "",
  confirm_password: "",
};

export default function RegisterPage({ role, onRegister, onGoogleLogin }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fields = FIELD_CONFIG[role];
  const meta = {
    admin: {
      title: "Admin Register",
      subtitle: "Create an administrator account for Election Hub access.",
      loginPath: "/admin/login",
      request: registerAdmin,
      successMessage: "Admin account created successfully. Redirecting to the admin dashboard...",
      dashboardPath: "/admin/dashboard",
      allowGoogleCreate: true,
    },
    voter: {
      title: "Voter Register",
      subtitle: "Create your voter account and continue into Election Hub.",
      loginPath: "/voter/login",
      request: registerVoter,
      successMessage: "Voter account created successfully. Redirecting to your dashboard...",
      dashboardPath: "/voter/dashboard",
      allowGoogleCreate: true,
    },
  }[role];

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const authResponse = await meta.request(
        fields.reduce((payload, field) => {
          payload[field.key] = form[field.key];
          return payload;
        }, {}),
      );
      if (onRegister) {
        await onRegister(authResponse);
      }
      setSuccess(meta.successMessage);
      window.setTimeout(() => {
        navigate(meta.dashboardPath, { replace: true });
      }, 900);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleCode(code) {
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const authResponse = await onGoogleLogin({ code, role });
      setSuccess(
        role === "voter"
          ? "Google account verified successfully. Redirecting to your dashboard..."
          : "Google account verified successfully. Redirecting now...",
      );
      window.setTimeout(() => {
        navigate(meta.dashboardPath, { replace: true });
      }, 900);
      return authResponse;
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <ScreenCard step={2} section="Authentication" title={meta.title} subtitle={meta.subtitle}>
        <form className="panel-grid two-col" onSubmit={handleSubmit}>
          {fields.map((field) => (
            <div key={field.key}>
              <label className="field-label" htmlFor={`${role}-${field.key}`}>
                {field.label}
              </label>
              <input
                id={`${role}-${field.key}`}
                name={field.key}
                type={field.type || "text"}
                className="field-input"
                placeholder={field.label}
                autoComplete={field.autoComplete}
                value={form[field.key]}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    [field.key]: event.target.value,
                  }))
                }
                required={field.required}
              />
            </div>
          ))}
          {error ? <div className="span-2 error-banner">{error}</div> : null}
          {success ? <div className="span-2 success-banner">{success}</div> : null}
          <div className="span-2 info-note">
            Fill in your details carefully. Your Election Hub account will be created immediately after
            submission.
          </div>
          <div className="span-2 button-grid">
            <button className="primary-button" type="submit" disabled={submitting}>
              {submitting ? "Creating Account..." : "Create Account"}
            </button>
            <Link className="secondary-button" to={meta.loginPath}>
              Go to Login
            </Link>
          </div>
          <div className="span-2">
            {meta.allowGoogleCreate ? (
              <GoogleSignInButton role={role} onCode={handleGoogleCode} disabled={submitting} />
            ) : (
              <div className="info-note">
                Google sign-in can be used after an administrator account has already been created and linked by
                email.
              </div>
            )}
          </div>
        </form>
      </ScreenCard>
    </div>
  );
}
