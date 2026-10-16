"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { BackButton } from "@/src/components/back-button";
import { BrandLogo } from "@/src/components/brand-logo";
import { GoogleSignInButton } from "@/src/components/google-sign-in-button";
import { LinkButton } from "@/src/components/ui/page-header";
import { Button } from "@/src/components/ui/button";
import { dashboardPathFor } from "@/src/lib/auth-flow";
import { t } from "@/config/tenant";

export default function WelcomePage() {
  const { user } = useApp();
  const router = useRouter();

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <BackButton fallback="/" />
      <div className="rounded-nv-md border border-nv-line bg-nv-surface p-6 text-center shadow-nv-card sm:p-8">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-nv-success/15 text-nv-success">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-fluid-xl text-nv-ink">
          {user ? `Welcome, ${user.full_name}` : "Welcome to the voting platform"}
        </h1>

        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {user ? (
            <>
              <LinkButton href="/dashboard">Go to my dashboard</LinkButton>
              <LinkButton href="/elections" variant="ghost" className="sm:w-auto">
                Browse elections
              </LinkButton>
            </>
          ) : (
            <>
              <LinkButton href="/login" size="default">Sign in</LinkButton>
              <Button asChild variant="ghost" size="default" className="sm:w-auto">
                <Link href="/register">Create account</Link>
              </Button>
            </>
          )}
        </div>

        {!user && (
          <div className="mx-auto mt-4 w-full max-w-xs">
            <GoogleSignInButton
              onSuccess={(signedIn) => router.push(dashboardPathFor(signedIn.role))}
            />
          </div>
        )}

        <div className="mt-8 flex justify-center">
          <BrandLogo alt={t.name} className="h-20 w-20 rounded-2xl shadow-nv-card" />
        </div>
      </div>
    </div>
  );
}
