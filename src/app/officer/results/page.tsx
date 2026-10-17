"use client";

import { Suspense, useEffect, useState } from "react";
import { BarChart3, Eye, Flag, Loader2, Megaphone, RefreshCw, Users } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { ResultCard, type ResultCardPayload } from "@/src/components/result-card";
import { ResultsBars } from "@/src/components/results-bars";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { KeyValueList, Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatCard, StatGrid } from "@/src/components/ui/stat-card";
import { useToast } from "@/src/components/ui/toast";
import { useLiveRefresh } from "@/src/lib/live";
import {
  ElectionPickerSection,
  ErrorBanner,
  ListSkeleton,
  NoElectionsState,
  PickElectionAction,
  apiFetch,
  humanize,
  useElectionSelection,
  useResource,
  windowText,
  type ManagedElection,
} from "../_shared";

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
  election: { id: number; title: string; status: string };
  stats: Stats;
  winners: WinnerRow[];
};

const VISIBILITY_POLICIES: { key: string; label: string; detail: string }[] = [
  {
    key: "live",
    label: "Live",
    detail: "Tallies update while voting runs, for everyone who can open the results.",
  },
  {
    key: "published",
    label: "Published",
    detail: "Results appear as soon as they are published, without a separate reveal step.",
  },
  {
    key: "officers",
    label: "Officers",
    detail: "Administrators and election officers see the tally early; voters wait until publication.",
  },
];

function formatPublished(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function OfficerResultsPage() {
  return (
    <>
      <PageHero
        eyebrow="Officer dashboard"
        title="Results"
        description="Ballot totals, turnout, winners and per-position bars for one of your elections."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/officer/dashboard" variant="outline" className="w-auto">
          All elections
        </LinkButton>
      </div>
      <RequireRole role="officer">
        <Suspense fallback={<div className="mt-6"><ListSkeleton /></div>}>
          <ResultsBody />
        </Suspense>
      </RequireRole>
    </>
  );
}

function ResultsBody() {
  const list = useResource<ManagedElection[]>(
    (token) => apiFetch<ManagedElection[]>(token, "/api/officer/elections"),
    [],
  );
  const rows = list.data ?? [];
  const { selected: selectedId, select } = useElectionSelection();
  const selected = rows.find((row) => String(row.id) === selectedId) ?? null;

  const { token } = useApp();
  const { toast } = useToast();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const results = useResource<ResultPayload | null>(
    (token) =>
      selected
        ? apiFetch<ResultPayload>(token, `/api/elections/${selected.id}/results`)
        : Promise.resolve(null),
    [selected?.id ?? 0],
  );

  // The exact payload the published card shows — and the officer preview
  // renders — so what is previewed is what gets published.
  const card = useResource<ResultCardPayload | null>(
    (authToken) =>
      selected
        ? apiFetch<ResultCardPayload>(authToken, `/api/elections/${selected.id}/result-card/`)
        : Promise.resolve(null),
    [selected?.id ?? 0],
  );

  const published = Boolean(card.data?.election.published);
  // Ticks while the page is open so the publish button unlocks right when the
  // voting window closes, without a manual refresh.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  // Ballots and publish state move while the page is open; refresh on live
  // alerts, on tab focus and via a slow safety poll.
  useLiveRefresh(() => {
    list.reload();
    results.reload();
    card.reload();
  }, { intervalMs: 120_000 });
  const votingEnded = selected?.voting_end_at
    ? new Date(selected.voting_end_at).getTime() <= now
    : false;
  const ballotCount = selected?.counts.votes ?? 0;
  const canPublish = Boolean(selected) && votingEnded && ballotCount > 0 && !published;

  async function publishResult() {
    if (!selected || publishing) return;
    setPublishing(true);
    try {
      await apiFetch(token, `/api/officer/elections/${selected.id}/results/`, {
        method: "POST",
        body: JSON.stringify({ action: "publish" }),
      });
      toast({
        title: "Result published",
        description: "Everyone who voted in this election has been notified.",
        tone: "success",
      });
      setPreviewOpen(false);
      card.reload();
      results.reload();
      list.reload();
    } catch (cause) {
      toast({
        title: "Could not publish the result",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setPublishing(false);
    }
  }

  if (list.loading && !list.data) {
    return <div className="mt-6"><ListSkeleton /></div>;
  }

  if (list.error && !list.data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={list.error} onRetry={list.reload} />
        <EmptyState
          icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
          title="Elections could not be loaded"
          description="Results are grouped by the elections you manage, and that list did not load. Retry to try again."
          action={
            <Button size="dense" className="w-auto" onClick={list.reload}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="mt-6">
        <NoElectionsState />
      </div>
    );
  }

  const stats = results.data?.stats ?? null;
  const winners = results.data?.winners ?? [];

  return (
    <div className="mt-6 space-y-5">
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}

      <ElectionPickerSection elections={rows} value={selectedId} onChange={select}>
        {selected ? <StatusBadge status={selected.status} /> : null}
      </ElectionPickerSection>

      {selected ? (
        <Section
          title="Schedule & campaign"
          description="When campaigns and voting run for this election, and how many campaigns are live."
        >
          <div className="space-y-4">
            <KeyValueList
              items={[
                {
                  label: "Campaign window",
                  value: windowText(selected.campaign_start_at, selected.campaign_end_at),
                },
                {
                  label: "Voting window",
                  value: windowText(selected.voting_start_at, selected.voting_end_at),
                },
                {
                  label: "Published campaigns",
                  value: (
                    <span className="nums-tabular">{selected.counts.published_campaigns}</span>
                  ),
                },
                {
                  label: "Eligible voters",
                  value: <span className="nums-tabular">{selected.counts.eligible_voters}</span>,
                },
              ]}
            />
            <div className="space-y-2">
              {selected.campaign_end_at ? (
                <Countdown target={selected.campaign_end_at} prefix="Campaign ends in" />
              ) : null}
              {selected.voting_end_at ? (
                <Countdown target={selected.voting_end_at} prefix="Voting ends in" />
              ) : null}
            </div>
          </div>
        </Section>
      ) : null}

      {!selected ? (
        <EmptyState
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
          title="No election selected"
          description="Choose one of your elections above to read its tally, turnout and winners."
          action={<PickElectionAction />}
        />
      ) : results.status === 403 ? (
        <HiddenResultsSection row={selected} onRetry={results.reload} />
      ) : results.loading && !results.data ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : results.error && !results.data ? (
        <div className="space-y-4">
          <ErrorBanner message={results.error} onRetry={results.reload} />
          <EmptyState
            icon={<Flag className="h-5 w-5" aria-hidden="true" />}
            title="Tally unavailable"
            description="The results endpoint did not return a tally for this election. It may not be published yet, or the connection failed — retry to try again."
            action={
              <Button size="dense" className="w-auto" onClick={results.reload}>
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            }
          />
        </div>
      ) : stats ? (
        <>
          {results.error ? <ErrorBanner message={results.error} onRetry={results.reload} /> : null}

          <StatGrid>
            <StatCard
              label="Ballots cast"
              value={stats.votes_cast.toLocaleString()}
              caption={`${stats.position_count} positions · ${stats.candidate_count} candidates`}
              tone="primary"
              icon={<Flag className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Distinct voters"
              value={stats.turnout_voters.toLocaleString()}
              caption={`${stats.registered_voters.toLocaleString()} registered to vote`}
              icon={<Users className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Turnout"
              value={`${stats.turnout_percentage}%`}
              caption="Share of registered voters who voted"
              tone="success"
              icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
            />
            <StatCard
              label="Tally status"
              value={humanize(stats.status)}
              caption={`Election state: ${humanize(selected.status)}`}
              icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
            />
          </StatGrid>

          <Section title="Winners" description="Positions that already have a declared winner.">
            {winners.length === 0 ? (
              <p className="text-[13.5px] text-nv-muted">
                No winners are declared yet. Winners appear once positions have votes and the
                leading candidates satisfy each position&apos;s win conditions.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {winners.map((row) => (
                  <div
                    key={`${row.position}-${row.scope}`}
                    className="rounded-nv-md border border-nv-line bg-nv-bg p-4"
                  >
                    <p className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
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
              <EmptyState
                icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
                title="No positions on this ballot"
                description="Nothing can be tallied until at least one position with candidates exists on the ballot."
                action={
                  <LinkButton href={`/officer/election?election=${selected.id}`} variant="outline" className="w-auto">
                    Open election overview
                  </LinkButton>
                }
              />
            ) : (
              <div className="space-y-6">
                {stats.positions.map((position) => (
                  <div key={position.id} className="space-y-3">
                    <div className="space-y-0.5">
                      <p className="text-[14px] font-semibold text-nv-ink">{position.name}</p>
                      <p className="text-[12.5px] text-nv-muted">
                        {position.section ?? position.department ?? "Campus"} · {position.voter_group}{" "}
                        · {position.max_winners} winner{position.max_winners === 1 ? "" : "s"} ·{" "}
                        <span className="nums-tabular">
                          {position.votes_cast} of {position.registered_voters}
                        </span>{" "}
                        registered voted
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
            title="Publish result"
            description="Preview the exact result card voters will receive, then publish it. Publishing notifies everyone who cast a ballot and opens the same card on their device."
          >
            <div className="space-y-4">
              {card.loading && !card.data ? <Skeleton className="h-28 w-full" /> : null}
              {card.error && !card.data ? (
                <ErrorBanner message={card.error} onRetry={card.reload} />
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="dense"
                  className="w-auto"
                  onClick={() => setPreviewOpen(true)}
                  disabled={!card.data}
                >
                  <Eye className="h-4 w-4" aria-hidden="true" />
                  Preview result
                </Button>
                <Button
                  size="dense"
                  className="w-auto"
                  onClick={() => void publishResult()}
                  disabled={!canPublish || publishing}
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                  )}
                  Publish result
                </Button>
              </div>

              {published ? (
                <p className="text-[13px] text-nv-muted">
                  Published
                  {formatPublished(card.data?.election.result_published_at)
                    ? ` on ${formatPublished(card.data?.election.result_published_at)}`
                    : ""}
                  . Everyone who voted was notified and opens this exact card on their device.
                </p>
              ) : !votingEnded ? (
                <p className="text-[13px] text-nv-muted">
                  Publishing unlocks after this election&apos;s voting window closes.
                </p>
              ) : ballotCount === 0 ? (
                <p className="text-[13px] text-nv-muted">
                  No ballots have been cast yet, so there is nothing to publish.
                </p>
              ) : (
                <p className="nums-tabular text-[13px] text-nv-muted">
                  {ballotCount.toLocaleString()} ballot{ballotCount === 1 ? "" : "s"} ready.
                  Preview the card, then publish to notify every voter who took part.
                </p>
              )}
            </div>
          </Section>

          <div className="rounded-nv-md border border-nv-line bg-nv-bg p-4">
            <p className="text-[13px] text-nv-muted">
              Publishing above releases the result card and notifies the voters who took part.
              Closing, finalizing and archiving the election remain administrator actions — ask an
              administrator when the lifecycle should move.
            </p>
            <div className="mt-3">
              <LinkButton href="/contact" variant="outline" className="w-auto">
                Contact an administrator
              </LinkButton>
            </div>
          </div>

          <Dialog
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            title="Result card preview"
            description="This is exactly what every voter who took part opens from the notification."
            footer={
              <>
                <Button
                  variant="outline"
                  onClick={() => setPreviewOpen(false)}
                  className="sm:w-auto"
                >
                  Close
                </Button>
                <Button
                  onClick={() => void publishResult()}
                  disabled={!canPublish || publishing}
                  className="sm:w-auto"
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Megaphone className="h-4 w-4" aria-hidden="true" />
                  )}
                  Publish result
                </Button>
              </>
            }
          >
            {card.data ? (
              <ResultCard card={card.data} />
            ) : (
              <Skeleton className="h-80 w-full" />
            )}
          </Dialog>
        </>
      ) : null}
    </div>
  );
}

function HiddenResultsSection({
  row,
  onRetry,
}: {
  row: ManagedElection;
  onRetry: () => void;
}) {
  return (
    <Section
      title="Results are hidden for now"
      description="The tally exists, but this election's visibility rules keep it closed until the right moment."
    >
      <div className="space-y-4">
        <div className="rounded-nv-md border border-nv-line bg-nv-bg p-4">
          <p className="text-[13.5px] text-nv-text">
            Results are hidden until the election closes. Nothing is missing — the totals are
            simply not shared yet.
          </p>
        </div>

        {row.voting_end_at ? (
          <Countdown target={row.voting_end_at} prefix="Voting ends in" />
        ) : (
          <p className="text-[13px] text-nv-muted">Voting schedule unavailable.</p>
        )}

        <div className="space-y-3">
          <p className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
            How result visibility works
          </p>
          <ul className="space-y-2">
            {VISIBILITY_POLICIES.map((policy) => (
              <li key={policy.key} className="rounded-nv-md border border-nv-line bg-nv-bg p-3">
                <p className="text-[13.5px] font-semibold text-nv-ink">{policy.label}</p>
                <p className="text-[12.5px] text-nv-muted">{policy.detail}</p>
              </li>
            ))}
          </ul>
          <p className="text-[13px] text-nv-muted">
            This election&apos;s exact setting is shown on the Election overview page. Once voting ends,
            results appear here automatically — you do not need to request them again.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="dense" className="w-auto" onClick={onRetry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Check again
          </Button>
          <LinkButton href={`/officer/election?election=${row.id}`} variant="outline" className="w-auto">
            Election overview
          </LinkButton>
        </div>
      </div>
    </Section>
  );
}
