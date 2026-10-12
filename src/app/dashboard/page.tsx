"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, Inbox, RotateCw, Vote } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton, PageHeader } from "@/src/components/ui/page-header";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";

type PublicElection = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  lifecycle_status: string;
  status: "upcoming" | "active" | "ended";
  voting_start_at: string | null;
  voting_end_at: string | null;
};

type ElectionRequest = {
  id: number;
  title: string;
  status: string;
  decision_note: string | null;
  election_id: number | null;
  created_at: string | null;
};

type Campaign = {
  id: number;
  topic: string;
  description: string | null;
  video_url: string | null;
  candidate: { id: number; user: { username: string; full_name: string } };
  election: { id: number; slug: string; title: string };
};

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
    >
      <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{message}</p>
      <Button variant="outline" size="dense" onClick={onRetry}>
        <RotateCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}

function DashboardContent() {
  const { token, user } = useApp();

  const [elections, setElections] = useState<PublicElection[] | null>(null);
  const [electionsError, setElectionsError] = useState("");
  const [requests, setRequests] = useState<ElectionRequest[] | null>(null);
  const [requestsError, setRequestsError] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [campaignsError, setCampaignsError] = useState("");

  const loadElections = useCallback(async () => {
    setElections(null);
    setElectionsError("");
    try {
      const response = await fetch("/api/elections");
      if (!response.ok) throw new Error("We could not load your elections. Please try again.");
      const data = (await response.json()) as PublicElection[];
      setElections(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setElectionsError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load your elections. Please try again.",
      );
    }
  }, []);

  const loadRequests = useCallback(async () => {
    if (!token) return;
    setRequests(null);
    setRequestsError("");
    try {
      const response = await fetch("/api/election-requests", {
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) throw new Error("We could not load your requests. Please try again.");
      const data = (await response.json()) as ElectionRequest[];
      setRequests(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setRequestsError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load your requests. Please try again.",
      );
    }
  }, [token]);

  const loadCampaigns = useCallback(async () => {
    setCampaigns(null);
    setCampaignsError("");
    try {
      const response = await fetch("/api/campaigns");
      if (!response.ok) throw new Error("We could not load campaigns. Please try again.");
      const data = (await response.json()) as Campaign[];
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setCampaignsError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load campaigns. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    void loadElections();
    void loadCampaigns();
  }, [loadElections, loadCampaigns]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const openNow = useMemo(
    () => (elections ?? []).filter((election) => election.status === "active"),
    [elections],
  );

  const upcoming = useMemo(
    () =>
      (elections ?? [])
        .filter((election) => election.status === "upcoming")
        .sort((a, b) => (a.voting_start_at ?? "").localeCompare(b.voting_start_at ?? ""))
        .slice(0, 3),
    [elections],
  );

  const pendingCount = useMemo(
    () => (requests ?? []).filter((request) => request.status === "PENDING").length,
    [requests],
  );

  const latestRequest = requests?.[0] ?? null;
  const latestCampaigns = (campaigns ?? []).slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome back, ${user?.full_name ?? user?.username ?? "voter"}`}
        description="Everything you can vote in right now, what opens next, and the status of your requests."
      />

      <Section
        title="Open now"
        description="Elections where the voting window is active."
        actions={
          <Link
            href="/elections"
            className="text-[13px] font-bold text-nv-primary hover:underline"
          >
            All elections
          </Link>
        }
      >
        {electionsError ? (
          <ErrorBanner message={electionsError} onRetry={() => void loadElections()} />
        ) : elections === null ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-28 w-full" />
          </div>
        ) : openNow.length === 0 ? (
          <EmptyState
            icon={<Vote className="h-6 w-6" aria-hidden="true" />}
            title="Nothing is open for voting right now"
            description="When an election's voting window opens it appears here first. Browse published elections to see what is scheduled next."
            action={
              <Button asChild>
                <Link href="/elections">Browse elections</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {openNow.map((election) => (
              <article
                key={election.id}
                className="flex flex-col gap-3 rounded-nv-md border border-nv-line bg-nv-surface p-5 shadow-nv-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-fluid-lg text-nv-ink">{election.title}</h3>
                    <StatusBadge status={election.lifecycle_status} />
                  </div>
                  {election.description ? (
                    <p className="mt-1 line-clamp-2 text-[13px] text-nv-muted">
                      {election.description}
                    </p>
                  ) : null}
                  {election.voting_end_at ? (
                    <Countdown target={election.voting_end_at} prefix="Closes in" className="mt-2" />
                  ) : null}
                </div>
                <LinkButton href={`/vote/${election.slug}`} className="shrink-0 sm:w-auto">
                  Vote now
                </LinkButton>
              </article>
            ))}
          </div>
        )}
      </Section>

      <Section title="Upcoming for you" description="The next elections to open for voting.">
        {electionsError ? (
          <ErrorBanner message={electionsError} onRetry={() => void loadElections()} />
        ) : elections === null ? (
          <div className="grid gap-3 sm:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-24 w-full" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="py-4 text-[13.5px] text-nv-muted">
            No upcoming elections are scheduled. New elections show up here as soon as they are
            published.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {upcoming.map((election) => (
              <li
                key={election.id}
                className="rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card"
              >
                <Link
                  href={`/elections/${election.slug}`}
                  className="rounded-md text-[14.5px] font-bold text-nv-ink hover:text-nv-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
                >
                  {election.title}
                </Link>
                {election.voting_start_at ? (
                  <p className="nums-tabular mt-1 text-[12px] text-nv-muted">
                    Opens {formatDate(election.voting_start_at)}
                  </p>
                ) : null}
                {election.voting_start_at ? (
                  <Countdown target={election.voting_start_at} prefix="Opens in" className="mt-2" />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Your requests"
        description="Elections you have asked an administrator to create."
        actions={
          <LinkButton href="/request-election" variant="ghost" className="sm:w-auto">
            Request an election
          </LinkButton>
        }
      >
        {requestsError ? (
          <ErrorBanner message={requestsError} onRetry={() => void loadRequests()} />
        ) : requests === null ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : requests.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
            title="You have not requested an election"
            description="If your organization needs a vote — a committee election, a referendum, a survey — submit a request and an administrator will review it."
            action={
              <Button asChild>
                <Link href="/request-election">Request an election</Link>
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-nv-md bg-nv-bg px-4 py-3">
              <span className="nums-tabular text-[22px] font-extrabold text-nv-ink">
                {pendingCount}
              </span>
              <span className="text-[13px] text-nv-muted">
                request{pendingCount === 1 ? "" : "s"} awaiting administrator review
              </span>
            </div>
            {latestRequest ? (
              <div className="rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[14.5px] font-bold text-nv-ink">
                    {latestRequest.title}
                  </p>
                  <StatusBadge status={latestRequest.status} />
                </div>
                <p className="nums-tabular mt-1 text-[12px] text-nv-muted">
                  Submitted {formatDate(latestRequest.created_at)}
                </p>
                {latestRequest.decision_note ? (
                  <p className="mt-2 rounded-nv-md bg-nv-bg px-3 py-2 text-[13px] text-nv-text">
                    {latestRequest.decision_note}
                  </p>
                ) : null}
                {latestRequest.election_id ? (
                  <p className="mt-2 text-[12.5px] font-semibold text-nv-primary">
                    An election was created from this request.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </Section>

      <Section
        title="Latest campaigns"
        description="The newest campaign posts from candidates."
        actions={
          <Link
            href="/compaigns"
            className="text-[13px] font-bold text-nv-primary hover:underline"
          >
            All campaigns
          </Link>
        }
      >
        {campaignsError ? (
          <ErrorBanner message={campaignsError} onRetry={() => void loadCampaigns()} />
        ) : campaigns === null ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-14 w-full" />
            ))}
          </div>
        ) : latestCampaigns.length === 0 ? (
          <p className="py-4 text-[13.5px] text-nv-muted">
            No campaigns have been published yet. Candidates post manifestos and videos while their
            election is in the campaign period.
          </p>
        ) : (
          <ul className="space-y-2">
            {latestCampaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  href="/compaigns"
                  className="flex items-center gap-3 rounded-nv-md border border-nv-line bg-nv-surface p-3.5 shadow-nv-card transition-colors hover:bg-nv-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-nv-primary-100 text-nv-ink">
                    <Clapperboard className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold text-nv-ink">
                      {campaign.topic}
                    </span>
                    <span className="block truncate text-[12.5px] text-nv-muted">
                      {campaign.candidate.user.full_name || campaign.candidate.user.username} ·{" "}
                      {campaign.election.title}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <RequireRole role="user">
      <DashboardContent />
    </RequireRole>
  );
}
