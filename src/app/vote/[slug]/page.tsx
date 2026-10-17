"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, LogIn, ShieldCheck } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { BackButton } from "@/src/components/back-button";
import { useToast } from "@/src/components/ui/toast";
import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Sheet } from "@/src/components/ui/sheet";
import { Card, CardContent } from "@/src/components/ui/card";
import { CodeInput } from "@/src/components/ui/code-input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatusBadge } from "@/src/components/status-badge";
import { cn } from "@/src/lib/utils";
import { OTP_LENGTH, OTP_RESEND_COOLDOWN_MS } from "@/src/lib/otp-constants";

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

type BallotEligibility = {
  eligible: boolean;
  reason: string;
  requires_identifier: boolean;
  identifier_label: string;
  identifier_verified: boolean;
};

type BallotResponse = {
  election: { id: number; slug: string; title: string; authority: string; status: string };
  positions: BallotPosition[];
  voted_position_ids: number[];
  is_voting_open: boolean;
  eligibility: BallotEligibility;
  account_has_password: boolean;
};

/** Live confirmation challenge for (voter, election). */
type CodeChallenge = { challengeId: number; expiresAt: string; codeLength: number };
/**
 * "loading"    = asking the server which confirmation step applies;
 * "identifier" = the election needs the voter's identifier first;
 * "code"       = voter verifies with the notification code (required when the
 *                pipeline can reach them);
 * "legacy"     = password step for voters with no delivery channel.
 */
type ConfirmMode = "loading" | "identifier" | "legacy" | "code";
type IssueOutcome = "ok" | "forbidden" | "error";

/** The exact question + choices the open confirm sheet will cast. */
type PendingVote = {
  positionId: number;
  positionName: string;
  candidateIds: number[];
  candidateNames: string[];
  /** Stable across retries, so a dropped response replays the same receipt. */
  idempotencyKey: string;
};

type FailureData = {
  detail?: string;
  attempts_remaining?: number;
  needs_new_code?: boolean;
  code_required?: boolean;
  identifier_required?: boolean;
  password_required?: boolean;
};

function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

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

  return <Ballot slug={slug} token={token} onDone={() => router.push(`/vote/${slug}/thank-you`)} />;
}

function Ballot({ slug, token, onDone }: { slug: string; token: string; onDone: () => void }) {
  const { toast } = useToast();
  const [ballot, setBallot] = useState<BallotResponse | null>(null);
  const [error, setError] = useState("");
  // Single-choice questions cast straight from the candidate card (tap →
  // confirm sheet → code). Multi-choice questions still collect choices here
  // before their per-question "Cast vote" button opens the same sheet.
  const [selected, setSelected] = useState<Record<number, number[]>>({});
  const [pending, setPending] = useState<PendingVote | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmMode, setConfirmMode] = useState<ConfirmMode>("legacy");
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [issueError, setIssueError] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [identifier, setIdentifier] = useState("");

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

  // One verified vote completes the voter's ballot: the page locks as soon
  // as any vote exists, so the voter is never asked to answer every question.
  const hasVoted = (ballot?.voted_position_ids ?? []).length > 0;

  /** Asks the server which confirmation step applies and fetches the code. */
  async function requestCode(fresh = false, identifierOverride?: string): Promise<IssueOutcome> {
    if (!ballot) return "error";
    const effectiveIdentifier = (identifierOverride ?? identifier).trim();
    setIssuing(true);
    setIssueError("");
    try {
      const response = await fetch(`/api/elections/${ballot.election.id}/vote/code/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({
          ...(effectiveIdentifier ? { identifier: effectiveIdentifier } : {}),
          ...(fresh ? { fresh: true } : {}),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        detail?: string;
        requires_code?: boolean;
        code_length?: number;
        challenge_id?: number;
        expires_at?: string;
        identifier_required?: boolean;
      };
      if (!response.ok) {
        if (data.identifier_required) {
          // The election needs this voter's identifier (missing or not
          // matching): keep the sheet open on the identifier step.
          setConfirmMode("identifier");
          setIssueError(data.detail ?? "Enter your identifier to continue.");
          return "ok";
        }
        if (response.status === 403) {
          // Not allowed to vote in this election — never open the dialog.
          setError(data.detail ?? "You are not allowed to vote in this election.");
          toast({ title: "Cannot vote", description: data.detail, tone: "error" });
          return "forbidden";
        }
        throw new Error(
          data.detail ?? "Could not start verification. Check your connection and try again.",
        );
      }
      if (data.requires_code && data.challenge_id && data.expires_at) {
        setChallenge({
          challengeId: data.challenge_id,
          expiresAt: data.expires_at,
          codeLength: data.code_length ?? OTP_LENGTH,
        });
        setConfirmMode("code");
      } else {
        setChallenge(null);
        setConfirmMode("legacy");
      }
      return "ok";
    } catch (requestError) {
      const message =
        requestError instanceof Error
          ? requestError.message
          : "Could not start verification. Check your connection and try again.";
      setIssueError(message);
      return "error";
    } finally {
      setIssuing(false);
    }
  }

  /** Candidate tap (or a multi-choice cast): decide the step, open the sheet. */
  async function startConfirmation(position: BallotPosition, candidateIds: number[]) {
    if (!ballot || candidateIds.length === 0) return;
    const byId = new Map(position.candidates.map((candidate) => [candidate.id, candidate]));
    setPending({
      positionId: position.id,
      positionName: position.name,
      candidateIds,
      candidateNames: candidateIds
        .map((id) => byId.get(id))
        .filter((candidate) => candidate !== undefined)
        .map((candidate) => candidate.user.full_name || candidate.user.username),
      idempotencyKey: crypto.randomUUID(),
    });
    setError("");
    setVerifyError("");
    setIssueError("");
    setChallenge(null);
    setConfirming(true);
    setConfirmMode("loading");
    if (ballot.eligibility.requires_identifier && !identifier.trim()) {
      setConfirmMode("identifier");
      return;
    }
    const outcome = await requestCode();
    if (outcome === "forbidden") {
      setConfirming(false);
      setConfirmMode("legacy");
    } else if (outcome === "error") {
      // Show the retry card instead of an endless spinner.
      setConfirmMode("code");
    }
  }

  /** The voter confirmed the identifier: verify it and continue to the code. */
  async function continueWithIdentifier() {
    setConfirmMode("loading");
    const outcome = await requestCode(false, identifier);
    if (outcome === "forbidden") {
      setConfirming(false);
      setConfirmMode("legacy");
    } else if (outcome === "error") {
      setConfirmMode("identifier");
    }
  }

  /** Rotates the code; terminal states (expired/used/locked) get a fresh one. */
  async function resendCode() {
    if (!ballot || !challenge) return;
    setVerifyError("");
    try {
      const response = await fetch(`/api/elections/${ballot.election.id}/vote/code/resend/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
        },
        body: JSON.stringify({ challenge_id: challenge.challengeId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        detail?: string;
        retry_after_seconds?: number;
        needs_new_code?: boolean;
        challenge_id?: number;
        expires_at?: string;
      };
      if (response.ok && data.challenge_id && data.expires_at) {
        setChallenge({
          challengeId: data.challenge_id,
          expiresAt: data.expires_at,
          codeLength: challenge.codeLength,
        });
        toast({ title: "New code sent", description: "Check your notifications for it.", tone: "success" });
        return;
      }
      if (response.status === 429) {
        toast({
          title: "Please wait",
          description: data.retry_after_seconds
            ? `Request another code in ${data.retry_after_seconds}s.`
            : "Request another code shortly.",
          tone: "info",
        });
        return;
      }
      if (data.needs_new_code) {
        // The old challenge is dead (locked / used / expired / out of sends):
        // ask the server for a genuinely fresh code.
        const outcome = await requestCode(true);
        if (outcome === "forbidden") {
          setConfirming(false);
          setConfirmMode("legacy");
        } else if (outcome === "ok") {
          toast({ title: "New code sent", description: "Check your notifications for it.", tone: "success" });
        }
        return;
      }
      throw new Error(data.detail ?? "Could not send a new code.");
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : "Could not send a new code.";
      setIssueError(message);
      toast({ title: "Could not send a code", description: message, tone: "error" });
    }
  }

  async function submitBallot(extraBody: Record<string, unknown>) {
    if (!ballot || !pending) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/elections/${ballot.election.id}/vote/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Token ${token}`,
          "Idempotency-Key": pending.idempotencyKey,
        },
        body: JSON.stringify({
          // Exactly the question the voter tapped — nothing else is required.
          selections: [
            { position_id: pending.positionId, candidate_ids: pending.candidateIds },
          ],
          ...(identifier.trim() ? { identifier: identifier.trim() } : {}),
          ...extraBody,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as FailureData & {
        receipt_code?: string;
        cast_at?: string;
      };

      if (!response.ok) {
        const failure = new Error(data.detail ?? "Your vote could not be recorded.");
        (failure as Error & { data?: FailureData }).data = data;
        throw failure;
      }

      setConfirming(false);
      setPending(null);
      // One verified vote is the whole ballot: finish with the receipt
      // instead of asking the voter to answer every remaining question.
      onDone();
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Your vote could not be recorded. Please try again.";
      const failureData = (submitError as { data?: FailureData }).data;

      // Failures the voter can fix inside the open sheet (wrong/short code,
      // missing identifier, wrong password) keep it open; terminal ones close.
      const fixableInSheet = Boolean(
        failureData &&
          (failureData.identifier_required ||
            failureData.password_required ||
            failureData.code_required ||
            failureData.needs_new_code ||
            typeof failureData.attempts_remaining === "number"),
      );

      if (fixableInSheet) {
        if (failureData?.identifier_required) setConfirmMode("identifier");
        setVerifyError(message);
      } else {
        setError(message);
        setConfirming(false);
        toast({ title: "Vote not recorded", description: message, tone: "error" });
      }
    } finally {
      setSubmitting(false);
    }
  }

  /** Legacy confirmation step: the account password, verified server-side. */
  const submit = (password: string) =>
    submitBallot(password ? { reauth: { password } } : { reauth: {} });

  /** Code confirmation step: the challenge is consumed server-side. */
  const submitWithCode = (code: string) => {
    if (!challenge) return;
    return submitBallot({ confirm_code: { challenge_id: challenge.challengeId, code } });
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <span className="nv-grad-candidate grid h-14 w-14 place-items-center rounded-full text-nv-navy">
              <LogIn className="h-6 w-6" aria-hidden="true" />
            </span>
            <h1 className="text-fluid-lg text-nv-ink">Sign in to vote</h1>
            <p className="max-w-sm text-[13px] text-nv-muted">
              You need an authenticated account to receive a ballot.
            </p>
            <Button asChild size="default" className="sm:w-52">
              <Link href={`/login?next=${encodeURIComponent(`/vote/${slug}`)}`}>Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error && !ballot) {
    return (
      <div className="mx-auto max-w-md">
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
      </div>
    );
  }

  if (!ballot) return <BallotSkeleton />;

  const eligibility = ballot.eligibility;
  const blockedByEligibility = !eligibility.eligible && !eligibility.requires_identifier;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      {/* ---------------- Header ---------------- */}
      <header>
        <BackButton
          label="Back to election"
          fallback={`/elections/${ballot.election.slug}`}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={ballot.election.status} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
            {ballot.election.authority}
          </span>
        </div>
        <h1 className="mt-1.5 text-fluid-xl tracking-tight text-nv-ink">
          {ballot.election.title}
        </h1>
        <p className="mt-1 text-[13px] text-nv-muted">
          {hasVoted
            ? "Your vote has been recorded in this election."
            : "Tap a candidate to cast your vote — one verified vote completes your ballot."}
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
      ) : blockedByEligibility ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-nv-surface">
              <ShieldCheck className="h-7 w-7 text-nv-muted" aria-hidden="true" />
            </span>
            <h2 className="text-fluid-lg text-nv-ink">You cannot vote in this election</h2>
            <p className="max-w-sm text-[13px] text-nv-muted">
              {eligibility.reason || "Your account is not eligible for this election."}
            </p>
            <Button asChild variant="outline" size="dense" className="w-auto">
              <Link href={`/elections/${ballot.election.slug}`}>Back to election</Link>
            </Button>
          </CardContent>
        </Card>
      ) : hasVoted ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <span className="nv-grad-candidate grid h-14 w-14 place-items-center rounded-full text-nv-navy">
              <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
            </span>
            <h2 className="text-fluid-lg text-nv-ink">You already voted in this election</h2>
            <p className="max-w-sm text-[13px] text-nv-muted">
              Your ballot has been recorded and cannot be changed. One verified vote is all this
              election needs.
            </p>
            <Button asChild variant="outline" size="dense" className="w-auto">
              <Link href={`/vote/${ballot.election.slug}/thank-you`}>View your receipt</Link>
            </Button>
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
              const hasCandidates = position.candidates.length > 0;

              return (
                <section key={position.id} aria-labelledby={`q-${position.id}`}>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id={`q-${position.id}`}
                      className="text-fluid-lg text-nv-ink"
                    >
                      {position.name}
                    </h2>
                    {locked ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-nv-surface px-2.5 py-1 text-[11px] font-semibold text-nv-muted">
                        <CheckCircle2 className="h-3 w-3 text-nv-success" aria-hidden="true" />
                        Voted
                      </span>
                    ) : !hasCandidates ? (
                      <span className="text-[12px] text-nv-muted">No candidates yet</span>
                    ) : max === 1 ? (
                      <span className="text-[12px] text-nv-muted">
                        Tap a candidate to cast your vote
                      </span>
                    ) : (
                      <span className="nums-tabular text-[12px] text-nv-muted">
                        Choose up to {max} · {picks.length}/{max}
                      </span>
                    )}
                  </div>

                  {!hasCandidates ? (
                    <Card>
                      <CardContent className="py-6 text-center text-[12.5px] text-nv-muted">
                        No candidates have been approved for this question yet.
                      </CardContent>
                    </Card>
                  ) : (
                    <>
                      <ul className="grid gap-2 sm:grid-cols-2">
                        {position.candidates.map((candidate) => {
                          const checked = picks.includes(candidate.id);
                          const name = candidate.user.full_name || candidate.user.username;
                          return (
                            <li key={candidate.id}>
                              {/* One tap starts the vote for this candidate:
                                  confirmation sheet → code → vote recorded. */}
                              <button
                                type="button"
                                onClick={() =>
                                  max === 1
                                    ? void startConfirmation(position, [candidate.id])
                                    : toggle(position, candidate.id)
                                }
                                disabled={locked}
                                aria-pressed={max === 1 ? undefined : checked}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-nv-md border bg-nv-surface p-4 text-left shadow-nv-card transition-colors duration-200",
                                  locked
                                    ? "cursor-not-allowed opacity-60"
                                    : "cursor-pointer hover:border-nv-primary/50",
                                  max > 1 && checked && "border-nv-primary bg-nv-primary-100/40",
                                )}
                              >
                                {max > 1 ? (
                                  checked ? (
                                    <CheckCircle2
                                      className="h-5 w-5 shrink-0 text-nv-primary"
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <span
                                      className="h-5 w-5 shrink-0 rounded-full border-2 border-nv-line"
                                      aria-hidden="true"
                                    />
                                  )
                                ) : (
                                  <ShieldCheck
                                    className="h-5 w-5 shrink-0 text-nv-muted"
                                    aria-hidden="true"
                                  />
                                )}
                                <Avatar name={name} src={candidate.photo_url} size={40} className="shrink-0" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14.5px] font-bold text-nv-ink">
                                    {name}
                                  </span>
                                  {candidate.slogan ? (
                                    <span className="block truncate text-[12.5px] font-semibold text-nv-primary">
                                      {candidate.slogan}
                                    </span>
                                  ) : null}
                                </span>
                                {candidate.party_code ? (
                                  <Badge className="shrink-0 text-[10px]">
                                    {candidate.party_code}
                                  </Badge>
                                ) : null}
                              </button>
                            </li>
                          );
                        })}
                      </ul>

                      {max > 1 && !locked ? (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="nums-tabular text-[12px] text-nv-muted">
                            {picks.length} of up to {max} selected
                          </p>
                          <Button
                            size="dense"
                            className="w-auto"
                            disabled={picks.length === 0 || issuing}
                            onClick={() => void startConfirmation(position, picks)}
                          >
                            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                            Cast vote for this question
                          </Button>
                        </div>
                      ) : null}
                    </>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {/* ---------------- Confirm sheet ---------------- */}
      <ConfirmSheet
        open={confirming}
        onOpenChange={setConfirming}
        subject={pending}
        submitting={submitting}
        mode={confirmMode}
        challenge={challenge}
        issueError={issueError}
        issuing={issuing}
        verifyError={verifyError}
        identifier={identifier}
        identifierLabel={eligibility.identifier_label}
        hasPassword={ballot.account_has_password}
        onIdentifierChange={setIdentifier}
        onIdentifierContinue={() => void continueWithIdentifier()}
        onRequestCode={() => void requestCode()}
        onResend={() => void resendCode()}
        onVerify={submitWithCode}
        onConfirm={submit}
      />
    </div>
  );
}

function ConfirmSheet({
  open,
  onOpenChange,
  subject,
  submitting,
  mode,
  challenge,
  issueError,
  issuing,
  verifyError,
  identifier,
  identifierLabel,
  hasPassword,
  onIdentifierChange,
  onIdentifierContinue,
  onRequestCode,
  onResend,
  onVerify,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: PendingVote | null;
  submitting: boolean;
  mode: ConfirmMode;
  challenge: CodeChallenge | null;
  issueError: string;
  issuing: boolean;
  verifyError: string;
  identifier: string;
  identifierLabel: string;
  hasPassword: boolean;
  onIdentifierChange: (value: string) => void;
  onIdentifierContinue: () => void;
  onRequestCode: () => void;
  onResend: () => void;
  onVerify: (code: string) => void;
  onConfirm: (password: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [now, setNow] = useState(() => Date.now());
  const [resendCooldownUntil, setResendCooldownUntil] = useState(0);

  useEffect(() => {
    if (open) {
      setPassword("");
      setDigits(Array(OTP_LENGTH).fill(""));
      // Mirrors the server cooldown that started when the code was issued.
      setResendCooldownUntil(Date.now() + OTP_RESEND_COOLDOWN_MS);
    }
  }, [open]);

  // A freshly issued challenge (resend / retry) also empties the boxes —
  // CodeInput re-focuses box one when they go from filled to empty.
  const challengeId = challenge?.challengeId ?? 0;
  useEffect(() => {
    setDigits(Array(OTP_LENGTH).fill(""));
  }, [challengeId]);

  // Wrong-code failures clear the boxes for the retry.
  useEffect(() => {
    if (verifyError) setDigits(Array(OTP_LENGTH).fill(""));
  }, [verifyError]);

  // One clock drives the expiry countdown and the resend cooldown.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = challenge
    ? Math.max(0, Math.floor((new Date(challenge.expiresAt).getTime() - now) / 1000))
    : 0;
  const expired = mode === "code" && challenge !== null && secondsLeft <= 0;
  const resendIn = Math.max(0, Math.ceil((resendCooldownUntil - now) / 1000));
  const codeLength = challenge?.codeLength ?? OTP_LENGTH;
  const complete = digits.length === codeLength && digits.every((digit) => digit !== "");

  const subjectLine = subject ? (
    <p className="text-[13px] text-nv-muted">
      You are voting for{" "}
      <span className="font-bold text-nv-ink">{subject.candidateNames.join(", ")}</span> for{" "}
      <span className="font-bold text-nv-ink">{subject.positionName}</span>.
    </p>
  ) : null;

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Confirm your vote"
      description="This vote is final once submitted."
      footer={
        mode === "loading" ? (
          <Button disabled>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Preparing…
          </Button>
        ) : mode === "identifier" ? (
          <Button
            onClick={onIdentifierContinue}
            disabled={submitting || issuing || identifier.trim().length === 0}
          >
            {issuing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Checking…
              </>
            ) : (
              "Continue"
            )}
          </Button>
        ) : mode === "code" ? (
          <Button
            onClick={() => onVerify(digits.join(""))}
            disabled={submitting || issuing || !challenge || expired || !complete}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              "Confirm vote"
            )}
          </Button>
        ) : (
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
        )
      }
    >
      {mode === "loading" ? (
        <div className="space-y-4">
          {subjectLine}
          <div className="flex flex-col items-center gap-3 py-4">
            <Loader2 className="h-6 w-6 animate-spin text-nv-primary" aria-hidden="true" />
            <p className="text-[13px] text-nv-muted">Preparing secure verification…</p>
          </div>
        </div>
      ) : mode === "identifier" ? (
        <div className="space-y-4">
          {subjectLine}

          <p className="text-[13px] text-nv-ink">
            This election confirms voters with their {identifierLabel.toLowerCase()}. Enter
            yours to continue.
          </p>

          <Input
            label={identifierLabel}
            value={identifier}
            onChange={(event) => onIdentifierChange(event.target.value)}
            autoComplete="off"
          />

          {issueError ? (
            <p
              role="alert"
              className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[12px] text-nv-danger"
            >
              {issueError}
            </p>
          ) : null}

          {verifyError ? (
            <p
              role="alert"
              className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[12px] text-nv-danger"
            >
              {verifyError}
            </p>
          ) : null}
        </div>
      ) : mode === "code" ? (
        <div className="space-y-4">
          {subjectLine}

          <p className="text-[13px] text-nv-ink">
            Enter the {codeLength}-digit code we sent to your notifications to
            verify it&apos;s you casting this vote — instead of a password.
            Check the notification banner or your bell for it.
          </p>

          {issueError ? (
            <div className="space-y-2">
              <p
                role="alert"
                className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[12px] text-nv-danger"
              >
                {issueError}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="dense"
                onClick={onRequestCode}
                disabled={issuing}
              >
                {issuing ? "Trying…" : "Try again"}
              </Button>
            </div>
          ) : null}

          {challenge ? (
            <>
              <CodeInput
                digits={digits}
                onDigitsChange={setDigits}
                length={codeLength}
                disabled={submitting}
                autoFocusFirst={open}
                label="vote code"
              />

              <p className="text-center text-[12px] text-nv-muted" aria-live="polite">
                {expired ? (
                  <span className="font-bold text-nv-danger">
                    This code has expired — send a new one.
                  </span>
                ) : (
                  <>
                    Code expires in{" "}
                    <span className="nums-tabular font-bold text-nv-ink">
                      {formatClock(secondsLeft)}
                    </span>
                  </>
                )}
              </p>

              {verifyError ? (
                <p
                  role="alert"
                  className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[12px] text-nv-danger"
                >
                  {verifyError}
                </p>
              ) : null}

              <div className="flex items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="dense"
                  onClick={onResend}
                  disabled={submitting || resendIn > 0}
                >
                  {resendIn > 0 ? `Send new code in ${resendIn}s` : "Send a new code"}
                </Button>
              </div>
            </>
          ) : !issueError ? (
            <p className="text-[13px] text-nv-muted">Preparing secure verification…</p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {subjectLine}

          {hasPassword ? (
            <Input
              label="Confirm with your password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          ) : (
            <p className="text-[13px] text-nv-muted">
              Confirm this vote with your account.
            </p>
          )}

          {verifyError ? (
            <p
              role="alert"
              className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[12px] text-nv-danger"
            >
              {verifyError}
            </p>
          ) : null}
        </div>
      )}
    </Sheet>
  );
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
