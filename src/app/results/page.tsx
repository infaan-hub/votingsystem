"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PieChart, RotateCw, Trophy } from "lucide-react";

import { ResultsBars, type ResultDatum } from "@/src/components/results-bars";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { PageHeader } from "@/src/components/ui/page-header";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatCard, StatGrid } from "@/src/components/ui/stat-card";

type PublicElection = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  lifecycle_status: string;
  visibility: string;
  result_visibility: string;
  status: "upcoming" | "active" | "ended";
  voting_start_at: string | null;
  voting_end_at: string | null;
};

type RankingEntry = {
  candidate_id: number;
  candidate_name: string;
  slogan: string | null;
  vote_total: number;
  rank: number;
  is_winner: boolean;
};

type PositionStat = {
  id: number;
  name: string;
  max_winners: number;
  votes_cast: number;
  results: RankingEntry[];
};

type ResultsPayload = {
  election: PublicElection;
  stats: {
    election_id: number;
    status: string;
    registered_voters: number;
    votes_cast: number;
    turnout_voters: number;
    turnout_percentage: number;
    position_count: number;
    positions: PositionStat[];
  };
  winners: { position: string; scope: string; winner_names: string }[];
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

export default function ResultsPage() {
  const [elections, setElections] = useState<PublicElection[] | null>(null);
  const [error, setError] = useState("");
  const [featured, setFeatured] = useState<ResultsPayload | null>(null);
  const [featuredHidden, setFeaturedHidden] = useState(false);

  const load = useCallback(async () => {
    setElections(null);
    setFeatured(null);
    setFeaturedHidden(false);
    setError("");
    try {
      const response = await fetch("/api/elections");
      if (!response.ok) {
        throw new Error("We could not load results right now. Please try again.");
      }
      const data = (await response.json()) as PublicElection[];
      const finished = (Array.isArray(data) ? data : []).filter(
        (election) => election.status === "ended",
      );
      setElections(finished);

      const top = finished[0];
      if (top) {
        try {
          const resultsResponse = await fetch(`/api/elections/${top.id}/results`);
          if (resultsResponse.status === 403) {
            setFeaturedHidden(true);
          } else if (resultsResponse.ok) {
            setFeatured((await resultsResponse.json()) as ResultsPayload);
          }
        } catch {
          setFeaturedHidden(true);
        }
      }
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load results right now. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => elections ?? [], [elections]);

  const featuredBars = useMemo(() => {
    if (!featured) return [];
    return featured.stats.positions
      .filter((position) => position.results.length > 0)
      .map((position) => ({
        position: position.name,
        data: position.results.map(
          (entry): ResultDatum => ({
            id: entry.candidate_id,
            label: entry.candidate_name,
            votes: entry.vote_total,
            detail: entry.slogan ?? undefined,
          }),
        ),
      }));
  }, [featured]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Results"
        description="Final results from elections whose voting window has closed. Each entry links back to the election page for full details."
      />

      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
        >
          <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{error}</p>
          <Button variant="outline" size="dense" onClick={() => void load()}>
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            Retry
          </Button>
        </div>
      ) : null}

      {elections === null && !error ? (
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-40 w-full" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </div>
      ) : null}

      {!error && elections !== null && rows.length === 0 ? (
        <EmptyState
          icon={<PieChart className="h-6 w-6" aria-hidden="true" />}
          title="No results published yet"
          description="Results appear here once an election's voting window closes and the outcome is released. Browse open elections to vote while you wait."
          action={
            <Button asChild>
              <Link href="/elections">Browse elections</Link>
            </Button>
          }
        />
      ) : null}

      {!error && featured ? (
        <Section
          title="Featured result"
          description={featured.election.title}
          actions={
            <Link
              href={`/elections/${featured.election.slug}#results`}
              className="text-[13px] font-bold text-nv-primary hover:underline"
            >
              Full details
            </Link>
          }
        >
          <StatGrid className="mb-5">
            <StatCard
              label="Votes cast"
              value={featured.stats.votes_cast.toLocaleString()}
              tone="primary"
            />
            <StatCard
              label="Registered voters"
              value={featured.stats.registered_voters.toLocaleString()}
            />
            <StatCard
              label="Turnout"
              value={`${featured.stats.turnout_percentage}%`}
              tone="success"
            />
            <StatCard
              label="Positions decided"
              value={featured.stats.position_count.toLocaleString()}
            />
          </StatGrid>

          {featured.winners.length > 0 ? (
            <div className="mb-5 space-y-2">
              <h3 className="flex items-center gap-2 text-fluid-lg text-nv-ink">
                <Trophy className="h-4 w-4 text-nv-warning" aria-hidden="true" />
                Winners
              </h3>
              <ul className="space-y-2">
                {featured.winners.map((winner) => (
                  <li
                    key={`${winner.position}-${winner.scope}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-nv-md bg-nv-success/10 px-4 py-3"
                  >
                    <span className="text-[13px] font-semibold text-nv-muted">
                      {winner.position}
                      {winner.scope ? ` · ${winner.scope}` : ""}
                    </span>
                    <span className="text-[14.5px] font-bold text-nv-ink">
                      {winner.winner_names}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-6">
            {featuredBars.map((position) => (
              <div key={position.position}>
                <h4 className="mb-3 text-[13px] font-bold uppercase tracking-[0.4px] text-nv-muted">
                  {position.position}
                </h4>
                <ResultsBars data={position.data} />
              </div>
            ))}
            {featuredBars.length === 0 ? (
              <p className="text-[13px] text-nv-muted">No per-position totals were recorded.</p>
            ) : null}
          </div>
        </Section>
      ) : null}

      {!error && featuredHidden && rows.length > 0 ? (
        <p className="rounded-nv-md border border-nv-line bg-nv-surface p-4 text-[13.5px] text-nv-muted">
          Results are published when the election closes. The summary for{" "}
          <span className="font-semibold text-nv-text">{rows[0]?.title}</span> is not visible yet —
          open the election page for the expected publication point.
        </p>
      ) : null}

      {!error && rows.length > 0 ? (
        <Section title="All finished elections" description="Voting has ended on these elections.">
          <ul className="divide-y divide-nv-line">
            {rows.map((election) => (
              <li key={election.id}>
                <Link
                  href={`/elections/${election.slug}#results`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md px-1 py-3 transition-colors hover:bg-nv-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14.5px] font-bold text-nv-ink">{election.title}</p>
                    <p className="nums-tabular mt-0.5 text-[12.5px] text-nv-muted">
                      Voting closed {formatDate(election.voting_end_at)}
                    </p>
                  </div>
                  <span className="text-[13px] font-bold text-nv-primary">View results</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
