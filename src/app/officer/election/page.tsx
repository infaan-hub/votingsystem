"use client";

import { Suspense } from "react";
import { ClipboardList, ExternalLink, RefreshCw, Vote } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton, PageHeader } from "@/src/components/ui/page-header";
import { KeyValueList, Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Tooltip } from "@/src/components/ui/tooltip";
import {
  ElectionPickerSection,
  ErrorBanner,
  ListSkeleton,
  NoElectionsState,
  PickElectionAction,
  apiFetch,
  displayValue,
  humanize,
  useElectionSelection,
  useResource,
  windowText,
  type ManagedElection,
  type Resource,
} from "../_shared";

const LEGAL_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["NOMINATIONS", "ARCHIVED"],
  NOMINATIONS: ["READY", "ARCHIVED"],
  READY: ["OPEN", "ARCHIVED"],
  OPEN: ["CLOSED"],
  CLOSED: ["RESULTS_PUBLISHED"],
  RESULTS_PUBLISHED: ["ARCHIVED"],
  ARCHIVED: [],
};

type ElectionAdminDetail = {
  lifecycle_status: string;
  visibility: string;
  eligibility_policy: string;
  result_visibility: string;
  secret_ballot: boolean;
  timezone: string | null;
  rules_text: string;
  voter_id_method: string;
  voter_id_label: string;
  capacity_mode: string;
  max_voters: number | null;
  campaign_start_at: string | null;
  campaign_end_at: string | null;
  voting_start_at: string | null;
  voting_end_at: string | null;
  is_published: boolean;
};

type PublicDetailPayload = {
  detail: ElectionAdminDetail;
};

type BallotPayload = {
  id: number;
  title: string;
  positions: {
    id: number;
    name: string;
    candidates: { id: number; user: { full_name: string } }[];
  }[];
};

export default function OfficerElectionPage() {
  return (
    <>
      <PageHeader
        title="Run my election"
        description="Overview, lifecycle, ballot and share link for one of the elections you administer."
        breadcrumbs={[
          { label: "Officer dashboard", href: "/officer/dashboard" },
          { label: "Election" },
        ]}
        actions={
          <>
            <LinkButton href="/officer/election/new" className="w-auto">
              Add election
            </LinkButton>
            <LinkButton href="/officer/dashboard" variant="outline" className="w-auto">
              All elections
            </LinkButton>
          </>
        }
      />
      <RequireRole role="officer">
        <Suspense fallback={<div className="mt-6"><ListSkeleton /></div>}>
          <ElectionBody />
        </Suspense>
      </RequireRole>
    </>
  );
}

function ElectionBody() {
  const { selected: selectedId, select } = useElectionSelection();
  const list = useResource<ManagedElection[]>(
    (token) => apiFetch<ManagedElection[]>(token, "/api/officer/elections"),
    [],
  );

  const rows = list.data ?? [];
  const selected = rows.find((row) => String(row.id) === selectedId) ?? null;

  const overview = useResource<PublicDetailPayload | null>(
    (token) =>
      selected
        ? apiFetch<PublicDetailPayload>(token, `/api/elections/public/${selected.slug}`)
        : Promise.resolve(null),
    [selected?.slug ?? ""],
  );

  const ballot = useResource<BallotPayload | null>(
    (token) =>
      selected
        ? apiFetch<BallotPayload>(token, `/api/elections/${selected.id}`)
        : Promise.resolve(null),
    [selected?.id ?? 0],
  );

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
          description="Your managed election list did not come back from the officer API. Retry to try again."
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

  return (
    <div className="mt-6 space-y-5">
      {list.error ? <ErrorBanner message={list.error} onRetry={list.reload} /> : null}

      <ElectionPickerSection elections={rows} value={selectedId} onChange={select}>
        {selected ? <StatusBadge status={selected.status} /> : null}
      </ElectionPickerSection>

      {selected ? (
        <>
          <OverviewSection row={selected} overview={overview} />
          <LifecycleSection status={selected.status} />
          <BallotSection row={selected} ballot={ballot} />
          <ShareLinkSection row={selected} />
        </>
      ) : (
        <EmptyState
          icon={<Vote className="h-5 w-5" aria-hidden="true" />}
          title="No election selected"
          description="Choose one of your elections above to review its settings, lifecycle moves, ballot contents and share link."
          action={<PickElectionAction />}
        />
      )}
    </div>
  );
}

function OverviewSection({
  row,
  overview,
}: {
  row: ManagedElection;
  overview: Resource<PublicDetailPayload | null>;
}) {
  const detail = overview.data?.detail ?? null;
  const privateNote =
    row.visibility === "private"
      ? "Detailed settings for a private election are only readable through a valid invite link, so the rows below fall back to your managed-election summary."
      : "";

  const capacityValue = detail?.capacity_mode
    ? detail.max_voters
      ? `${humanize(detail.capacity_mode)} — up to ${detail.max_voters.toLocaleString()} voters`
      : `${humanize(detail.capacity_mode)} — no declared cap`
    : "Not available yet";

  const voterIdValue = detail?.voter_id_method
    ? detail.voter_id_method === "custom" && detail.voter_id_label
      ? `${humanize(detail.voter_id_method)} — ${detail.voter_id_label}`
      : humanize(detail.voter_id_method)
    : "Not available yet";

  return (
    <Section
      title="Overview"
      description="How this election is configured: who may vote, when campaigns and voting run, and who can see results."
    >
      <div className="space-y-4">
        {overview.loading && !overview.data ? <Skeleton className="h-48 w-full" /> : null}

        {overview.error && !privateNote ? (
          <ErrorBanner message={overview.error} onRetry={overview.reload} />
        ) : null}

        {overview.error && privateNote ? (
          <p className="rounded-nv-md border border-nv-line bg-nv-bg p-3 text-[13px] text-nv-muted">
            {privateNote}
          </p>
        ) : null}

        {!overview.loading ? (
          <KeyValueList
            items={[
              {
                label: "Lifecycle status",
                value: <StatusBadge status={detail?.lifecycle_status ?? row.status} />,
              },
              { label: "Visibility", value: humanize(detail?.visibility ?? row.visibility) },
              { label: "Capacity", value: capacityValue },
              { label: "Eligibility policy", value: humanize(detail?.eligibility_policy) },
              { label: "Voter identification", value: voterIdValue },
              { label: "Timezone", value: displayValue(detail?.timezone) },
              {
                label: "Campaign window",
                value: windowText(detail?.campaign_start_at, detail?.campaign_end_at),
              },
              {
                label: "Voting window",
                value: windowText(
                  row.voting_start_at ?? detail?.voting_start_at,
                  row.voting_end_at ?? detail?.voting_end_at,
                ),
              },
              { label: "Result visibility", value: humanize(detail?.result_visibility) },
              {
                label: "Secret ballot",
                value: detail ? (detail.secret_ballot ? "Yes" : "No") : "Not available yet",
              },
              {
                label: "Rules shown to voters",
                block: true,
                value: detail?.rules_text?.trim()
                  ? detail.rules_text
                  : "No rules text has been written yet. Voters see this text next to the ballot.",
              },
            ]}
          />
        ) : null}
      </div>
    </Section>
  );
}

function LifecycleSection({ status }: { status: string }) {
  const allowed = LEGAL_TRANSITIONS[status] ?? [];

  return (
    <Section
      title="Lifecycle"
      description="The state machine that moves an election from draft to archived."
      actions={<StatusBadge status={status} />}
    >
      <div className="space-y-4">
        <p className="text-[13.5px] text-nv-text">
          Current state: <span className="font-semibold text-nv-ink">{humanize(status)}</span>.
          {allowed.length
            ? ` Allowed next states: ${allowed.map((target) => humanize(target)).join(", ")}.`
            : " This state has no further transitions."}
        </p>

        {allowed.length ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {allowed.map((target) => (
                <Tooltip key={target} content="Administrators control the lifecycle">
                  <Button variant="outline" size="dense" className="w-auto" disabled>
                    {humanize(target)}
                  </Button>
                </Tooltip>
              ))}
            </div>
            <p className="text-[13px] text-nv-muted">
              Lifecycle moves are reserved for administrators. If this election should advance to{" "}
              {allowed.map((target) => humanize(target)).join(" or ")}, ask an administrator to run
              the transition for you.
            </p>
            <LinkButton href="/contact" variant="outline" className="w-auto">
              Contact an administrator
            </LinkButton>
          </div>
        ) : (
          <p className="text-[13px] text-nv-muted">
            Archived elections stay archived. Ask an administrator if this election needs to be
            restored.
          </p>
        )}
      </div>
    </Section>
  );
}

function BallotSection({
  row,
  ballot,
}: {
  row: ManagedElection;
  ballot: Resource<BallotPayload | null>;
}) {
  const positions = ballot.data?.positions ?? [];
  const candidateCount = positions.reduce((sum, position) => sum + position.candidates.length, 0);
  const unpublished = !row.is_published;

  return (
    <Section
      title="Ballot"
      description="What voters see when this election opens: positions, candidates and a public preview."
      actions={
        <LinkButton
          href={`/elections/${row.slug}`}
          variant="outline"
          className="w-auto"
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          Open preview
        </LinkButton>
      }
    >
      <div className="space-y-4">
        {ballot.loading && !ballot.data ? <Skeleton className="h-24 w-full" /> : null}

        {ballot.error && !unpublished ? (
          <ErrorBanner message={ballot.error} onRetry={ballot.reload} />
        ) : null}

        {ballot.error && unpublished ? (
          <p className="text-[13px] text-nv-muted">
            The ballot preview is published to voters only once this election leaves draft. The
            counts below come from your managed-election summary until then.
          </p>
        ) : null}

        {!ballot.loading ? (
          <KeyValueList
            columns={3}
            items={[
              {
                label: "Positions",
                value: (
                  <span className="nums-tabular">
                    {ballot.data ? positions.length : row.counts.positions}
                  </span>
                ),
              },
              {
                label: "Candidates",
                value: (
                  <span className="nums-tabular">
                    {ballot.data ? candidateCount : row.counts.candidates}
                  </span>
                ),
              },
              {
                label: "Source",
                value: ballot.data ? "Live ballot" : "Managed-election summary",
              },
            ]}
          />
        ) : null}

        {row.visibility === "private" ? (
          <p className="text-[13px] text-nv-muted">
            This election is private, so the preview only opens for voters who hold a current share
            link. Generate one under Management.
          </p>
        ) : null}
      </div>
    </Section>
  );
}

function ShareLinkSection({ row }: { row: ManagedElection }) {
  return (
    <Section
      title="Share link"
      description="Invite-only access for elections that are not open to everyone."
    >
      <div className="space-y-3">
        <p className="text-[13.5px] text-nv-muted">
          {row.visibility === "private"
            ? "This election is private: voters need a share link before they can even see it. Invite links are issued on demand and expire, so the current link is not shown here."
            : "This election does not need a share link because it is not private. Only private elections rely on an invite token for access."}
        </p>
        <p className="text-[13px] text-nv-muted">
          {row.visibility === "private"
            ? "Generate and copy the invite path from the Management workspace, where it can also be regenerated with a fresh expiry."
            : "If this election later becomes private, its share link will appear under Management."}
        </p>
        <LinkButton
          href={`/officer/management?election=${row.id}`}
          variant="outline"
          className="w-auto"
        >
          <ClipboardList className="h-4 w-4" aria-hidden="true" />
          Open Management
        </LinkButton>
      </div>
    </Section>
  );
}
