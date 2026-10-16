"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Info, ListChecks, Plus, RefreshCw, Trash2 } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { Checkbox } from "@/src/components/ui/checkbox";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { Input } from "@/src/components/ui/input";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
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
  /** Cast ballots that would be deleted with the election (list endpoint). */
  vote_count?: number;
};

type CategoryRow = { id: number; name: string };

type OfficerOption = {
  id: number;
  username: string;
  full_name: string;
  role: string;
  is_active: boolean;
  assignments: Array<{
    id: number;
    scope: string;
    is_active: boolean;
    election: { id: number; title: string } | null;
  }>;
};

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
      <PageHero
        eyebrow="Administration"
        title="Elections"
        description="View, edit and delete any election, establish a new one and select the single officer who operates it, and move elections through the legal status transitions."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/admin/results" variant="outline" className="w-auto">
          View results
        </LinkButton>
      </div>
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
  const officers = useResource<OfficerOption[]>(
    (authToken) => apiRequest<OfficerOption[]>(authToken, "/api/admin/officers"),
    [],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<AdminElection | null>(null);
  const [transition, setTransition] = useState<{ election: AdminElection; target: string } | null>(
    null,
  );
  const [pending, setPending] = useState(false);
  const [edit, setEdit] = useState<AdminElection | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPublished, setEditPublished] = useState(false);
  const [editOfficerId, setEditOfficerId] = useState("");
  const [editOriginalOperator, setEditOriginalOperator] = useState<number | null>(null);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Establish (create) dialog state.
  const [establishOpen, setEstablishOpen] = useState(false);
  const [estTitle, setEstTitle] = useState("");
  const [estDescription, setEstDescription] = useState("");
  const [estCampaignStart, setEstCampaignStart] = useState("");
  const [estCampaignEnd, setEstCampaignEnd] = useState("");
  const [estVotingStart, setEstVotingStart] = useState("");
  const [estVotingEnd, setEstVotingEnd] = useState("");
  const [estOfficerId, setEstOfficerId] = useState("");
  const [estError, setEstError] = useState("");
  const [estSaving, setEstSaving] = useState(false);

  // Delete dialog state.
  const [deleting, setDeleting] = useState<AdminElection | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const rows = elections.data ?? [];
  const categoryNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const category of categories.data ?? []) map.set(category.id, category.name);
    return map;
  }, [categories.data]);

  const officerOptions = useMemo(
    () => (officers.data ?? []).filter((row) => row.role === "officer"),
    [officers.data],
  );

  /** The officer currently scoped to `electionId` via an active assignment. */
  function currentOperatorId(electionId: number): number | null {
    for (const officer of officers.data ?? []) {
      for (const assignment of officer.assignments) {
        if (
          assignment.is_active &&
          assignment.scope === "election" &&
          assignment.election?.id === electionId
        ) {
          return officer.id;
        }
      }
    }
    return null;
  }

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

  function openEdit(row: AdminElection) {
    setDetail(null);
    const operator = currentOperatorId(row.id);
    setEdit(row);
    setEditTitle(row.title);
    setEditDescription(row.description ?? "");
    setEditPublished(row.is_published === true);
    setEditOfficerId(operator !== null ? String(operator) : "");
    setEditOriginalOperator(operator);
    setEditError("");
  }

  async function saveEdit() {
    if (!edit) return;
    if (!editTitle.trim()) {
      setEditError("A title is required.");
      return;
    }
    setEditSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: editTitle.trim(),
        description: editDescription,
        is_published: editPublished,
      };
      // Only send the operator when it actually changed: null clears the
      // assignment, an id assigns (or reassigns) the operator.
      const nextOperator = editOfficerId ? Number(editOfficerId) : null;
      if (nextOperator !== editOriginalOperator) body.officer_id = nextOperator;
      await apiRequest(token, `/api/admin/elections/${edit.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast({ title: "Election updated", tone: "success" });
      setEdit(null);
      await elections.reload();
      officers.reload();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      setEditSaving(false);
    }
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

  function openEstablish() {
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = (ms: number) => {
      const d = new Date(ms);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    setEstTitle("");
    setEstDescription("");
    setEstCampaignStart(local(now - 7 * day));
    setEstCampaignEnd(local(now + day));
    setEstVotingStart(local(now + 2 * day));
    setEstVotingEnd(local(now + 9 * day));
    setEstOfficerId("");
    setEstError("");
    setEstablishOpen(true);
  }

  async function submitEstablish() {
    if (!estTitle.trim()) {
      setEstError("A title is required.");
      return;
    }
    const cs = new Date(estCampaignStart);
    const ce = new Date(estCampaignEnd);
    const vs = new Date(estVotingStart);
    const ve = new Date(estVotingEnd);
    if ([cs, ce, vs, ve].some((value) => Number.isNaN(value.getTime()))) {
      setEstError("Set the campaign and voting windows.");
      return;
    }
    if (ce <= cs) {
      setEstError("Campaign end must be after campaign start.");
      return;
    }
    if (ve <= vs) {
      setEstError("Voting end must be after voting start.");
      return;
    }
    if (vs < ce) {
      setEstError("Voting must start after the campaign ends.");
      return;
    }
    setEstSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: estTitle.trim(),
        description: estDescription,
        campaign_start_at: cs.toISOString(),
        campaign_end_at: ce.toISOString(),
        voting_start_at: vs.toISOString(),
        voting_end_at: ve.toISOString(),
      };
      if (estOfficerId) body.officer_id = Number(estOfficerId);
      await apiRequest(token, "/api/admin/elections", {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast({
        title: estOfficerId ? "Election established with its operator" : "Election established",
        tone: "success",
      });
      setEstablishOpen(false);
      await elections.reload();
      officers.reload();
    } catch (cause) {
      setEstError(cause instanceof Error ? cause.message : "The request failed.");
    } finally {
      setEstSaving(false);
    }
  }

  async function runDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await apiRequest(token, `/api/admin/elections/${deleting.id}`, {
        method: "DELETE",
      });
      const removedVotes = deleting.vote_count ?? 0;
      toast({
        title: `“${deleting.title}” deleted`,
        description:
          removedVotes > 0
            ? `${removedVotes} cast ballot${removedVotes === 1 ? "" : "s"} removed with it.`
            : undefined,
        tone: "success",
      });
      setDeleting(null);
      await elections.reload();
    } catch (cause) {
      toast({
        title: "Delete refused",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setDeleteBusy(false);
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
        actions={
          <Button size="dense" className="w-auto" onClick={openEstablish}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Establish election
          </Button>
        }
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
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto"
                              onClick={() => openEdit(row)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto border-nv-danger/40 text-nv-danger hover:bg-nv-danger/10"
                              onClick={() => setDeleting(row)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                              Delete
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
            {detail ? (
              <Button
                variant="outline"
                size="dense"
                className="w-auto"
                onClick={() => openEdit(detail)}
              >
                Edit
              </Button>
            ) : null}
            <LinkButton
              href={`/admin/results?election=${detail?.id ?? ""}`}
              variant="outline"
              className="w-auto"
            >
              View results
            </LinkButton>
          </div>
        }
      </Dialog>

      <Dialog
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open && !editSaving) setEdit(null);
        }}
        title={edit ? `Edit “${edit.title}”` : "Edit election"}
        description="Change the title, description, or published flag. The slug updates automatically when the title changes."
      >
        {edit ? (
          <div className="space-y-4 pb-2">
            {editError ? (
              <div
                role="alert"
                className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 p-3 text-[13px] text-nv-danger"
              >
                {editError}
              </div>
            ) : null}
            <Input
              label="Title"
              value={editTitle}
              onChange={(event) => {
                setEditTitle(event.target.value);
                setEditError("");
              }}
              error={!editTitle.trim() ? "A title is required." : undefined}
            />
            <Textarea
              label="Description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              placeholder="What is this election about?"
            />
            <Checkbox
              label="Published"
              description="Published elections are visible to voters on the public pages."
              checked={editPublished}
              onChange={(event) => setEditPublished(event.target.checked)}
            />
            <Select
              label="Operated by"
              value={editOfficerId}
              onChange={(event) => setEditOfficerId(event.target.value)}
              options={officerOptions.map((row) => ({
                value: String(row.id),
                label: `${row.full_name || row.username} (@${row.username})`,
              }))}
              placeholder="No officer — admin-managed"
              hint="The single officer scoped to this election. Choosing another officer revokes the previous assignment; clearing the field revokes access."
            />
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="dense"
              className="w-auto"
              disabled={editSaving}
              onClick={() => setEdit(null)}
            >
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={editSaving || !editTitle.trim()}
              onClick={() => void saveEdit()}
            >
              {editSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        }
      </Dialog>

      <Dialog
        open={establishOpen}
        onOpenChange={(open) => {
          if (!open && !estSaving) setEstablishOpen(false);
        }}
        title="Establish an election"
        description="Creates the election as a draft and optionally selects the single officer who will operate it."
      >
        <div className="space-y-4 pb-2">
          {estError ? (
            <div
              role="alert"
              className="rounded-lg border border-nv-danger/40 bg-nv-danger/10 p-3 text-[13px] text-nv-danger"
            >
              {estError}
            </div>
          ) : null}
          <Input
            label="Title"
            value={estTitle}
            onChange={(event) => {
              setEstTitle(event.target.value);
              setEstError("");
            }}
            placeholder="e.g. Student Council Election 2027"
          />
          <Textarea
            label="Description"
            value={estDescription}
            onChange={(event) => setEstDescription(event.target.value)}
            placeholder="What is this election about?"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Campaign starts"
              type="datetime-local"
              value={estCampaignStart}
              onChange={(event) => setEstCampaignStart(event.target.value)}
            />
            <Input
              label="Campaign ends"
              type="datetime-local"
              value={estCampaignEnd}
              onChange={(event) => setEstCampaignEnd(event.target.value)}
            />
            <Input
              label="Voting starts"
              type="datetime-local"
              value={estVotingStart}
              onChange={(event) => setEstVotingStart(event.target.value)}
            />
            <Input
              label="Voting ends"
              type="datetime-local"
              value={estVotingEnd}
              onChange={(event) => setEstVotingEnd(event.target.value)}
            />
          </div>
          <Select
            label="Operated by (optional)"
            value={estOfficerId}
            onChange={(event) => setEstOfficerId(event.target.value)}
            options={officerOptions
              .filter(
                (row) => !row.assignments.some((a) => a.is_active && a.scope === "election"),
              )
              .map((row) => ({
                value: String(row.id),
                label: `${row.full_name || row.username} (@${row.username})`,
              }))}
            placeholder="None — assign later from Edit"
            hint="An officer operates only one election, so officers already operating another election are hidden here."
          />
        </div>
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="dense"
              className="w-auto"
              disabled={estSaving}
              onClick={() => setEstablishOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={estSaving || !estTitle.trim()}
              onClick={() => void submitEstablish()}
            >
              {estSaving ? "Establishing…" : "Establish election"}
            </Button>
          </div>
        }
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleting(null);
        }}
        title={deleting ? `Delete “${deleting.title}” permanently?` : "Confirm deletion"}
        description={
          deleting && (deleting.vote_count ?? 0) > 0
            ? `This permanently removes the election together with its positions, candidates, announcements and ${deleting.vote_count} cast ballot${deleting.vote_count === 1 ? "" : "s"}. Deleted ballots cannot be recovered — archive it instead if the record must survive.`
            : "This removes the election together with its positions, candidates and announcements. This cannot be undone."
        }
        confirmLabel="Delete election"
        cancelLabel="Keep it"
        tone="destructive"
        loading={deleteBusy}
        onConfirm={() => void runDelete()}
      />

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
