"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { RotateCw, Vote } from "lucide-react";

import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FiltersToolbar, FilterSelect, SearchInput } from "@/src/components/ui/filters";
import { PageHeader } from "@/src/components/ui/page-header";
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

type Category = { id: number; name: string };

const STATUS_OPTIONS = [
  { value: "active", label: "Open now" },
  { value: "upcoming", label: "Upcoming" },
  { value: "ended", label: "Closed" },
];

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function ElectionsPage() {
  const [elections, setElections] = useState<PublicElection[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const load = useCallback(async () => {
    setElections(null);
    setError("");
    try {
      const response = await fetch("/api/elections");
      if (!response.ok) {
        throw new Error("We could not load elections right now. Please try again.");
      }
      const data = (await response.json()) as PublicElection[];
      setElections(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load elections right now. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let ignore = false;
    fetch("/api/categories")
      .then(async (response) => {
        if (!response.ok) return [] as Category[];
        const data = (await response.json()) as Category[];
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!ignore) setCategories(data);
      })
      .catch(() => {
        if (!ignore) setCategories([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  const categoryOptions = useMemo(
    () => categories.map((category) => ({ value: String(category.id), label: category.name })),
    [categories],
  );

  const filtered = useMemo(() => {
    if (!elections) return [];
    const needle = query.trim().toLowerCase();
    return elections.filter((election) => {
      if (statusFilter && election.status !== statusFilter) return false;
      if (categoryFilter && String(election.category_id ?? "") !== categoryFilter) return false;
      if (!needle) return true;
      return (
        election.title.toLowerCase().includes(needle) ||
        (election.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [elections, query, statusFilter, categoryFilter]);

  const hasFilters = Boolean(query || statusFilter || categoryFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Elections"
        description="Published elections you can take part in — filter by status or category, or search by title."
      />

      <FiltersToolbar
        onReset={() => {
          setQuery("");
          setStatusFilter("");
          setCategoryFilter("");
        }}
        hasFilters={hasFilters}
      >
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by title or description"
        />
        <FilterSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          label="Filter by status"
          placeholder="Any status"
        />
        <FilterSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={categoryOptions}
          label="Filter by category"
          placeholder="Any category"
        />
      </FiltersToolbar>

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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <div key={card} className="space-y-3 rounded-nv-md border border-nv-line bg-nv-surface p-5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : null}

      {!error && elections !== null && filtered.length === 0 ? (
        <EmptyState
          icon={<Vote className="h-6 w-6" aria-hidden="true" />}
          title={
            hasFilters ? "No elections match these filters" : "No elections published yet"
          }
          description={
            hasFilters
              ? "Try a different search term, or clear the filters to see every published election."
              : "Published elections will appear here as soon as organizers release them. You can also request one for your organization."
          }
          action={
            hasFilters ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setStatusFilter("");
                  setCategoryFilter("");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button asChild>
                <Link href="/request-election">Request an election</Link>
              </Button>
            )
          }
        />
      ) : null}

      {!error && filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((election) => (
            <article
              key={election.id}
              className="flex h-full flex-col rounded-nv-md border border-nv-line bg-nv-surface p-5 shadow-nv-card transition-shadow hover:shadow-panel"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-fluid-lg text-nv-ink">
                  <Link
                    href={`/elections/${election.slug}`}
                    className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
                  >
                    {election.title}
                  </Link>
                </h2>
                <StatusBadge status={election.lifecycle_status} className="shrink-0" />
              </div>
              {election.description ? (
                <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-nv-muted">
                  {election.description}
                </p>
              ) : null}
              <div className="nums-tabular mt-4 space-y-1 text-[12.5px] text-nv-muted">
                <p>Opens {formatDate(election.voting_start_at)}</p>
                <p>Closes {formatDate(election.voting_end_at)}</p>
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
          ))}
        </div>
      ) : null}
    </div>
  );
}
