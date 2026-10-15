"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { AuthCard, AuthShell } from "@/src/components/auth-shell";
import { Button } from "@/src/components/ui/button";
import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { resendLoginOtp, verifyLoginOtp } from "@/src/lib/api-client";
import {
  clearOtpChallenge,
  dashboardPathFor,
  readOtpChallenge,
  storeOtpChallenge,
  type StoredOtpChallenge,
} from "@/src/lib/auth-flow";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_MS } from "@/src/lib/otp-constants";

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type ErrorPayload = { detail?: string; attempts_remaining?: number };

function OtpVerificationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { completeOtpLogin } = useApp();
  const { toast } = useToast();

  const [challenge, setChallenge] = useState<StoredOtpChallenge | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [error, setError] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  // The login page hands the challenge over through sessionStorage. Without
  // one there is nothing to verify — send the user back to sign in.
  useEffect(() => {
    const stored = readOtpChallenge();
    if (!stored) {
      router.replace("/login");
      return;
    }
    setChallenge(stored);
    setResendCooldownUntil(Date.now() + OTP_RESEND_COOLDOWN_MS);
    setLoaded(true);
    inputsRef.current[0]?.focus();
  }, [router]);

  // One ticking clock drives both the expiry countdown and the resend
  // cooldown so the two never drift apart.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = challenge
    ? Math.max(0, Math.floor((new Date(challenge.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = loaded && challenge !== null && secondsLeft <= 0;
  const resendIn = Math.max(0, Math.ceil((resendCooldownUntil - now) / 1000));
  const code = digits.join("");

  function setDigit(index: number, rawValue: string) {
    const digit = rawValue.replace(/\D/g, "").slice(-1);
    setDigits((previous) => {
      const next = [...previous];
      next[index] = digit;
      return next;
    });
    if (digit && index < OTP_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  }

  function handlePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH).fill("");
    pasted.split("").forEach((character, index) => {
      next[index] = character;
    });
    setDigits(next);
    inputsRef.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!challenge || expired) return;
    if (code.length !== OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code.`);
      return;
    }
    setError("");
    setAttemptsLeft(null);
    setLoading(true);
    try {
      const response = await verifyLoginOtp(challenge.challengeId, code);
      clearOtpChallenge();
      const user = await completeOtpLogin(response);
      toast({
        title: `Welcome back, ${user.full_name || user.username}`,
        tone: "success",
      });
      router.push(dashboardPathFor(user.role, searchParams.get("next")));
    } catch (requestError) {
      const data = (requestError as { data?: ErrorPayload }).data;
      setError(data?.detail ?? "Verification failed. Please try again.");
      setAttemptsLeft(
        typeof data?.attempts_remaining === "number" ? data.attempts_remaining : null,
      );
      setDigits(Array(OTP_LENGTH).fill(""));
      inputsRef.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    if (!challenge) return;
    setError("");
    setAttemptsLeft(null);
    try {
      const result = await resendLoginOtp(challenge.challengeId);
      const refreshed = {
        challengeId: result.challenge_id,
        expiresAt: result.expires_at,
      };
      storeOtpChallenge(refreshed);
      setChallenge(refreshed);
      setResendCooldownUntil(Date.now() + OTP_RESEND_COOLDOWN_MS);
      setDigits(Array(OTP_LENGTH).fill(""));
      toast({ title: "A new code was sent to your devices.", tone: "success" });
      inputsRef.current[0]?.focus();
    } catch (requestError) {
      const data = (requestError as { data?: ErrorPayload }).data;
      setError(data?.detail ?? "Could not resend the code. Please try again.");
    }
  }

  if (!loaded || !challenge) {
    return (
      <AuthCard>
        <p className="text-center text-[15px] text-nv-muted">
          Taking you back to sign in…
        </p>
        <p className="mt-4 text-center text-[13px] text-nv-muted">
          <Link href="/login" className="font-bold text-nv-primary hover:underline">
            Sign in
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <span
        aria-hidden="true"
        className="grid h-14 w-14 place-items-center rounded-2xl bg-nv-primary/10 text-nv-primary"
      >
        <ShieldCheck className="h-7 w-7" />
      </span>

      <h2 className="mt-4 text-fluid-xl tracking-tight text-nv-ink">
        Check your notifications
      </h2>
      <p className="mt-2 text-[14px] leading-relaxed text-nv-muted">
        We sent a {OTP_LENGTH}-digit code to your devices with NexVote
        notifications enabled. Enter it below to finish signing in.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
          >
            {error}
            {attemptsLeft !== null ? ` (${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} left)` : ""}
          </p>
        ) : null}

        <div
          className="flex justify-between gap-2"
          onPaste={handlePaste}
          role="group"
          aria-label={`Enter the ${OTP_LENGTH}-digit code`}
        >
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(element) => {
                inputsRef.current[index] = element;
              }}
              value={digit}
              onChange={(event) => setDigit(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              aria-label={`Digit ${index + 1}`}
              disabled={loading || expired}
              className="h-12 w-11 rounded-lg border border-nv-primary/20 bg-white text-center text-lg font-bold text-nv-ink focus:border-nv-primary focus:outline-none focus:ring-2 focus:ring-nv-primary/30 disabled:opacity-50 sm:h-14 sm:w-12"
            />
          ))}
        </div>

        <p className="text-center text-[13px] text-nv-muted" aria-live="polite">
          {expired ? (
            <span className="font-bold text-nv-danger">This code has expired.</span>
          ) : (
            <>Code expires in <span className="font-bold text-nv-ink">{formatClock(secondsLeft)}</span></>
          )}
        </p>

        <Button type="submit" disabled={loading || expired}>
          {loading ? "Verifying…" : "Verify and sign in"}
        </Button>

        <div className="flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="dense"
            onClick={onResend}
            disabled={expired || resendIn > 0}
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
          </Button>
          <Link
            href="/login"
            className="text-[13px] font-bold text-nv-primary hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}

export default function OtpVerificationPage() {
  return (
    <AuthShell showBrand={false}>
      <Suspense>
        <OtpVerificationForm />
      </Suspense>
    </AuthShell>
  );
}
