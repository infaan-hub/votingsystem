"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { useApp } from "@/src/components/AppProvider";
import GoogleSignInButton from "@/src/components/GoogleSignInButton";

function LoginPageContent({ role }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, handleLogin, handleGoogleLogin } = useApp();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    if (role === "admin" && user.role === "admin") {
      router.replace("/admin/dashboard");
      return;
    }
    if (role === "candidate" && user.role !== "admin") {
      router.replace("/candidate/dashboard");
      return;
    }
    if (role === "voter" && user.role !== "admin") {
      router.replace("/voter/dashboard");
    }
  }, [user, role, router]);

  const meta = {
    admin: {
      title: "Login Here",
      eyebrow: "Admin Portal",
      subtitle: "Use your admin username and password to manage elections.",
      registerPath: "/admin/register",
      registerLabel: "Create admin account",
    },
    voter: {
      title: "Login Here",
      eyebrow: "Voter Portal",
      subtitle: "Use your voter username and password to access the ballot.",
      registerPath: "/voter/register",
      registerLabel: "Create voter account",
    },
    candidate: {
      title: "Login Here",
      eyebrow: "Candidate Portal",
      subtitle: "Sign in with the credentials assigned to your candidate account.",
      registerPath: null,
      registerLabel: "",
    },
  }[role];

  function redirectUser(nextUser) {
    const fallbackTarget =
      role === "admin" ? "/admin/dashboard" : role === "candidate" ? "/candidate/dashboard" : "/voter/dashboard";
    const from = searchParams.get("from");
    router.replace(typeof from === "string" && from.startsWith("/") ? from : fallbackTarget);
    return nextUser;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await handleLogin(form);
      if (role === "admin" && nextUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }
      if (role !== "admin" && nextUser.role === "admin") {
        throw new Error("Admin accounts must use the admin portal.");
      }
      redirectUser(nextUser);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleCode(code) {
    setSubmitting(true);
    setError("");
    try {
      const nextUser = await handleGoogleLogin({ code, role });
      if (role === "admin" && nextUser.role !== "admin") {
        throw new Error("This account does not have admin access.");
      }
      if (role !== "admin" && nextUser.role === "admin") {
        throw new Error("Admin accounts must use the admin portal.");
      }
      redirectUser(nextUser);
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
            <form className="auth-form-stack" onSubmit={handleSubmit}>
              <div className="auth-field-wrap">
                <input
                  id={`${role}-username`}
                  name="username"
                  className="auth-input"
                  placeholder="Username"
                  autoComplete="username"
                  value={form.username}
                  onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                  required
                />
              </div>
              <div className="auth-field-wrap password-wrap">
                <input
                  id={`${role}-password`}
                  name="password"
                  type={showPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Password"
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                  required
                />
                <button
                  type="button"
                  className="password-eye"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  {showPassword ? "◉" : "◎"}
                </button>
              </div>

              {error ? <div className="error-banner">{error}</div> : null}

              <button className="auth-submit-button" type="submit" disabled={submitting}>
                {submitting ? "Signing In..." : "Login"}
              </button>
            </form>

            <div className="auth-divider">or</div>
            <GoogleSignInButton onCode={handleGoogleCode} disabled={submitting} />

            <p className="auth-support-text">
              <Link href="/forgot-password">Request a New Password</Link>
            </p>

            {meta.registerPath ? (
              <p className="auth-footer-link">
                New here? <Link href={meta.registerPath}>{meta.registerLabel}</Link>
              </p>
            ) : (
              <p className="auth-footer-link">Candidates are registered by election administrators.</p>
            )}

            <p className="auth-support-text">
              <Link href="/home">Return Home</Link>
            </p>
            <p className="auth-caption">{meta.subtitle}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function LoginPage({ role }) {
  return (
    <Suspense>
      <LoginPageContent role={role} />
    </Suspense>
  );
}
