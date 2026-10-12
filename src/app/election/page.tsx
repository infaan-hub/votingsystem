"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, RotateCw, Vote } from "lucide-react";

import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { EmptyState } from "@/src/components/ui/empty-state";
import { PageHeader } from "@/src/components/ui/page-header";
import { SearchInput } from "@/src/components/ui/filters";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";

type PublicElection = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  lifecycle_status: string;
  visibility: string;
  result_visibility: string;
  category_id: number | null;
  organization_id: number | null;
  campaign_start_at: string | null;
  campaign_end_at: string | null;
  voting_start_at: string | null;
  voting_end_at: string | null;
  allow_live_results: boolean;
  announce_winners_automatically: boolean;
  status: "upcoming" | "active" | "ended";
  seconds_until_start: number;
  seconds_until_end: number;
};

const GROUPS = [
  { key: "active", title: "Open now", description: "Voting is open — cast your ballot before the window closes." },
  { key: "upcoming", title: "Upcoming", description: "Published elections that have not opened for voting yet." },
  { key: "ended", title: "Closed / results", description: "Voting has finished. Results appear once they are published." },
] as const;

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function ElectionTile({ election }: { election: PublicElection }) {
  return (
    <article className="flex h-full flex-col rounded-nv-md border border-nv-line bg-nv-surface p-5 shadow-nv-card transition-shadow hover:shadow-panel">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-fluid-lg text-nv-ink">
          <Link
            href={`/elections/${election.slug}`}
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
          >
            {election.title}
          </Link>
        </h3>
        <StatusBadge status={election.lifecycle_status} className="shrink-0" />
      </div>
      {election.description ? (
        <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-nv-muted">
          {election.description}
        </p>
      ) : null}
      <div className="nums-tabular mt-4 space-y-1 text-[12.5px] text-nv-muted">
        <p className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Opens {formatDate(election.voting_start_at)}
        </p>
        <p className="flex items-center gap-1.5 pl-5">
          Closes {formatDate(election.voting_end_at)}
        </p>
      </div>
      {election.status === "active" && election.voting_end_at ? (
        <Countdown target={election.voting_end_at} prefix="Closes in" className="mt-3" />
      ) : null}
      {election.status === "upcoming" && election.voting_start_at ? (
        <Countdown target={election.voting_start_at} prefix="Opens in" className="mt-3" />
      ) : null}
      <Link
        href={`/elections/${election.slug}`}
        className="mt-4 text-[13px] font-bold text-nv-primary hover:underline"
      >
        View details
      </Link>
    </article>
  );
}

export default function ElectionHubPage() {
  const [elections, setElections] = useState<PublicElection[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setElections(null);
    setError("");
    try {
      const response = await fetch("/api/elections");
      if (!response.ok) {
        throw new Error("We could not load the election list. Please try again.");
      }
      const data = (await response.json()) as PublicElection[];
      setElections(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load the election list. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!elections) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return elections;
    return elections.filter(
      (election) =>
        election.title.toLowerCase().includes(needle) ||
        (election.description ?? "").toLowerCase().includes(needle),
    );
  }, [elections, query]);

  const grouped = useMemo(
    () =>
      GROUPS.map((group) => ({
        ...group,
        elections: filtered.filter((election) => election.status === group.key),
      })),
    [filtered],
  );

  const hasAny = grouped.some((group) => group.elections.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elections"
        description="Every published election you can take part in — open now, starting soon, or recently closed."
      />

      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder="Search elections by title or description"
        className="sm:max-w-sm"
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
          {[0, 1].map((row) => (
            <Section key={row} title={<Skeleton className="h-6 w-40" />}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[0, 1, 2].map((card) => (
                  <div key={card} className="space-y-3 rounded-nv-md border border-nv-line bg-nv-surface p-5">
                    <Skeleton className="h-5 w-3/4" />
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                ))}
              </div>
            </Section>
          ))}
        </div>
      ) : null}

      {!error && elections !== null && !hasAny ? (
        <EmptyState
          icon={<Vote className="h-6 w-6" aria-hidden="true" />}
          title={query ? "No elections match your search" : "No elections published yet"}
          description={
            query
              ? "Try a different title or clear the search to see every published election."
              : "Published elections will appear here as soon as organizers release them. You can request one for your organization in the meantime."
          }
          action={
            query ? (
              <Button variant="outline" onClick={() => setQuery("")}>
                Clear search
              </Button>
            ) : (
              <Button asChild>
                <Link href="/request-election">Request an election</Link>
              </Button>
            )
          }
        />
      ) : null}

      {!error
        ? grouped.map((group) =>
            group.elections.length > 0 ? (
              <Section key={group.key} title={group.title} description={group.description}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {group.elections.map((election) => (
                    <ElectionTile key={election.id} election={election} />
                  ))}
                </div>
              </Section>
            ) : null,
          )
        : null}
    </div>
  );
}
