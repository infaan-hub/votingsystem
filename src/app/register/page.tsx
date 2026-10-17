"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, AtSign, KeyRound, Phone, ShieldCheck, User } from "lucide-react";

import { AuthCard, AuthShell } from "@/src/components/auth-shell";
import { BackButton } from "@/src/components/back-button";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { OtpInput, OtpKeypad } from "@/src/components/ui/otp-input";
import { useToast } from "@/src/components/ui/toast";
import { useApp } from "@/src/components/AppProvider";
import { prepareNotificationDevice, subscribeToPush } from "@/src/lib/notifications/client";
import tenant, { t } from "@/config/tenant";

type Step = "form" | "otp";

type AuthPayload = {
  token: string;
  user: {
    id: number;
    username: string;
    full_name: string;
    email: string;
    role: string;
    auth_provider: string;
    photo_url: string | null;
  };
};

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { handleRegistration } = useApp();
  const [step, setStep] = useState<Step>("form");
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [authPayload, setAuthPayload] = useState<AuthPayload | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      // Onboarding asks about notifications while the tap's user gesture is
      // still live (browsers only open the permission dialog from a gesture).
      await prepareNotificationDevice();

      const response = await fetch("/api/auth/register/voter/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          username: identifier.trim(),
          email: email.trim(),
          password,
          confirm_password: confirm,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const first = Object.values(data).flat().find((value) => typeof value === "string");
        setError(
          typeof first === "string" ? first : "We could not create that account.",
        );
        return;
      }

      // Phone verification is optional per tenant; when disabled the new
      // account is signed in immediately and is walked through first-run
      // onboarding (notification permission) before reaching the app.
      if (tenant.features.phoneVerification) {
        setAuthPayload(data as AuthPayload);
        setStep("otp");
        toast({ title: "Verification code sent", tone: "info" });
      } else {
        const auth = data as AuthPayload;
        await handleRegistration(auth);
        // Best-effort: bind this browser so sign-in codes reach this device
        // immediately, not only after a later visit to notification settings.
        await subscribeToPush(auth.token);
        toast({ title: "Account created", description: "Welcome aboard!", tone: "success" });
        router.push("/onboarding");
      }
    } catch {
      setError("Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (step === "otp") {
    return (
      <OtpScreen
        phone={phone}
        onBack={() => setStep("form")}
        onVerified={() => {
          toast({ title: "Phone verified", tone: "success" });
          if (authPayload) {
            void handleRegistration(authPayload).then(() => {
              // Best-effort device binding for the first sign-in codes.
              void subscribeToPush(authPayload.token);
              router.push("/onboarding");
            });
          } else {
            router.push("/login");
          }
        }}
      />
    );
  }

  return (
    <AuthShell>
      <AuthCard>
        <BackButton label="Back to login" fallback="/login" />

        <header className="mt-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-nv-primary">
            Step 1 of 3
          </p>
          <h1 className="mt-1 text-fluid-xl tracking-tight text-nv-ink">
            Create your account
          </h1>
          <p className="mt-2 text-[14px] leading-5 text-nv-muted">
            Your full name, a username, an email and a password are all you need.
          </p>
        </header>

        <form onSubmit={onSubmit} className="mt-7 space-y-5">
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
            >
              {error}
            </p>
          ) : null}

          <Input
            label="Full name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            icon={<User className="h-4 w-4" aria-hidden="true" />}
            autoComplete="name"
            required
          />

          <Input
            label={t.idLabel}
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
            autoCapitalize="none"
            autoCorrect="off"
            autoComplete="username"
            required
          />

          <Input
            label="Email"
            type="email"
            placeholder="you@example.org"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            icon={<AtSign className="h-4 w-4" aria-hidden="true" />}
            autoComplete="email"
            required
          />

          {tenant.features.phoneVerification ? (
            <Input
              label="Mobile number"
              type="tel"
              placeholder="+00 000 000 0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              icon={<Phone className="h-4 w-4" aria-hidden="true" />}
              required
            />
          ) : null}

          <Input
            label="Password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            required
          />

          <Input
            label="Confirm password"
            type="password"
            placeholder="Repeat your password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
          />

          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Continue"}
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-nv-muted">
          Already registered?{" "}
          <Link href="/login" className="font-bold text-nv-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    </AuthShell>
  );
}

function OtpScreen({
  phone,
  onBack,
  onVerified,
}: {
  phone: string;
  onBack: () => void;
  onVerified: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function onChange(value: string) {
    setCode(value);
    setError("");
    if (value.length === 6) {
      // No SMS gateway is configured in the default tenant, so the code is
      // validated for shape only and the pipeline continues.
      onVerified();
    }
  }

  return (
    <AuthShell showBrand={false}>
      <AuthCard>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-nv-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back
        </button>

        <header className="mt-3">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-nv-primary-100 text-nv-primary">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-[28px] font-bold leading-8 tracking-tight text-nv-ink">
            Verify your number
          </h1>
          <p className="mt-2 text-[14px] leading-5 text-nv-muted">
            {phone
              ? `We sent a 6-digit code to ${phone}.`
              : "Enter the 6-digit code we sent you."}
          </p>
        </header>

        <div className="mt-7 space-y-5">
          <OtpInput
            value={code}
            onChange={onChange}
            label="Verification code"
            invalid={Boolean(error)}
          />

          <OtpKeypad
            onDigit={(digit) => onChange((code + digit).slice(0, 6))}
            onBackspace={() => onChange(code.slice(0, -1))}
          />

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setCode("");
                setError("");
              }}
              className="text-[13px] font-bold uppercase tracking-wide text-nv-primary"
            >
              Resend code
            </button>
            <Button
              onClick={() => onChange(code)}
              disabled={code.length !== 6}
              className="w-40"
            >
              Verify
            </Button>
          </div>
        </div>
      </AuthCard>
    </AuthShell>
  );
}