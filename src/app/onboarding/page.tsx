import Link from "next/link";
import { Eye, ShieldCheck, Smartphone } from "lucide-react";

import { BrandLogo } from "@/src/components/brand-logo";
import { LinkButton } from "@/src/components/ui/page-header";
import { Button } from "@/src/components/ui/button";
import tenant from "@/config/tenant";

const FEATURES = [
  {
    icon: ShieldCheck,
    title: "Secret ballots",
    body: "Votes are stored without any link to the voter, so nobody — not even administrators — can see who chose what.",
  },
  {
    icon: Eye,
    title: "Auditable results",
    body: "Every ballot is counted transparently and results can be published the moment voting closes, with totals anyone can verify.",
  },
  {
    icon: Smartphone,
    title: "Any device",
    body: "Vote from a phone, tablet or desktop browser. No apps to install and no special setup required.",
  },
] as const;

export default function OnboardingPage() {
  return (
    <div className="nv-grad-hero relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="nv-dots pointer-events-none absolute inset-0 text-nv-primary" />

      <div className="relative mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-10 sm:px-8">
        <header className="flex items-center gap-2.5">
          <BrandLogo className="h-10 w-auto shrink-0" />
          <span className="text-[18px] font-extrabold tracking-tight text-nv-ink">{tenant.name}</span>
        </header>

        <main className="flex flex-1 flex-col justify-center py-10">
          <h1 className="max-w-2xl text-display text-nv-ink">{tenant.tagline}</h1>
          <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-nv-muted">
            Run and join elections for {tenant.authority.name} with secret ballots, auditable
            results, and a voting experience that works on any device.
          </p>

          <ul className="mt-10 grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature) => (
              <li
                key={feature.title}
                className="rounded-nv-md border border-nv-line bg-nv-surface/95 p-5 shadow-nv-card backdrop-blur"
              >
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-nv-primary-100 text-nv-primary">
                  <feature.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="mt-3 text-fluid-lg text-nv-ink">{feature.title}</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-nv-muted">{feature.body}</p>
              </li>
            ))}
          </ul>
        </main>

        <footer className="flex flex-col gap-3 border-t border-nv-line pt-6 sm:flex-row sm:items-center">
          <LinkButton href="/welcome" className="sm:w-auto">
            Get started
          </LinkButton>
          <Button asChild variant="ghost" size="default" className="sm:w-auto">
            <Link href="/login">Sign in</Link>
          </Button>
          <LinkButton href="/register" variant="subtle" size="default" className="sm:w-auto">
            Create account
          </LinkButton>
        </footer>
      </div>
    </div>
  );
}
