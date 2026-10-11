"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AtSign, KeyRound, ShieldCheck, Star } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import tenant, { t } from "@/config/tenant";

/** Faint civic pattern layered over the hero gradient. */
const HERO_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='56' height='56' viewBox='0 0 56 56'%3E%3Cpath d='M28 4l4.4 9.2 10.1 1.1-7.5 6.8 2 9.9L28 26.9 19 31l2-9.9-7.5-6.8 10.1-1.1z' fill='none' stroke='%23ffffff' stroke-opacity='0.07' stroke-width='1'/%3E%3C/svg%3E")`;

export default function LoginPage() {
  const router = useRouter();
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
      router.push(user.role === "admin" ? "/admin" : "/");
    } catch {
      setError("Invalid credentials. Please check and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell flex min-h-dvh flex-col bg-white dark:bg-[#0F1020]">
      {/* ---------------- Hero ---------------- */}
      <section
        className="relative flex min-h-[46dvh] flex-1 flex-col items-center justify-center px-6 pt-10 text-center"
        style={{ backgroundImage: `var(--nv-grad-hero), ${HERO_PATTERN}` }}
      >
        <span
          aria-hidden="true"
          className="absolute -left-16 top-10 h-48 w-48 rounded-full bg-white/10 blur-2xl"
        />
        <span
          aria-hidden="true"
          className="absolute -right-20 bottom-0 h-56 w-56 rounded-full bg-[#3B2A9E]/40 blur-3xl"
        />

        <span className="relative grid h-20 w-20 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm">
          <Star className="h-10 w-10 fill-white text-white" aria-hidden="true" />
        </span>
        <h1 className="relative mt-5 text-[34px] font-extrabold leading-[38px] tracking-tight text-white">
          {t.name}
        </h1>
        <p className="relative mt-2 max-w-[16rem] text-[14px] leading-5 text-white/85">
          {tenant.tagline}
        </p>
        <p className="relative mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Verified &amp; audited
        </p>
      </section>

      {/* ---------------- Login sheet ---------------- */}
      <section className="sheet relative -mt-7 flex flex-col bg-white px-6 pb-8 pt-7 dark:bg-[#171930]">
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

          <Button
            type="button"
            variant="dark"
            onClick={() => {
              setIdentifier("");
              setPassword("");
              setError("Email sign-in is not enabled for this tenant.");
            }}
          >
            <AtSign className="h-4 w-4" aria-hidden="true" />
            Email login
          </Button>
        </form>

        <p className="mt-6 text-center text-[13px] text-nv-muted">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="font-bold text-nv-primary hover:underline">
            Create here
          </Link>
        </p>

        <Button asChild variant="navy" className="mt-3">
          <Link href="/register">Register</Link>
        </Button>
      </section>
    </div>
  );
}