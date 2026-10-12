"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Info, ListChecks, RefreshCw } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { LinkButton, PageHeader } from "@/src/components/ui/page-header";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useToast } from "@/src/components/ui/toast";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { apiRequest, windowText, useResource, useToken } from "../_shared";

type AdminElection = {
  id: number;
  title: string;
  description?: string | null;
  slug: string;
  image?: string;
  image_url?: string | null;
  status: string;
  eligibility_policy?: string;
  result_visibility?: string;
  secret_ballot?: boolean;
  timezone?: string;
  allow_admins_to_vote?: boolean;
  is_published?: boolean;
  campaign_start_at?: string | null;
  campaign_end_at?: string | null;
  voting_start_at?: string | null;
  voting_end_at?: string | null;
  registration_start_at?: string | null;
  registration_end_at?: string | null;
  allow_live_results?: boolean;
  announce_winners_automatically?: boolean;
  category_id?: number | null;
  organization_id?: number | null;
  visibility?: string;
  capacity_mode?: string;
  max_voters?: number | null;
  voter_id_method?: string;
  voter_id_label?: string;
  rules_text?: string;
  share_token?: string | null;
  result_finalized_at?: string | null;
  result_published_at?: string | null;
  archived_at?: string | null;
};

type CategoryRow = { id: number; name: string };

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

const TRANSITION_LABELS: Record<string, string> = {
  PUBLISHED: "Publish",
  NOMINATIONS: "Start nominations",
  READY: "Mark ready",
  OPEN: "Open voting",
  CLOSED: "Close voting",
  RESULTS_PUBLISHED: "Publish results",
  ARCHIVED: "Archive",
};

const TRANSITION_HINTS: Record<string, string> = {
  PUBLISHED:
    "Makes the election visible to voters. The API refuses this until it has positions, candidates and rules, and a voting window that closes in the future.",
  NOMINATIONS: "Moves the election into the nominations phase so candidates can be prepared.",
  READY: "Marks nominations complete and the election ready to open.",
  OPEN: "Starts accepting ballots. The API only allows this while the voting window is open.",
  CLOSED: "Stops accepting ballots. Results can only be published after voting is closed.",
  RESULTS_PUBLISHED:
    "Publishes the tally. Anyone who can see the election can see its results afterwards.",
  ARCHIVED:
    "Archives the election and records an archived timestamp. This cannot be undone from this screen.",
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

export default function AdminElectionsPage() {
  return (
    <>
      <PageHeader
        title="Elections"
        description="Inspect every election, review its lifecycle detail, and move it through the legal status transitions."
        breadcrumbs={[
          { label: "Administration", href: "/admin/dashboard" },
          { label: "Elections" },
        ]}
        actions={
          <LinkButton href="/admin/results" variant="outline" className="w-auto">
            View results
          </LinkButton>
        }
      />
      <RequireRole role="admin">
        <ElectionsBody />
      </RequireRole>
    </>
  );
}

function ElectionsBody() {
  const token = useToken();
  const { toast } = useToast();
  const elections = useResource<AdminElection[]>(
    (authToken) => apiRequest<AdminElection[]>(authToken, "/api/admin/elections"),
    [],
  );
  const categories = useResource<CategoryRow[]>(
    (authToken) => apiRequest<CategoryRow[]>(authToken, "/api/categories"),
    [],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<AdminElection | null>(null);
  const [transition, setTransition] = useState<{ election: AdminElection; target: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  const rows = elections.data ?? [];
  const categoryNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const category of categories.data ?? []) map.set(category.id, category.name);
    return map;
  }, [categories.data]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!needle) return true;
      return `${row.title} ${row.slug}`.toLowerCase().includes(needle);
    });
  }, [rows, query, statusFilter]);

  const hasFilters = Boolean(query.trim() || statusFilter);

  function categoryLabel(election: AdminElection): string {
    if (!election.category_id) return "—";
    return categoryNames.get(election.category_id) ?? `#${election.category_id}`;
  }

  function askTransition(election: AdminElection, target: string) {
    setDetail(null);
    setTransition({ election, target });
  }

  async function runTransition() {
    if (!transition) return;
    setPending(true);
    try {
      await apiRequest(token, `/api/admin/elections/${transition.election.id}/transition`, {
        method: "POST",
        body: JSON.stringify({ status: transition.target }),
      });
      toast({
        title: `${transition.election.title} moved to ${transition.target}`,
        tone: "success",
      });
      setTransition(null);
      await elections.reload();
    } catch (cause) {
      toast({
        title: "Status change failed",
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
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (elections.error && !elections.data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={elections.error} onRetry={elections.reload} />
        <EmptyState
          icon={<ListChecks className="h-5 w-5" aria-hidden="true" />}
          title="Elections could not be loaded"
          description="The admin elections endpoint did not respond. Retry, or confirm your session is still valid."
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

  return (
    <div className="mt-6 space-y-4">
      {elections.error ? <ErrorBanner message={elections.error} onRetry={elections.reload} /> : null}

      <Section
        title="All elections"
        description="Status is the lifecycle state used by the transition API, not the schedule-based upcoming/active/ended label."
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
              placeholder="Search title or slug"
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
              icon={<ListChecks className="h-5 w-5" aria-hidden="true" />}
              title="No elections yet"
              description="Create the first election from the elections area, then manage it here."
              action={
                <Button variant="outline" size="dense" className="w-auto" onClick={elections.reload}>
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
                    <TableHead>Category</TableHead>
                    <TableHead>Voting window</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => {
                    const targets = LEGAL_TRANSITIONS[row.status] ?? [];
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="space-y-0.5">
                            <p className="text-[13px] font-semibold text-nv-ink">{row.title}</p>
                            <p className="text-[12px] text-nv-muted">{row.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell className="text-[13px]">{categoryLabel(row)}</TableCell>
                        <TableCell className="nums-tabular whitespace-nowrap text-[12.5px] text-nv-muted">
                          {windowText(row.voting_start_at, row.voting_end_at)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto"
                              onClick={() => setDetail(row)}
                            >
                              Details
                            </Button>
                            {targets.slice(0, 2).map((target) => (
                              <Button
                                key={target}
                                variant={target === "ARCHIVED" ? "subtle" : "primary"}
                                size="dense"
                                className="w-auto"
                                onClick={() => askTransition(row, target)}
                              >
                                {TRANSITION_LABELS[target] ?? target}
                              </Button>
                            ))}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
        title={detail ? detail.title : "Election detail"}
        description={detail ? detail.slug : undefined}
      >
        {detail ? (
          <div className="space-y-5 pb-2">
            <KeyValueList
              items={[
                { label: "Status", value: <StatusBadge status={detail.status} /> },
                { label: "Category", value: categoryLabel(detail) },
                {
                  label: "Organization",
                  value: detail.organization_id ? `#${detail.organization_id}` : "—",
                },
                { label: "Eligibility policy", value: detail.eligibility_policy ?? "—" },
                { label: "Result visibility", value: detail.result_visibility ?? "—" },
                { label: "Secret ballot", value: yesNo(detail.secret_ballot) },
                { label: "Published flag", value: yesNo(detail.is_published) },
                { label: "Admins may vote", value: yesNo(detail.allow_admins_to_vote) },
                { label: "Timezone", value: detail.timezone ?? "—" },
                {
                  label: "Campaign window",
                  value: windowText(detail.campaign_start_at, detail.campaign_end_at),
                },
                {
                  label: "Voting window",
                  value: windowText(detail.voting_start_at, detail.voting_end_at),
                },
                {
                  label: "Registration window",
                  value: windowText(detail.registration_start_at, detail.registration_end_at),
                },
                { label: "Live results allowed", value: yesNo(detail.allow_live_results) },
                {
                  label: "Announce winners automatically",
                  value: yesNo(detail.announce_winners_automatically),
                },
              ]}
            />

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Description
              </p>
              <p className="text-[13.5px] leading-relaxed text-nv-text">
                {detail.description?.trim() || "No description provided."}
              </p>
            </div>

            <div className="flex items-start gap-2 rounded-nv-md border border-nv-line bg-nv-canvas p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-nv-muted" aria-hidden="true" />
              <p className="text-[12.5px] leading-relaxed text-nv-muted">
                This admin endpoint does not return visibility, capacity mode, maximum voters,
                voter ID method, rules text, a share token, result timestamps or the archive
                timestamp, so those settings are not shown here.
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Lifecycle actions
              </p>
              {(LEGAL_TRANSITIONS[detail.status] ?? []).length === 0 ? (
                <p className="text-[13px] text-nv-muted">
                  Archived elections have no further transitions.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(LEGAL_TRANSITIONS[detail.status] ?? []).map((target) => (
                    <Button
                      key={target}
                      variant={target === "ARCHIVED" ? "subtle" : "primary"}
                      size="dense"
                      className="w-auto"
                      onClick={() => askTransition(detail, target)}
                    >
                      {TRANSITION_LABELS[target] ?? target}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="dense" className="w-auto" onClick={() => setDetail(null)}>
              Close
            </Button>
            <LinkButton
              href={`/admin/results?election=${detail?.id ?? ""}`}
              variant="navy"
              className="w-auto"
            >
              View results
            </LinkButton>
          </div>
        }
      </Dialog>

      <AlertDialog
        open={transition !== null}
        onOpenChange={(next) => {
          if (!next) setTransition(null);
        }}
        title={
          transition
            ? `${TRANSITION_LABELS[transition.target] ?? transition.target} “${transition.election.title}”?`
            : "Confirm transition"
        }
        description={transition ? TRANSITION_HINTS[transition.target] : undefined}
        confirmLabel={
          transition ? (TRANSITION_LABELS[transition.target] ?? transition.target) : "Confirm"
        }
        tone={transition?.target === "ARCHIVED" ? "destructive" : "default"}
        loading={pending}
        onConfirm={() => void runTransition()}
      />
    </div>
  );
}

function yesNo(value?: boolean | null): string {
  if (value === undefined || value === null) return "—";
  return value ? "Yes" : "No";
}

function KeyValueList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="min-w-0 space-y-1">
          <dt className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
            {item.label}
          </dt>
          <dd className="break-words text-[13.5px] text-nv-text">{item.value}</dd>
        </div>
      ))}
    </dl>
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
