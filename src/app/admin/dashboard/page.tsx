"use client";

import {
  Activity,
  BarChart3,
  RefreshCw,
  ShieldCheck,
  Tags,
  Users,
  Vote,
} from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Progress } from "@/src/components/ui/progress";
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
import { apiRequest, displayDate, useResource } from "../_shared";
import { useLiveRefresh } from "@/src/lib/live";

type ElectionRow = { id: number; title: string; status: string };

type UserRow = { id: number };

type VotesPayload = { total_votes: number; election_count: number };

type AuditRow = {
  id: number;
  action: string;
  entity_type: string;
  summary: string | null;
  created_at: string | null;
  actor: { username: string; full_name: string } | null;
};

type DashboardData = {
  elections: ElectionRow[];
  userCount: number;
  totalVotes: number;
  audit: AuditRow[];
};

const LIFECYCLE = [
  "DRAFT",
  "PUBLISHED",
  "NOMINATIONS",
  "READY",
  "OPEN",
  "CLOSED",
  "RESULTS_PUBLISHED",
  "ARCHIVED",
];

export default function AdminDashboardPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Platform dashboard"
        description="Everything that needs an administrator today: election lifecycle, recent activity and platform totals."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/admin/elections" variant="outline" className="w-auto">
          <Vote className="h-4 w-4" aria-hidden="true" />
          Elections
        </LinkButton>
      </div>
      <RequireRole role="admin">
        <DashboardBody />
      </RequireRole>
    </>
  );
}

function DashboardBody() {
  const { data, error, loading, reload } = useResource<DashboardData>(loadDashboard, []);

  // Totals and activity move while the dashboard is open; refresh on live
  // alerts, on tab focus and via a slow safety poll.
  useLiveRefresh(reload, { intervalMs: 120_000 });

  if (loading && !data) {
    return (
      <div className="mt-6 space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((row) => (
            <Skeleton key={row} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={error} onRetry={reload} />
        <EmptyState
          icon={<Activity className="h-5 w-5" aria-hidden="true" />}
          title="Dashboard data unavailable"
          description="The overview could not be loaded from the admin API. Check your connection and retry."
          action={
            <Button onClick={reload} size="dense" className="w-auto">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  if (!data) return null;

  const counts = LIFECYCLE.map((status) => ({
    status,
    count: data.elections.filter((election) => election.status === status).length,
  })).filter((entry) => entry.count > 0);
  const totalElections = data.elections.length;

  return (
    <div className="mt-6 space-y-5">
      {error ? <ErrorBanner message={error} onRetry={reload} /> : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-nv-muted">
          {loading ? "Refreshing…" : "Latest successful load"}
        </p>
        <Button variant="outline" size="dense" className="w-auto" onClick={reload} disabled={loading}>
          <RefreshCw className={"h-4 w-4" + (loading ? " animate-spin" : "")} aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <StatGrid>
        <StatCard
          label="Elections"
          value={totalElections}
          caption="All lifecycle states"
          icon={<Vote className="h-4 w-4" aria-hidden="true" />}
          tone="primary"
        />
        <StatCard
          label="Users"
          value={data.userCount}
          caption="Non-administrator accounts"
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          tone="default"
        />
        <StatCard
          label="Total votes"
          value={data.totalVotes}
          caption="Cast across all elections"
          icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
          tone="success"
        />
      </StatGrid>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section
          title="Election lifecycle"
          description="How the platform's elections are distributed across lifecycle states."
        >
          {totalElections === 0 ? (
            <EmptyState
              icon={<Vote className="h-5 w-5" aria-hidden="true" />}
              title="No elections yet"
              description="Establishing an election from the elections area will populate this breakdown."
              action={
                <LinkButton href="/admin/elections" variant="outline" className="w-auto">
                  Go to elections
                </LinkButton>
              }
            />
          ) : (
            <ul className="space-y-4">
              {counts.map((entry) => (
                <li key={entry.status}>
                  <div className="flex items-center justify-between gap-3">
                    <StatusBadge status={entry.status} />
                    <span className="nums-tabular text-[13px] font-semibold text-nv-text">
                      {entry.count} of {totalElections}
                    </span>
                  </div>
                  <Progress
                    value={Math.round((entry.count / totalElections) * 100)}
                    className="mt-2 h-2.5"
                    aria-label={`${entry.status}: ${entry.count} elections`}
                  />
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section
        title="Recent audit activity"
        description="The last eight recorded actions. Audit rows are append-only."
        actions={
          <LinkButton href="/admin/audit-logs" variant="outline" className="w-auto h-11 text-[12px]">
            <Activity className="h-4 w-4" aria-hidden="true" />
            Full audit log
          </LinkButton>
        }
      >
        {data.audit.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
            title="No audit activity recorded yet"
            description="Election administration, role changes and officer assignments are written here as they happen."
            action={
              <LinkButton href="/admin/elections" variant="outline" className="w-auto">
                Go to elections
              </LinkButton>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.audit.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="nums-tabular whitespace-nowrap text-[12.5px]">
                      {displayDate(row.created_at)}
                    </TableCell>
                    <TableCell className="text-[13px]">
                      {row.actor?.full_name || row.actor?.username || "System"}
                    </TableCell>
                    <TableCell>
                      <code className="rounded bg-nv-bg px-1.5 py-0.5 text-[12px] text-nv-text">
                        {row.action}
                      </code>
                    </TableCell>
                    <TableCell className="min-w-[16rem] text-[13px]">
                      {row.summary || row.entity_type}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Section>

      <Section title="Quick actions" description="Common administrator destinations.">
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/admin/elections" variant="primary" className="w-auto h-11">
            <Vote className="h-4 w-4" aria-hidden="true" />
            Elections
          </LinkButton>
          <LinkButton href="/admin/add-election-officer" variant="outline" className="w-auto h-11">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Add election officer
          </LinkButton>
          <LinkButton href="/admin/audit-logs" variant="outline" className="w-auto h-11">
            <Tags className="h-4 w-4" aria-hidden="true" />
            Audit logs
          </LinkButton>
        </div>
      </Section>
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

async function loadDashboard(token: string): Promise<DashboardData> {
  const [elections, users, votes, audit] = await Promise.all([
    apiRequest<ElectionRow[]>(token, "/api/admin/elections"),
    apiRequest<{ users: UserRow[] }>(token, "/api/admin/users"),
    apiRequest<VotesPayload>(token, "/api/admin/votes"),
    apiRequest<{ results: AuditRow[] }>(token, "/api/admin/audit-logs?limit=8"),
  ]);
  return {
    elections,
    userCount: users.users?.length ?? 0,
    totalVotes: votes.total_votes ?? 0,
    audit: audit.results ?? [],
  };
}
