"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, Flag, Megaphone, RefreshCw, Undo2 } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { ResultsBars } from "@/src/components/results-bars";
import { AlertDialog } from "@/src/components/ui/dialog";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Section } from "@/src/components/ui/section";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatCard, StatGrid } from "@/src/components/ui/stat-card";
import { useToast } from "@/src/components/ui/toast";
import { apiRequest, useResource, useToken } from "../_shared";

type AdminElection = {
  id: number;
  title: string;
  slug: string;
  status: string;
  voting_start_at?: string | null;
  voting_end_at?: string | null;
};

type RankingEntry = {
  candidate_id: number;
  candidate_name: string;
  slogan?: string | null;
  vote_total: number;
  rank: number;
  is_winner: boolean;
};

type PositionSummary = {
  id: number;
  name: string;
  department: string | null;
  section: string | null;
  max_winners: number;
  voter_group: string;
  votes_cast: number;
  registered_voters: number;
  leader: RankingEntry | null;
  results: RankingEntry[];
};

type Stats = {
  election_id: number;
  status: string;
  allow_live_results: boolean;
  registered_voters: number;
  votes_cast: number;
  turnout_voters: number;
  turnout_percentage: number;
  candidate_count: number;
  position_count: number;
  positions: PositionSummary[];
  votes_by_department: { label: string; total_votes: number }[];
  votes_by_section: { label: string; total_votes: number }[];
};

type WinnerRow = { position: string; scope: string; winner_names: string };

type ResultPayload = {
  election: { id: number; title: string; slug: string; status: string; image_url?: string | null };
  stats: Stats;
  winners: WinnerRow[];
};

type ResultAction = "finalize" | "publish" | "unpublish";

const ACTION_COPY: Record<ResultAction, { label: string; hint: string; tone: "default" | "destructive" }> = {
  finalize: {
    label: "Finalize results",
    hint: "Locks the tally. Only allowed once the election status is CLOSED.",
    tone: "default",
  },
  publish: {
    label: "Publish results",
    hint: "Publishes the tally and moves the election to RESULTS_PUBLISHED so everyone can see it.",
    tone: "default",
  },
  unpublish: {
    label: "Unpublish results",
    hint: "Hides the tally again and returns the election to CLOSED.",
    tone: "destructive",
  },
};

export default function AdminResultsPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Results"
        description="Turnout, per-position rankings and published winners for any election, plus the admin controls to finalize, publish or unpublish a tally."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/elections" variant="outline" className="w-auto">
          Public elections
        </LinkButton>
      </div>
      <RequireRole role="admin">
        <ResultsBody />
      </RequireRole>
    </>
  );
}

function ResultsBody() {
  const token = useToken();
  const { toast } = useToast();
  const elections = useResource<AdminElection[]>(
    (authToken) => apiRequest<AdminElection[]>(authToken, "/api/admin/elections"),
    [],
  );

  const [selectedId, setSelectedId] = useState("");
  const [action, setAction] = useState<ResultAction | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get("election");
    if (param) setSelectedId(param);
  }, []);

  const electionRows = elections.data ?? [];

  useEffect(() => {
    if (!selectedId && electionRows.length) setSelectedId(String(electionRows[0].id));
  }, [electionRows, selectedId]);

  const results = useResource<ResultPayload | null>(
    (authToken) => {
      if (!selectedId) return Promise.resolve(null);
      return apiRequest<ResultPayload>(authToken, `/api/elections/${selectedId}/results`);
    },
    [selectedId],
  );

  const selected = useMemo(
    () => electionRows.find((row) => String(row.id) === selectedId) ?? null,
    [electionRows, selectedId],
  );

  const options = useMemo(
    () =>
      electionRows.map((row) => ({
        value: String(row.id),
        label: `${row.title} (${row.status})`,
      })),
    [electionRows],
  );

  const availableActions: ResultAction[] = useMemo(() => {
    if (!selected) return [];
    if (selected.status === "CLOSED") return ["finalize", "publish"];
    if (selected.status === "RESULTS_PUBLISHED") return ["unpublish"];
    return [];
  }, [selected]);

  async function runAction() {
    if (!action || !selectedId) return;
    setPending(true);
    try {
      await apiRequest(token, `/api/admin/elections/${selectedId}/results`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      toast({ title: `Result action “${action}” completed`, tone: "success" });
      setAction(null);
      elections.reload();
      results.reload();
    } catch (cause) {
      toast({
        title: "Result action failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  }

  if (elections.loading && !elections.data) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-11 w-full max-w-sm" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (elections.error && !elections.data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={elections.error} onRetry={elections.reload} />
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          title="Results could not be loaded"
          description="The election list endpoint did not respond. Retry, or confirm your session is still valid."
          action={
            <Button size="dense" className="w-auto" onClick={elections.reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (electionRows.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          title="No elections yet"
          description="Results appear here once an election exists and its tally becomes visible."
          action={
            <LinkButton href="/admin/elections" variant="outline" className="w-auto h-9 px-3">
              Go to elections
            </LinkButton>
          }
        />
      </div>
    );
  }

  const stats = results.data?.stats ?? null;
  const winners = results.data?.winners ?? [];

  return (
    <div className="mt-6 space-y-4">
      <Section
        title="Choose an election"
        description="Tally actions follow the election lifecycle: close voting, finalize, then publish."
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
            <Select
              label="Election"
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              options={options}
              placeholder="Choose an election"
            />
            <div className="flex flex-wrap items-center gap-2 pb-1">
              {selected ? <StatusBadge status={selected.status} /> : null}
              {selected ? <Badge variant="muted">{selected.slug}</Badge> : null}
            </div>
          </div>

          {availableActions.length ? (
            <div className="flex flex-wrap gap-2">
              {availableActions.map((item) => (
                <Button
                  key={item}
                  variant={ACTION_COPY[item].tone === "destructive" ? "subtle" : "primary"}
                  size="dense"
                  className="w-auto"
                  onClick={() => setAction(item)}
                >
                  {item === "finalize" ? (
                    <Flag className="h-4 w-4" aria-hidden="true" />
                  ) : item === "publish" ? (
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Undo2 className="h-4 w-4" aria-hidden="true" />
                  )}
                  {ACTION_COPY[item].label}
                </Button>
              ))}
            </div>
          ) : selected ? (
            <p className="text-[13px] text-nv-muted">
              {selected.status === "ARCHIVED"
                ? "Archived elections have no further result actions."
                : "Result actions appear once voting is closed."}
            </p>
          ) : null}
        </div>
      </Section>

      {results.error && selectedId ? (
        <ErrorBanner message={results.error} onRetry={results.reload} />
      ) : null}

      {results.loading && selectedId ? (
        <Skeleton className="h-40 w-full" />
      ) : stats ? (
        <>
          <StatGrid>
            <StatCard
              label="Turnout"
              value={`${stats.turnout_percentage}%`}
              caption={`${stats.turnout_voters.toLocaleString()} of ${stats.registered_voters.toLocaleString()} registered`}
              tone="primary"
              icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Ballots cast"
              value={stats.votes_cast.toLocaleString()}
              caption={`${stats.position_count} positions`}
              icon={<Flag className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Approved candidates"
              value={stats.candidate_count.toLocaleString()}
              caption="Eligible for this tally"
              icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Live results"
              value={stats.allow_live_results ? "On" : "Off"}
              caption={stats.allow_live_results ? "Visible during voting" : "Hidden until published"}
              tone={stats.allow_live_results ? "success" : "default"}
              icon={<Undo2 className="h-5 w-5" aria-hidden="true" />}
            />
          </StatGrid>

          <Section
            title="Winners"
            description="Positions that already have a declared winner."
          >
            {winners.length === 0 ? (
              <p className="text-[13.5px] text-nv-muted">
                No winners are declared yet. Winners appear once positions have votes and
                candidates meet the win conditions.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {winners.map((row) => (
                  <div
                    key={`${row.position}-${row.scope}`}
                    className="rounded-nv-md border border-nv-line bg-nv-canvas p-4"
                  >
                    <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                      {row.position}
                    </p>
                    <p className="mt-1 text-[14.5px] font-semibold text-nv-ink">
                      {row.winner_names}
                    </p>
                    <p className="text-[12.5px] text-nv-muted">{row.scope}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="By position"
            description="Vote totals per candidate, ordered by votes received."
          >
            {stats.positions.length === 0 ? (
              <p className="text-[13.5px] text-nv-muted">
                This election has no positions yet, so there is nothing to rank.
              </p>
            ) : (
              <div className="space-y-6">
                {stats.positions.map((position) => (
                  <div key={position.id} className="space-y-3">
                    <div className="space-y-0.5">
                      <p className="text-[14px] font-semibold text-nv-ink">{position.name}</p>
                      <p className="text-[12.5px] text-nv-muted">
                        {position.section ?? position.department ?? "Campus"} ·{" "}
                        {position.voter_group} · {position.max_winners} winner
                        {position.max_winners === 1 ? "" : "s"} · {position.votes_cast} of{" "}
                        {position.registered_voters} registered voted
                      </p>
                    </div>
                    {position.results.length === 0 ? (
                      <p className="text-[13px] text-nv-muted">No candidates to rank yet.</p>
                    ) : (
                      <ResultsBars
                        data={position.results.map((entry) => ({
                          id: entry.candidate_id,
                          label: `${entry.rank}. ${entry.candidate_name}`,
                          votes: entry.vote_total,
                          detail: entry.slogan || undefined,
                        }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Turnout breakdown"
            description="Ballots grouped by candidate department and section."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-nv-muted">
                  By department
                </p>
                {stats.votes_by_department.length === 0 ? (
                  <p className="text-[13px] text-nv-muted">
                    No department-tagged votes recorded.
                  </p>
                ) : (
                  <ResultsBars
                    data={stats.votes_by_department.map((row, index) => ({
                      id: index + 1,
                      label: row.label,
                      votes: row.total_votes,
                    }))}
                  />
                )}
              </div>
              <div className="space-y-3">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-nv-muted">
                  By section
                </p>
                {stats.votes_by_section.length === 0 ? (
                  <p className="text-[13px] text-nv-muted">No section-tagged votes recorded.</p>
                ) : (
                  <ResultsBars
                    data={stats.votes_by_section.map((row, index) => ({
                      id: index + 1,
                      label: row.label,
                      votes: row.total_votes,
                    }))}
                  />
                )}
              </div>
            </div>
          </Section>
        </>
      ) : selectedId ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          title="Tally unavailable"
          description="This election has no published tally to show yet."
          action={
            <Button variant="outline" size="dense" className="w-auto" onClick={results.reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      ) : null}

      <AlertDialog
        open={action !== null}
        onOpenChange={(next) => {
          if (!next) setAction(null);
        }}
        title={action ? ACTION_COPY[action].label : "Confirm"}
        description={action ? ACTION_COPY[action].hint : undefined}
        confirmLabel={action ? ACTION_COPY[action].label : "Confirm"}
        tone={action ? ACTION_COPY[action].tone : "default"}
        loading={pending}
        onConfirm={() => void runAction()}
      />
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
