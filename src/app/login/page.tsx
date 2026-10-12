"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound, Vote } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import tenant, { t } from "@/config/tenant";

/** Sends each role to its own dashboard (or back to the guarded page). */
function dashboardPathFor(role: string, next?: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  if (role === "admin") return "/admin";
  if (role === "officer") return "/officer";
  return "/dashboard";
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { handleLogin } = useApp();
  const { toast } = useToast();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const user = await handleLogin({ username: identifier, password });
      toast({
        title: `Welcome back, ${user.full_name || user.username}`,
        tone: "success",
      });
      router.push(dashboardPathFor(user.role, searchParams.get("next")));
    } catch {
      setError("Invalid credentials. Please check and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="sheet relative -mt-7 flex flex-col bg-nv-surface px-6 pb-8 pt-7">
      <span
        aria-hidden="true"
        className="absolute left-1/2 top-3 h-1.5 w-10 -translate-x-1/2 rounded-full bg-nv-line"
      />

      <h2 className="text-[24px] font-bold leading-7 tracking-tight text-nv-ink">Login</h2>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
          >
            {error}
          </p>
        ) : null}

        <Input
          label={`${t.idLabel} or username`}
          placeholder={t.idPlaceholder}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
          autoComplete="username"
          autoCapitalize="none"
          required
        />

        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />

        <Button type="submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-nv-muted">
        Don&apos;t have an account?{" "}
        <Link href="/register" className="font-bold text-nv-primary hover:underline">
          Create here
        </Link>
      </p>

      <Button asChild variant="outline" className="mt-3">
        <Link href="/register">Register</Link>
      </Button>
    </section>
  );
}

export default function LoginPage() {
  return (
    <div className="app-shell flex min-h-dvh flex-col bg-nv-bg">
      {/* ---------------- Hero ---------------- */}
      <section className="nv-grad-hero relative flex min-h-[40dvh] flex-1 flex-col items-center justify-center px-6 pt-10 text-center">
        <span className="grid h-20 w-20 place-items-center rounded-2xl bg-nv-primary text-white">
          <Vote className="h-10 w-10" aria-hidden="true" />
        </span>
        <h1 className="relative mt-5 text-[34px] font-extrabold leading-[38px] tracking-tight text-white">
          {t.name}
        </h1>
        <p className="relative mt-2 max-w-[20rem] text-[14px] leading-5 text-white/85">
          {tenant.tagline}
        </p>
      </section>

      {/* ---------------- Login sheet ---------------- */}
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
