"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { AuthCard, AuthShell } from "@/src/components/auth-shell";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { t } from "@/config/tenant";

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
    <AuthCard>
      <h2 className="text-fluid-xl tracking-tight text-nv-ink">Login</h2>

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
          label="Username"
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
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
