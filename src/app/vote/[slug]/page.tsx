"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Send } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/lib/utils";

type Position = {
  id: number;
  name: string;
  max_selections: number;
  candidates: Array<{
    id: number;
    user: { full_name: string; username: string };
    slogan: string;
  }>;
};

function BallotSkeleton() {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[0, 1, 2].map((row) => (
            <Skeleton key={row} className="h-14 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function VoteForm({ slug }: { slug: string }) {
  const router = useRouter();
  const { user, token } = useApp();
  const { toast } = useToast();
  const [positions, setPositions] = useState<Position[] | null>(null);
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetch(`/api/elections/${slug}/ballot/`, {
      headers: { Authorization: `Token ${token}` },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.positions) setPositions(data.positions);
        else if (data === null) setError("This ballot is not available to you.");
      })
      .catch(() => setError("Failed to load the ballot. Please try again."));
  }, [token, slug, router]);

  // Every question must have a selection before the ballot can be submitted.
  const complete =
    positions !== null &&
    positions.length > 0 &&
    positions.every((position) => (selected[position.id]?.length ?? 0) > 0);

  function toggle(position: Position, candidateId: number) {
    setSelected((current) => {
      const existing = current[position.id] ?? [];
      const max = Math.max(1, position.max_selections);
      if (existing.includes(candidateId)) {
        return { ...current, [position.id]: existing.filter((id) => id !== candidateId) };
      }
      if (existing.length >= max) {
        // Radio-like behaviour when only one pick is allowed.
        if (max === 1) return { ...current, [position.id]: [candidateId] };
        return { ...current, [position.id]: [...existing, candidateId] };
      }
      return { ...current, [position.id]: [...existing, candidateId] };
    });
  }

  async function handleSubmit() {
    setError("");
    setLoading(true);
    try {
      const entries = Object.entries(selected);
      for (const [, candidateIds] of entries) {
        for (const candidateId of candidateIds) {
          const response = await fetch("/api/votes/", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Token ${token}`,
            },
            body: JSON.stringify({ candidate_id: candidateId }),
          });
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            const messages = Object.values(data as Record<string, unknown>)
              .flat()
              .join(" ");
            throw new Error(messages || "Vote could not be recorded.");
          }
        }
      }
      setDone(true);
      toast({
        title: "Vote recorded",
        description: "Your selections were saved successfully.",
        tone: "success",
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error ? submitError.message : "Vote could not be recorded.";
      setError(message);
      toast({ title: "Vote not recorded", description: message, tone: "error" });
    } finally {
      setLoading(false);
    }
  }

  if (!user) return null;

  if (done) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader className="items-center text-center">
          <span className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </span>
          <CardTitle className="text-fluid-2xl">Vote recorded</CardTitle>
          <CardDescription>
            Your ballot was saved. Thank you for taking part.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <Button asChild>
            <Link href="/elections">Back to elections</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive"
        >
          {error}
        </div>
      ) : null}

      {positions === null ? (
        <BallotSkeleton />
      ) : positions.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            This election has no open questions.
          </CardContent>
        </Card>
      ) : (
        <>
          {positions.map((position) => {
            const picks = selected[position.id] ?? [];
            const max = Math.max(1, position.max_selections);
            const inputType = max === 1 ? "radio" : "checkbox";

            return (
              <Card key={position.id}>
                <CardHeader>
                  <CardTitle className="text-fluid-xl">{position.name}</CardTitle>
                  <CardDescription>
                    {max === 1
                      ? "Choose one option."
                      : `Choose up to ${max} options.`}{" "}
                    <span className="nums-tabular">
                      ({picks.length}/{max} selected)
                    </span>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <fieldset className="space-y-2">
                    <legend className="sr-only">{position.name}</legend>
                    {position.candidates.map((candidate) => {
                      const checked = picks.includes(candidate.id);
                      return (
                        <label
                          key={candidate.id}
                          className={cn(
                            "flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors",
                            checked
                              ? "border-primary bg-primary/5"
                              : "hover:bg-accent/50",
                          )}
                        >
                          <input
                            type={inputType}
                            name={`position-${position.id}`}
                            checked={checked}
                            onChange={() => toggle(position, candidate.id)}
                            className="h-5 w-5 shrink-0 accent-[var(--primary)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">
                              {candidate.user.full_name || candidate.user.username}
                            </span>
                            {candidate.slogan ? (
                              <span className="block text-sm text-muted-foreground">
                                {candidate.slogan}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      );
                    })}
                  </fieldset>
                </CardContent>
              </Card>
            );
          })}

          {/* Sticky submit bar keeps the primary action reachable on a long
              ballot. pb-safe keeps it clear of the iOS home indicator. */}
          <div className="sticky bottom-16 z-30 lg:bottom-4">
            <div className="rounded-xl border bg-popover/95 p-3 shadow-float backdrop-blur supports-[backdrop-filter]:bg-popover/85">
              {!complete ? (
                <p className="px-1 pb-2 text-xs text-muted-foreground">
                  Answer every question to submit your ballot.
                </p>
              ) : null}
              <Button
                onClick={handleSubmit}
                disabled={!complete || loading}
                size="lg"
                className="w-full"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {loading ? "Submitting…" : "Submit ballot"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<BallotSkeleton />}>
      <VotePageInner params={params} />
    </Suspense>
  );
}

async function VotePageInner({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <div className="mx-auto max-w-2xl px-4 pb-nav lg:pb-0">
      <Link
        href={`/elections/${slug}`}
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to election
      </Link>

      <header className="mt-4 mb-6">
        <h1 className="text-display text-fluid-3xl">Cast your vote</h1>
        <p className="mt-2 text-muted-foreground">
          Review each question, make your selections, then submit.
        </p>
      </header>

      <VoteForm slug={slug} />
    </div>
  );
}