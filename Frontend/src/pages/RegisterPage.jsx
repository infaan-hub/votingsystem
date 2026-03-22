import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { registerAdmin, registerVoter } from "../api";
import GoogleSignInButton from "../components/GoogleSignInButton";

const FIELD_CONFIG = {
  admin: [
    { key: "full_name", placeholder: "Full Name", autoComplete: "name", required: true },
    { key: "username", placeholder: "Username", autoComplete: "username", required: true },
    { key: "email", placeholder: "Email", type: "email", autoComplete: "email", required: true },
    { key: "staff_id", placeholder: "Staff ID", autoComplete: "off", required: true },
    {
      key: "password",
      placeholder: "Password",
      type: "password",
      autoComplete: "new-password",
      required: true,
    },
    {
      key: "confirm_password",
      placeholder: "Confirm Password",
      type: "password",
      autoComplete: "new-password",
      required: true,
    },
  ],
  voter: [
    { key: "first_name", placeholder: "First Name", autoComplete: "given-name", required: true },
    { key: "last_name", placeholder: "Last Name", autoComplete: "family-name", required: true },
    { key: "username", placeholder: "Username", autoComplete: "username", required: true },
    { key: "email", placeholder: "Email", type: "email", autoComplete: "email", required: true },
    {
      key: "registration_number",
      placeholder: "Registration Number",
      autoComplete: "off",
      required: true,
    },
    {
      key: "password",
      placeholder: "Password",
      type: "password",
      autoComplete: "new-password",
      required: true,
    },
    {
      key: "confirm_password",
      placeholder: "Confirm Password",
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
  const [visiblePasswords, setVisiblePasswords] = useState({
    password: false,
    confirm_password: false,
  });

  const fields = FIELD_CONFIG[role];
  const meta = {
    admin: {
      title: "Create an account",
      eyebrow: "Admin Portal",
      loginPath: "/admin/login",
      request: registerAdmin,
      successMessage: "Admin account created successfully. Redirecting to the admin dashboard...",
      dashboardPath: "/admin/dashboard",
      footerText: "Have an account?",
      footerLink: "Log in here",
      description: "Use your full name, username, email, staff ID, and password to create an admin account.",
    },
    voter: {
      title: "Create an account",
      eyebrow: "Voter Portal",
      loginPath: "/voter/login",
      request: registerVoter,
      successMessage: "Voter account created successfully. Redirecting to your dashboard...",
      dashboardPath: "/voter/dashboard",
      footerText: "Have an account?",
      footerLink: "Log in here",
      description:
        "Use your name, username, email, registration number, and password to create your voter account.",
    },
  }[role];

  function togglePassword(fieldKey) {
    setVisiblePasswords((current) => ({
      ...current,
      [fieldKey]: !current[fieldKey],
    }));
  }

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
      await onGoogleLogin({ code, role });
      setSuccess("Google account verified successfully. Redirecting now...");
      window.setTimeout(() => {
        navigate(meta.dashboardPath, { replace: true });
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
          <p className="auth-banner-kicker">{meta.eyebrow}</p>
          <h2>{meta.title}</h2>
        </div>

        <div className="auth-panel">
          <div className="auth-panel-stack">
            <GoogleSignInButton role={role} onCode={handleGoogleCode} disabled={submitting} />
            <div className="auth-divider">or</div>

            <form className="auth-form-stack" onSubmit={handleSubmit}>
              <div className={`auth-grid ${role === "voter" ? "split-grid" : ""}`}>
                {fields.map((field) => {
                  const isPasswordField = field.key === "password" || field.key === "confirm_password";
                  return (
                    <div
                      key={field.key}
                      className={`auth-field-wrap ${
                        role === "voter" && (field.key === "first_name" || field.key === "last_name")
                          ? "half-field"
                          : ""
                      } ${isPasswordField ? "password-wrap" : ""}`}
                    >
                      <input
                        id={`${role}-${field.key}`}
                        name={field.key}
                        type={isPasswordField && visiblePasswords[field.key] ? "text" : field.type || "text"}
                        className="auth-input"
                        placeholder={field.placeholder}
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
                      {isPasswordField ? (
                        <button
                          type="button"
                          className="password-eye"
                          aria-label={visiblePasswords[field.key] ? "Hide password" : "Show password"}
                          onClick={() => togglePassword(field.key)}
                        >
                          {visiblePasswords[field.key] ? "◉" : "◎"}
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {error ? <div className="error-banner">{error}</div> : null}
              {success ? <div className="success-banner">{success}</div> : null}

              <button className="auth-submit-button" type="submit" disabled={submitting}>
                {submitting ? "Creating Account..." : "Create account"}
              </button>
            </form>

            <p className="auth-caption">{meta.description}</p>
            <p className="auth-footer-link">
              {meta.footerText} <Link to={meta.loginPath}>{meta.footerLink}</Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
