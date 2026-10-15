"use client";

import { useEffect, useState } from "react";
import { BarChart3, Flag, Megaphone, RefreshCw, ShieldCheck, Vote } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Badge } from "@/src/components/ui/badge";
import { KeyValueList, Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { StatCard, StatGrid } from "@/src/components/ui/stat-card";
import {
  ErrorBanner,
  NoElectionsState,
  apiFetch,
  humanize,
  useResource,
  type ManagedElection,
} from "../_shared";

export default function OfficerDashboardPage() {
  const { user } = useApp();

  return (
    <>
      <PageHero
        eyebrow="Officer dashboard"
        title={user ? `Welcome, ${user.full_name}` : "Officer dashboard"}
        description="Your managed elections at a glance: lifecycle status, ballot counts, published campaigns and direct links into each workspace."
        actions={
          <Badge variant="hero" className="gap-1.5 px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.6px]">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Election officer
          </Badge>
        }
      />
      <RequireRole role="officer">
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/officer/election/new" className="w-auto">
            Add election
          </LinkButton>
        </div>
        <DashboardBody />
      </RequireRole>
    </>
  );
}

function DashboardBody() {
  const elections = useResource<ManagedElection[]>(
    (token) => apiFetch<ManagedElection[]>(token, "/api/officer/elections"),
    [],
  );

  if (elections.loading && !elections.data) {
    return (
      <div className="mt-6 space-y-5" aria-busy="true">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    );
  }

  if (elections.error && !elections.data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={elections.error} onRetry={elections.reload} />
        <EmptyState
          icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
          title="Your elections could not be loaded"
          description="The officer API did not respond, so no election data is shown. Nothing has been changed — retry when you are ready."
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

  const rows = elections.data ?? [];

  if (!rows.length) {
    return (
      <div className="mt-6">
        <NoElectionsState />
      </div>
    );
  }

  const totalVotes = rows.reduce((sum, row) => sum + row.counts.votes, 0);
  const publishedCampaigns = rows.reduce(
    (sum, row) => sum + row.counts.published_campaigns,
    0,
  );
  const openNow = rows.filter((row) => row.status === "OPEN").length;

  return (
    <div className="mt-6 space-y-5">
      {elections.error ? <ErrorBanner message={elections.error} onRetry={elections.reload} /> : null}

      <StatGrid>
        <StatCard
          label="Elections managed"
          value={rows.length}
          caption="Assigned to you as officer"
          tone="primary"
          icon={<Vote className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="Votes recorded"
          value={totalVotes.toLocaleString()}
          caption="Across all of your elections"
          tone="success"
          icon={<BarChart3 className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="Published campaigns"
          value={publishedCampaigns.toLocaleString()}
          caption="Visible to voters now"
          icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
        />
        <StatCard
          label="Open for voting"
          value={openNow}
          caption="Elections in the OPEN state"
          tone={openNow ? "success" : "default"}
          icon={<Flag className="h-5 w-5" aria-hidden="true" />}
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        {rows.map((election) => (
          <ElectionCard key={election.id} election={election} />
        ))}
      </div>
    </div>
  );
}

function ElectionCard({ election }: { election: ManagedElection }) {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [setNow]);

  const startMs = election.voting_start_at ? Date.parse(election.voting_start_at) : Number.NaN;
  const endMs = election.voting_end_at ? Date.parse(election.voting_end_at) : Number.NaN;
  const opensIn = Number.isFinite(startMs) && startMs > now;
  const countdownTarget = opensIn
    ? election.voting_start_at
    : Number.isFinite(endMs)
      ? election.voting_end_at
      : null;

  return (
    <Section
      title={election.title}
      description={election.category ? election.category.name : "No category assigned"}
      actions={<StatusBadge status={election.status} />}
    >
      <div className="space-y-4">
        {countdownTarget ? (
          <Countdown
            target={countdownTarget}
            prefix={opensIn ? "Voting opens in" : "Voting ends in"}
          />
        ) : (
          <p className="text-[13px] text-nv-muted">Voting schedule unavailable.</p>
        )}

        <KeyValueList
          columns={3}
          items={[
            { label: "Positions", value: <span className="nums-tabular">{election.counts.positions}</span> },
            { label: "Candidates", value: <span className="nums-tabular">{election.counts.candidates}</span> },
            { label: "Votes cast", value: <span className="nums-tabular">{election.counts.votes}</span> },
            { label: "Eligible voters", value: <span className="nums-tabular">{election.counts.eligible_voters}</span> },
            { label: "Campaigns", value: <span className="nums-tabular">{election.counts.published_campaigns}</span> },
            { label: "Visibility", value: humanize(election.visibility) },
          ]}
        />

        <div className="flex flex-wrap gap-2">
          <LinkButton href={`/officer/election?election=${election.id}`} className="w-auto">
            Manage
          </LinkButton>
          <LinkButton href={`/officer/compaign?election=${election.id}`} variant="outline" className="w-auto">
            Campaigns
          </LinkButton>
          <LinkButton href={`/officer/management?election=${election.id}`} variant="outline" className="w-auto">
            Voters
          </LinkButton>
          <LinkButton href={`/officer/results?election=${election.id}`} variant="outline" className="w-auto">
            Results
          </LinkButton>
        </div>
      </div>
    </Section>
  );
}
