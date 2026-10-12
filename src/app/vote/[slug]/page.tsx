"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  Fingerprint,
  Loader2,
  LogIn,
  ShieldCheck,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { useToast } from "@/src/components/ui/toast";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Sheet } from "@/src/components/ui/sheet";
import { Card, CardContent } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatusBadge } from "@/src/components/status-badge";
import { cn } from "@/src/lib/utils";

type BallotPosition = {
  id: number;
  name: string;
  description: string;
  max_selections: number;
  candidates: Array<{
    id: number;
    user: { full_name: string; username: string };
    slogan: string;
    photo_url: string | null;
    party_code: string | null;
  }>;
};

type BallotResponse = {
  election: { id: number; slug: string; title: string; authority: string; status: string };
  positions: BallotPosition[];
  voted_position_ids: number[];
  is_voting_open: boolean;
};

type Receipt = {
  code: string;
  castAt: string;
};

export default function VotePage({ params }: { params: Promise<{ slug: string }> }) {
  const router = useRouter();
  const { token } = useApp();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    void params.then((value) => setSlug(value.slug));
  }, [params]);

  if (!slug) {
    return <BallotSkeleton />;
  }

  return <Ballot slug={slug} token={token} onDone={(receipt) => router.push(`/vote/${slug}/thank-you?code=${encodeURIComponent(receipt.code)}`)} />;
}

function Ballot({
  slug,
  token,
  onDone,
}: {
  slug: string;
  token: string;
  onDone: (receipt: Receipt) => void;
}) {
  const { toast } = useToast();
  const [ballot, setBallot] = useState<BallotResponse | null>(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/elections/${slug}/ballot/`, {
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) {
        setError("This ballot is not available to you.");
        return;
      }
      const data = (await response.json()) as BallotResponse;
      setBallot(data);
      // Already-answered questions are locked: a duplicate vote is rejected
      // server-side, so pre-filling them would only invite an error.
      const locked: Record<number, number[]> = {};
      for (const id of data.voted_position_ids) locked[id] = [];
      setSelected(locked);
      setError("");
    } catch {
      setError("Could not load the ballot. Check your connection and try again.");
    }
  }, [slug, token]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggle(position: BallotPosition, candidateId: number) {
    setSelected((current) => {
      const existing = current[position.id] ?? [];
      const max = Math.max(1, position.max_selections);
      if (existing.includes(candidateId)) {
        return { ...current, [position.id]: existing.filter((id) => id !== candidateId) };
      }
      if (existing.length >= max) {
        return max === 1
          ? { ...current, [position.id]: [candidateId] }
          : { ...current, [position.id]: [...existing.slice(1), candidateId] };
      }
      return { ...current, [position.id]: [...existing, candidateId] };
    });
  }

  const answeredCount = (ballot?.positions ?? []).filter(
    (position) => (selected[position.id]?.length ?? 0) > 0,
  ).length;
  const totalCount = ballot?.positions.length ?? 0;
  const complete = totalCount > 0 && answeredCount === totalCount;

  async function submit(password: string) {
    if (!ballot) return;
    setSubmitting(true);
    try {
      // Idempotency key so a retried or dropped request is not double-counted.
      const idempotencyKey = crypto.randomUUID();
      const response = await fetch(`/api/elections/${ballot.election.id}/vote/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          selections: Object.entries(selected).map(([positionId, candidateIds]) => ({
            position_id: Number(positionId),
            candidate_ids: candidateIds,
          })),
          reauth: password ? { password } : { biometric: true },
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        receipt_code?: string;
        cast_at?: string;
        detail?: string;
      };

      if (!response.ok) {
        throw new Error(data.detail ?? "Your vote could not be recorded.");
      }

      setConfirming(false);
      onDone({
        code: data.receipt_code ?? "—",
        castAt: data.cast_at ?? new Date().toISOString(),
      });
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Your vote could not be recorded. Please try again.";
      setError(message);
      setConfirming(false);
      toast({ title: "Vote not recorded", description: message, tone: "error" });
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="nv-grad-candidate grid h-14 w-14 place-items-center rounded-full text-nv-navy">
            <LogIn className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-[18px] font-bold text-nv-ink">Sign in to vote</h1>
          <p className="max-w-sm text-[13px] text-nv-muted">
            You need an authenticated account to receive a ballot.
          </p>
          <Button asChild className="sm:w-52">
            <Link href={`/login?next=${encodeURIComponent(`/vote/${slug}`)}`}>Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (error && !ballot) {
    return (
      <Card>
        <CardContent className="py-14 text-center">
          <p role="alert" className="text-[13px] text-nv-danger">
            {error}
          </p>
          <Button variant="ghost" className="mx-auto mt-4 w-auto px-5" onClick={load}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!ballot) return <BallotSkeleton />;

  return (
    <div className="space-y-5">
      {/* ---------------- Header ---------------- */}
      <header>
        <Link
          href={`/elections/${ballot.election.slug}`}
          className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-nv-muted"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to election
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={ballot.election.status} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
            {ballot.election.authority}
          </span>
        </div>
        <h1 className="mt-1.5 text-fluid-xl tracking-tight text-nv-ink">
          {ballot.election.title}
        </h1>
        <p className="nums-tabular mt-1 text-[13px] text-nv-muted">
          {answeredCount} of {totalCount} question{totalCount === 1 ? "" : "s"} answered
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
        >
          {error}
        </p>
      ) : null}

      {!ballot.is_voting_open ? (
        <Card>
          <CardContent className="py-12 text-center text-[13px] text-nv-muted">
            Voting is not open for this election right now.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---------------- Questions ---------------- */}
          <div className="space-y-5">
            {ballot.positions.map((position) => {
              const picks = selected[position.id] ?? [];
              const locked = ballot.voted_position_ids.includes(position.id);
              const max = Math.max(1, position.max_selections);

              return (
                <section key={position.id} aria-labelledby={`q-${position.id}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id={`q-${position.id}`}
                      className="text-[16px] font-bold text-nv-ink"
                    >
                      {position.name}
                    </h2>
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-nv-surface px-2.5 py-1 text-[11px] font-semibold text-nv-muted">
                        <CheckCircle2 className="h-3 w-3 text-nv-success" aria-hidden="true" />
                        Voted
                      </span>
                    ) : (
                      <span className="nums-tabular text-[12px] text-nv-muted">
                        {max === 1 ? "Choose 1" : `Choose up to ${max}`} · {picks.length}/{max}
                      </span>
                    )}
                  </div>

                  <ul className="space-y-2">
                    {position.candidates.map((candidate) => {
                      const checked = picks.includes(candidate.id);
                      return (
                        <li key={candidate.id}>
                          <label
                            className={cn(
                              "flex items-center gap-3 rounded-nv-md border bg-nv-surface p-3 transition-colors duration-200",
                              locked
                                ? "cursor-not-allowed opacity-60"
                                : "cursor-pointer hover:border-nv-primary/50",
                              checked && "border-nv-primary bg-nv-primary-100/40",
                            )}
                          >
                            <input
                              type={max === 1 ? "radio" : "checkbox"}
                              name={`q-${position.id}`}
                              checked={checked}
                              disabled={locked}
                              onChange={() => toggle(position, candidate.id)}
                              className="h-5 w-5 shrink-0 accent-[var(--nv-primary)]"
                            />
                            <span
                              aria-hidden="true"
                              className="nv-grad-profile grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
                            >
                              {initialsFor(candidate.user.full_name || candidate.user.username)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14px] font-bold text-nv-ink">
                                {candidate.user.full_name || candidate.user.username}
                              </span>
                              {candidate.slogan ? (
                                <span className="block truncate text-[12px] text-nv-muted">
                                  {candidate.slogan}
                                </span>
                              ) : null}
                            </span>
                            {candidate.party_code ? (
                              <span className="shrink-0 rounded-full bg-nv-primary px-2 py-0.5 text-[10px] font-bold uppercase text-nv-navy">
                                {candidate.party_code}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </div>

          {/* ---------------- Sticky CTA ---------------- */}
          <div className="sticky bottom-20 z-30 lg:bottom-4">
            <div className="rounded-nv-lg border border-nv-line bg-nv-surface/95 p-3 shadow-nv-sheet backdrop-blur">
              {!complete ? (
                <p className="px-1 pb-2 text-[12px] text-nv-muted">
                  Answer every question to submit your ballot.
                </p>
              ) : null}
              <Button
                onClick={() => setConfirming(true)}
                disabled={!complete}
                aria-describedby="cast-help"
              >
                <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                Cast vote
              </Button>
              <p id="cast-help" className="sr-only">
                Opens a confirmation step before your ballot is submitted.
              </p>
            </div>
          </div>
        </>
      )}

      {/* ---------------- Confirm sheet ---------------- */}
      <ConfirmSheet
        open={confirming}
        onOpenChange={setConfirming}
        positionNames={ballot.positions.map((position) => position.name)}
        submitting={submitting}
        onConfirm={submit}
      />
    </div>
  );
}

function ConfirmSheet({
  open,
  onOpenChange,
  positionNames,
  submitting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  positionNames: string[];
  submitting: boolean;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPassword("");
      setError("");
    }
  }, [open]);

  // WebAuthn is offered when the platform supports it; otherwise the password
  // path remains available so the step is never a dead end.
  const supportsBiometrics =
    typeof window !== "undefined" && "PublicKeyCredential" in window;

  async function onBiometric() {
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          timeout: 60000,
          userVerification: "required",
        },
      });
      onConfirm("");
    } catch {
      setError("Biometric check failed. Use your password instead.");
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm your vote"
      description="Your ballot is final once submitted."
      footer={
        <Button onClick={() => onConfirm(password)} disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Submitting…
            </>
          ) : (
            "Confirm"
          )}
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-nv-muted">
          You are voting on {positionNames.length} question
          {positionNames.length === 1 ? "" : "s"}: {positionNames.join(", ")}.
        </p>

        {supportsBiometrics ? (
          <Button variant="dark" onClick={onBiometric} disabled={submitting}>
            <Fingerprint className="h-4 w-4" aria-hidden="true" />
            Use biometrics
          </Button>
        ) : null}

        <Input
          label="Confirm with your password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />

        {error ? (
          <p role="alert" className="text-[12px] text-nv-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Sheet>
  );
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function BallotSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-2/3" />
      <Skeleton className="h-4 w-1/3" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} className="h-24 w-full" />
      ))}
    </div>
  );
}

export type { Receipt };