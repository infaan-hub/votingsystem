"use client";

import { useMemo, useState } from "react";
import { Inbox, RefreshCw } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { LinkButton, PageHeader } from "@/src/components/ui/page-header";
import { Section } from "@/src/components/ui/section";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { useToast } from "@/src/components/ui/toast";
import { ageLabel, apiRequest, displayDate, useResource, useToken } from "../_shared";

type Requester = { id: number; username: string; full_name: string; email: string } | null;

type RequestRow = {
  id: number;
  title: string;
  status: string;
  category_name?: string | null;
  category?: { id: number; name: string; slug: string } | null;
  organization?: string | null;
  description?: string | null;
  purpose?: string | null;
  reason?: string | null;
  positions_text?: string | null;
  contact_info?: string | null;
  start_at: string | null;
  end_at: string | null;
  expected_voters?: number | null;
  decision_note?: string | null;
  assigned_officer?: { id: number; username: string; full_name: string } | null;
  election_id?: number | null;
  requester: Requester;
  created_at: string | null;
  updated_at?: string | null;
};

type Officer = {
  id: number;
  username: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

type ApproveResult = {
  request: RequestRow;
  election: { id: number; title: string; slug: string } | null;
};

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pending" },
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
  { value: "CHANGES_REQUESTED", label: "Changes requested" },
  { value: "CANCELLED", label: "Cancelled" },
];

const REQUEST_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CHANGES_REQUESTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CHANGES_REQUESTED"],
  CHANGES_REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  APPROVED: [],
  REJECTED: [],
  CANCELLED: [],
};

const ACTION_LABEL: Record<string, string> = {
  UNDER_REVIEW: "Mark under review",
  CHANGES_REQUESTED: "Request changes",
  REJECTED: "Reject",
  APPROVED: "Approve",
};

const REASON_NEEDED = new Set(["REJECTED", "CHANGES_REQUESTED"]);

export default function ElectionRequestsPage() {
  return (
    <>
      <PageHeader
        title="Election requests"
        description="Review requests for new elections, optionally assign an officer, and approve, reject or send each one back for changes."
        breadcrumbs={[
          { label: "Administration", href: "/admin/dashboard" },
          { label: "Election requests" },
        ]}
      />
      <RequireRole role="admin">
        <RequestsBody />
      </RequireRole>
    </>
  );
}

function RequestsBody() {
  const token = useToken();
  const { toast } = useToast();
  const requestsResource = useResource<RequestRow[]>(
    (authToken) => apiRequest<RequestRow[]>(authToken, "/api/admin/election-requests"),
    [],
  );
  const officersResource = useResource<Officer[]>(
    (authToken) => apiRequest<Officer[]>(authToken, "/api/admin/officers"),
    [],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [officerId, setOfficerId] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [confirm, setConfirm] = useState<{ action: string; id: number } | null>(null);
  const [approvedElection, setApprovedElection] = useState<{
    id: number;
    title: string;
    slug: string;
  } | null>(null);

  const requests = requestsResource.data ?? [];
  const officers = officersResource.data ?? [];
  const active = requests.find((request) => request.id === activeId) ?? null;
  const availableActions = active ? (REQUEST_TRANSITIONS[active.status] ?? []) : [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((request) => {
      if (statusFilter && request.status !== statusFilter) return false;
      if (!needle) return true;
      const haystack = [
        request.title,
        request.requester?.full_name ?? "",
        request.requester?.username ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [requests, query, statusFilter]);

  const hasFilters = Boolean(query.trim() || statusFilter);

  function openDetail(request: RequestRow) {
    setActiveId(request.id);
    setDecisionNote(request.decision_note ?? "");
    setNoteError("");
    setActionError("");
    setOfficerId(request.assigned_officer ? String(request.assigned_officer.id) : "");
    setApprovedElection(null);
  }

  function closeDetail() {
    setActiveId(null);
    setConfirm(null);
  }

  function requestAction(action: string) {
    if (!active) return;
    if (REASON_NEEDED.has(action) && !decisionNote.trim()) {
      setNoteError("Explain the decision so the requester knows what to do next.");
      return;
    }
    setNoteError("");
    if (action === "APPROVED" || action === "REJECTED") {
      setConfirm({ action, id: active.id });
      return;
    }
    void runDecision(active.id, action);
  }

  async function runDecision(id: number, status: string) {
    setActionLoading(true);
    setActionError("");
    try {
      const body: Record<string, unknown> = { status };
      const note = decisionNote.trim();
      if (note) body.decision_note = note;
      if (status === "APPROVED" && officerId) body.assigned_officer_id = Number(officerId);
      const result = await apiRequest<ApproveResult>(token, `/api/admin/election-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast({ title: ACTION_LABEL[status] ?? "Request updated", tone: "success" });
      if (status === "APPROVED" && result.election) setApprovedElection(result.election);
      setConfirm(null);
      await requestsResource.reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The decision could not be saved.";
      setActionError(message);
      toast({ title: "Decision failed", description: message, tone: "error" });
    } finally {
      setActionLoading(false);
    }
  }

  if (requestsResource.loading && !requestsResource.data) {
    return (
      <div className="mt-6 space-y-3">
        <Skeleton className="h-11 w-full max-w-md" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (requestsResource.error && !requestsResource.data) {
    return (
      <div className="mt-6 space-y-4">
        <ErrorBanner message={requestsResource.error} onRetry={requestsResource.reload} />
        <EmptyState
          icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
          title="Requests could not be loaded"
          description="The admin API did not return the request queue. Retry, or check that your session is still valid."
          action={
            <Button size="dense" className="w-auto" onClick={requestsResource.reload}>
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
      {requestsResource.error ? (
        <ErrorBanner message={requestsResource.error} onRetry={requestsResource.reload} />
      ) : null}

      <Section
        title="Request queue"
        description="Search by title or requester, then open a request to read the full submission and decide."
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
              placeholder="Search title or requester"
              label="Search requests"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              label="Filter by status"
              placeholder="All statuses"
            />
          </FiltersToolbar>

          {requests.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-5 w-5" aria-hidden="true" />}
              title="No election requests yet"
              description="When students and staff submit an election request it lands here for review. Approving one creates a draft election you can finish in the elections screen."
              action={
                <LinkButton href="/admin/elections" variant="outline" className="w-auto">
                  Go to elections
                </LinkButton>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No requests match your filters"
              description="Nothing in the queue matches the current search and status filter."
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
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Requester</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Expected voters</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell className="nums-tabular text-[13px]">#{request.id}</TableCell>
                      <TableCell className="min-w-[14rem]">
                        <span className="block text-[13.5px] font-semibold text-nv-ink">
                          {request.title}
                        </span>
                        <span className="block text-[12px] text-nv-muted">
                          {request.category?.name || request.category_name || "No category"}
                          {request.organization ? ` · ${request.organization}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-[12rem]">
                        <span className="block text-[13px] text-nv-text">
                          {request.requester?.full_name || request.requester?.username || "Unknown"}
                        </span>
                        <span className="block text-[12px] text-nv-muted">
                          {request.requester?.email || "No email"}
                        </span>
                      </TableCell>
                      <TableCell className="nums-tabular whitespace-nowrap text-[12.5px]">
                        {displayDate(request.start_at)}
                        <span className="text-nv-muted"> → </span>
                        {displayDate(request.end_at)}
                      </TableCell>
                      <TableCell className="nums-tabular text-[13px]">
                        {request.expected_voters ?? 0}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="dense"
                          className="w-auto"
                          onClick={() => openDetail(request)}
                        >
                          Open
                        </Button>
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
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) closeDetail();
        }}
        title={active ? `Request #${active.id}` : "Request"}
        description={active?.title}
      >
        {active ? (
          <div className="space-y-4 pb-2">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={active.status} />
              <span className="text-[12.5px] text-nv-muted">
                Submitted {ageLabel(active.created_at)} · {displayDate(active.created_at)}
              </span>
            </div>

            <KeyValueBlocks request={active} />

            {active.status === "APPROVED" && active.election_id ? (
              <div className="rounded-nv-md border border-nv-line bg-nv-bg p-3">
                <p className="text-[13px] text-nv-text">
                  A draft election (#{active.election_id}) was created from this request.
                </p>
                <LinkButton href="/admin/elections" variant="outline" className="mt-2 w-auto h-11">
                  Open elections
                </LinkButton>
              </div>
            ) : null}

            {approvedElection ? (
              <div className="rounded-nv-md border border-nv-success/40 bg-nv-success/10 p-3">
                <p className="text-[13px] font-semibold text-nv-success">
                  Approved: draft election “{approvedElection.title}” (#{approvedElection.id}) created.
                </p>
                <LinkButton href="/admin/elections" variant="outline" className="mt-2 w-auto h-11">
                  Go to elections
                </LinkButton>
              </div>
            ) : null}

            {availableActions.length ? (
              <div className="space-y-3 border-t border-nv-line pt-4">
                <Textarea
                  label="Decision note"
                  value={decisionNote}
                  onChange={(event) => {
                    setDecisionNote(event.target.value);
                    if (noteError) setNoteError("");
                  }}
                  error={noteError}
                  invalid={Boolean(noteError)}
                  hint="Required when requesting changes or rejecting. Optional otherwise."
                  placeholder="Explain what the requester should do next."
                />
                {availableActions.includes("APPROVED") ? (
                  <Select
                    label="Assign officer (optional)"
                    value={officerId}
                    onChange={(event) => setOfficerId(event.target.value)}
                    options={officers
                      .filter((officer) => officer.is_active !== false)
                      .map((officer) => ({
                        value: String(officer.id),
                        label: `${officer.full_name || officer.username} (@${officer.username})`,
                      }))}
                    placeholder="No officer assigned"
                    hint="Approving with an officer selected also creates an election-scoped assignment."
                  />
                ) : null}
              </div>
            ) : (
              <p className="rounded-nv-md border border-nv-line bg-nv-bg p-3 text-[13px] text-nv-muted">
                This request is closed ({active.status}); no further decisions are possible.
              </p>
            )}

            {actionError ? (
              <p role="alert" className="text-[12.5px] font-medium text-nv-danger">
                {actionError}
              </p>
            ) : null}
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="dense" className="w-auto" onClick={closeDetail}>
              Close
            </Button>
            {availableActions.map((action) => (
              <Button
                key={action}
                variant={
                  action === "APPROVED"
                    ? "primary"
                    : action === "REJECTED"
                      ? "destructive"
                      : "outline"
                }
                size="dense"
                className="w-auto"
                disabled={actionLoading}
                onClick={() => requestAction(action)}
              >
                {ACTION_LABEL[action]}
              </Button>
            ))}
          </div>
        }
      </Dialog>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
        title={confirm?.action === "APPROVED" ? "Approve this request?" : "Reject this request?"}
        description={
          confirm?.action === "APPROVED"
            ? "Approving creates a draft election pre-filled from this request. You can still edit it before publishing."
            : "Rejecting closes the request. The requester sees your decision note and cannot reopen it."
        }
        confirmLabel={confirm?.action === "APPROVED" ? "Approve request" : "Reject request"}
        tone={confirm?.action === "REJECTED" ? "destructive" : "default"}
        loading={actionLoading}
        onConfirm={() => {
          if (confirm) void runDecision(confirm.id, confirm.action);
        }}
      />
    </div>
  );
}

function KeyValueBlocks({ request }: { request: RequestRow }) {
  const blocks: Array<{ label: string; value: string | null | undefined }> = [
    { label: "Description", value: request.description },
    { label: "Purpose", value: request.purpose },
    { label: "Reason", value: request.reason },
    { label: "Proposed positions", value: request.positions_text },
    { label: "Contact info", value: request.contact_info },
    { label: "Decision note", value: request.decision_note },
  ];
  return (
    <div className="space-y-3">
      {blocks.map((block) => (
        <div key={block.label}>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
            {block.label}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13.5px] leading-relaxed text-nv-text">
            {block.value?.trim() ? block.value : "Not provided."}
          </p>
        </div>
      ))}
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
