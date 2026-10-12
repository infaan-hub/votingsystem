"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { LinkButton } from "@/src/components/ui/page-header";
import { Button } from "@/src/components/ui/button";

const STEPS = [
  {
    title: "Verify your email",
    body: "If your account requires email verification, open the message we sent and follow the one-time link. The registration screen shows the current status.",
  },
  {
    title: "Browse elections",
    body: "Published elections appear under Elections. Open one to read the rules, positions, and the candidates standing for office.",
  },
  {
    title: "Campaigns run before voting opens",
    body: "Candidates publish manifestos and campaign videos ahead of the vote, so you can compare them well before the ballot opens.",
  },
  {
    title: "Results publish after voting closes",
    body: "Once the voting window ends and results are released, the winning candidate for every position is announced automatically.",
  },
] as const;

export default function WelcomePage() {
  const { user } = useApp();

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <div className="rounded-nv-md border border-nv-line bg-nv-surface p-6 text-center shadow-nv-card sm:p-8">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-nv-success/15 text-nv-success">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-fluid-xl text-nv-ink">
          {user ? `Welcome, ${user.full_name}` : "Welcome to the voting platform"}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-nv-muted">
          Your account is ready. Here is what happens next on your way to casting a secret ballot.
        </p>

        <ol className="mx-auto mt-8 max-w-md space-y-4 text-left">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="nums-tabular grid h-7 w-7 shrink-0 place-items-center rounded-full bg-nv-primary-100 text-[12px] font-bold text-nv-primary"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-nv-ink">{step.title}</p>
                <p className="mt-0.5 text-[13px] leading-relaxed text-nv-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

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
              <LinkButton href="/login">Sign in</LinkButton>
              <Button asChild variant="ghost" className="sm:w-auto">
                <Link href="/register">Create account</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
