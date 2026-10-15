"use client";

import { useMemo, useState } from "react";
import { BarChart3, RefreshCw, Users, Vote, ListChecks } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { ResultsBars } from "@/src/components/results-bars";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatCard, StatGrid } from "@/src/components/ui/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { apiRequest, useResource } from "../_shared";

type Tally = {
  kind: "candidate" | "option";
  id: number | null;
  label: string;
  votes: number;
};

type Question = {
  id: number;
  name: string;
  ballot_type: string;
  max_winners: number;
  total_votes: number;
  tallies: Tally[];
};

type ResultRow = {
  election: { id: number; slug: string; title: string; status: string; voting_end_at?: string | null };
  total_votes: number;
  distinct_voters: number;
  questions: Question[];
};

type VotesReport = {
  total_votes: number;
  election_count: number;
  results: ResultRow[];
};

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "NOMINATIONS", label: "Nominations" },
  { value: "READY", label: "Ready" },
  { value: "OPEN", label: "Voting open" },
  { value: "CLOSED", label: "Voting closed" },
  { value: "RESULTS_PUBLISHED", label: "Results published" },
  { value: "ARCHIVED", label: "Archived" },
];

export default function AdminVotesPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Votes"
        description="Aggregate ballot counts only. This report never shows who voted or how any individual voted, so secret ballots stay secret."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/admin/results" variant="outline" className="w-auto">
          View results
        </LinkButton>
      </div>
      <RequireRole role="admin">
        <VotesBody />
      </RequireRole>
    </>
  );
}

function VotesBody() {
  const { data, error, loading, reload } = useResource<VotesReport>(
    (authToken) => apiRequest<VotesReport>(authToken, "/api/admin/votes"),
    [],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<ResultRow | null>(null);

  const rows = data?.results ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.election.status !== statusFilter) return false;
      if (!needle) return true;
      return `${row.election.title} ${row.election.slug}`.toLowerCase().includes(needle);
    });
  }, [rows, query, statusFilter]);

  const hasFilters = Boolean(query.trim() || statusFilter);
  const distinctVoters = rows.reduce((sum, row) => sum + row.distinct_voters, 0);
  const questionCount = rows.reduce((sum, row) => sum + row.questions.length, 0);

  if (loading && !data) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          title="Vote report could not be loaded"
          description="The admin votes endpoint did not respond. Retry, or confirm your session is still valid."
          action={
            <Button size="dense" className="w-auto" onClick={reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <StatGrid>
        <StatCard
          label="Ballots cast"
          value={(data?.total_votes ?? 0).toLocaleString()}
          caption="Across every election"
          icon={<Vote className="h-5 w-5" aria-hidden="true" />}
          tone="primary"
        />
        <StatCard
          label="Elections"
          value={(data?.election_count ?? 0).toLocaleString()}
          caption="Included in this report"
          icon={<ListChecks className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="Distinct voters"
          value={distinctVoters.toLocaleString()}
          caption="Sum of per-election voters"
          icon={<Users className="h-5 w-5" aria-hidden="true" />}
          tone="success"
        />
        <StatCard
          label="Ballot questions"
          value={questionCount.toLocaleString()}
          caption="Positions counted"
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
        />
      </StatGrid>

      <Section
        title="Ballot activity by election"
        description="Counts refresh from the server on every load; there is no per-vote detail here by design."
      >
        <div className="space-y-4">
          <FiltersToolbar
            onReset={() => {
              setQuery("");
              setStatusFilter("");
            }}
            hasFilters={hasFilters}
          >
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder="Search election title or slug"
              label="Search elections"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              label="Filter by status"
              placeholder="All statuses"
            />
          </FiltersToolbar>

          {rows.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
              title="No elections to report on"
              description="Vote totals appear once elections exist. Create an election first, then open voting to collect ballots."
              action={
                <Button variant="outline" size="dense" className="w-auto" onClick={reload}>
                  Refresh
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No elections match your filters"
              description="Nothing matches the current search and status filter."
              action={
                <Button
                  variant="outline"
                  size="dense"
                  className="w-auto"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("");
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Election</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ballots</TableHead>
                    <TableHead>Distinct voters</TableHead>
                    <TableHead>Questions</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.election.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-[13px] font-semibold text-nv-ink">
                            {row.election.title}
                          </p>
                          <p className="text-[12px] text-nv-muted">{row.election.slug}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.election.status} />
                      </TableCell>
                      <TableCell className="nums-tabular text-[13px]">
                        {row.total_votes.toLocaleString()}
                      </TableCell>
                      <TableCell className="nums-tabular text-[13px]">
                        {row.distinct_voters.toLocaleString()}
                      </TableCell>
                      <TableCell className="nums-tabular text-[13px]">
                        {row.questions.length}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center justify-end gap-2">
                          <LinkButton
                            href={`/admin/results?election=${row.election.id}`}
                            variant="outline"
                            className="w-auto h-9 px-3"
                          >
                            Results
                          </LinkButton>
                          <Button
                            variant="outline"
                            size="dense"
                            className="w-auto"
                            onClick={() => setDetail(row)}
                          >
                            Details
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </Section>

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail ? `Ballot detail — ${detail.election.title}` : "Ballot detail"}
        description={
          detail
            ? `${detail.total_votes.toLocaleString()} ballots from ${detail.distinct_voters.toLocaleString()} distinct voters.`
            : undefined
        }
      >
        {detail ? (
          <div className="space-y-5 pb-2">
            {detail.questions.length === 0 ? (
              <p className="text-[13.5px] text-nv-muted">
                This election has no positions yet, so there is nothing to count.
              </p>
            ) : (
              detail.questions.map((question) => {
                const tallies = [...question.tallies].sort((a, b) => b.votes - a.votes);
                return (
                  <div key={question.id} className="space-y-3">
                    <div className="space-y-0.5">
                      <p className="text-[13.5px] font-semibold text-nv-ink">{question.name}</p>
                      <p className="text-[12px] text-nv-muted">
                        {question.ballot_type} · {question.max_winners} winner
                        {question.max_winners === 1 ? "" : "s"} ·{" "}
                        {question.total_votes.toLocaleString()} votes
                      </p>
                    </div>
                    {tallies.length === 0 ? (
                      <p className="text-[13px] text-nv-muted">No choices received votes yet.</p>
                    ) : (
                      <ResultsBars
                        data={tallies.map((tally) => ({
                          id: tally.id ?? 0,
                          label: tally.label,
                          votes: tally.votes,
                        }))}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="dense" className="w-auto" onClick={() => setDetail(null)}>
              Close
            </Button>
          </div>
        }
      </Dialog>
    </div>
  );
}

function ErrorBanner({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
    >
      <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{message}</p>
      <Button variant="outline" size="dense" className="w-auto" onClick={onRetry}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        Retry
      </Button>
    </div>
  );
}
