"use client";

import { useEffect, useState } from "react";

import { BrandLogo } from "@/src/components/brand-logo";
import { cn } from "@/src/lib/utils";
import tenant from "@/config/tenant";

/** How long the splash stays on screen before it fades away. */
export const SPLASH_MS = 3_000;
/** Fade-out duration; keep in sync with the transition class below. */
const FADE_MS = 500;

/**
 * Full-screen brand splash shown on every full page load — first visit and
 * refresh alike — while the app's client state (session, cached lists, service
 * worker) settles behind it. Client-side navigation never remounts the root
 * layout, so moving between pages does not replay it.
 *
 * Rendered by the root layout, so the server HTML already contains the overlay
 * and there is no post-hydration flash of the page underneath.
 */
export function SplashScreen() {
  const [phase, setPhase] = useState<"visible" | "leaving" | "gone">("visible");

  useEffect(() => {
    const fade = window.setTimeout(() => setPhase("leaving"), SPLASH_MS);
    const done = window.setTimeout(() => setPhase("gone"), SPLASH_MS + FADE_MS);
    return () => {
      window.clearTimeout(fade);
      window.clearTimeout(done);
    };
  }, []);

  if (phase === "gone") return null;

  return (
    <div
      aria-hidden={phase === "leaving" ? true : undefined}
      className={cn(
        "nv-grad-hero fixed inset-0 z-[100] grid place-items-center overflow-hidden transition-opacity duration-500 ease-out",
        phase === "leaving" && "pointer-events-none opacity-0",
      )}
    >
      <div
        aria-hidden="true"
        className="nv-dots pointer-events-none absolute inset-0 text-nv-primary"
      />
      <div
        role="status"
        aria-label={`Opening ${tenant.name}`}
        className="relative flex flex-col items-center px-8 text-center"
      >
        <BrandLogo className="h-20 w-20 rounded-2xl shadow-nv-card" />
        <p className="mt-4 text-2xl font-extrabold tracking-tight text-nv-ink">{tenant.name}</p>
        <p className="mt-1 text-[13px] text-nv-muted">{tenant.tagline}</p>
        <span className="shimmer mt-6 h-1.5 w-40 rounded-full" aria-hidden="true" />
      </div>
    </div>
  );
}
