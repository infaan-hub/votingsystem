"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Clapperboard, RotateCw, Vote } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
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
  const { user } = useApp();

  const [elections, setElections] = useState<PublicElection[] | null>(null);
  const [electionsError, setElectionsError] = useState("");
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

  const latestCampaigns = (campaigns ?? []).slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHero
        title={`Welcome back, ${user?.full_name ?? user?.username ?? "voter"}`}
        description="Everything you can vote in right now and what opens next."
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
