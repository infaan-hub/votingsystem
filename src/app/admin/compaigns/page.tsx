"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Megaphone, RefreshCw, Trash2 } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, FiltersToolbar, SearchInput } from "@/src/components/ui/filters";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
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

type CampaignRow = {
  id: number;
  topic: string;
  description?: string | null;
  status: string;
  start_at?: string | null;
  end_at?: string | null;
  image_url?: string | null;
  video_url?: string | null;
  video_duration_seconds?: number | null;
  election: { id: number; slug: string; title: string; status: string };
  candidate: {
    id: number;
    slogan?: string | null;
    photo_url?: string | null;
    party: { id: number; name: string; slug: string; color: string; code: string } | null;
    user: { username: string; full_name: string };
  };
  moderation_note?: string | null;
  moderated_at?: string | null;
  owner: { id: number; username: string; full_name: string } | null;
};

type NextStatus = "PUBLISHED" | "HIDDEN" | "REJECTED";

const STATUS_OPTIONS = [
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
  { value: "PUBLISHED", label: "Published" },
  { value: "HIDDEN", label: "Hidden" },
  { value: "REJECTED", label: "Rejected" },
];

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline" | "success" | "muted"> = {
  DRAFT: "muted",
  PENDING: "secondary",
  PUBLISHED: "success",
  HIDDEN: "outline",
  REJECTED: "destructive",
};

const ACTIONS: { value: NextStatus; label: string; hint: string; noteRequired: boolean }[] = [
  {
    value: "PUBLISHED",
    label: "Publish",
    hint: "Makes the campaign visible to voters on the public campaign pages.",
    noteRequired: false,
  },
  {
    value: "HIDDEN",
    label: "Hide",
    hint: "Removes the campaign from public views. The API requires a moderation note.",
    noteRequired: true,
  },
  {
    value: "REJECTED",
    label: "Reject",
    hint: "Marks the campaign as rejected. The API requires a moderation note.",
    noteRequired: true,
  },
];

export default function AdminCampaignsPage() {
  return (
    <>
      <PageHero
        eyebrow="Administration"
        title="Campaigns"
        description="Moderate candidate campaign posts: publish the ones that follow the rules, hide or reject the rest with a note for the record."
        actions={
          <LinkButton href="/compaigns" variant="heroGhost" className="w-auto">
            Public view
          </LinkButton>
        }
      />
      <RequireRole role="admin">
        <CampaignsBody />
      </RequireRole>
    </>
  );
}

function CampaignsBody() {
  const token = useToken();
  const { toast } = useToast();
  const { data, error, loading, reload } = useResource<CampaignRow[]>(
    (authToken) => apiRequest<CampaignRow[]>(authToken, "/api/admin/campaigns"),
    [],
  );

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState<CampaignRow | null>(null);
  const [moderation, setModeration] = useState<CampaignRow | null>(null);
  const [nextStatus, setNextStatus] = useState<NextStatus>("PUBLISHED");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CampaignRow | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const campaigns = data ?? [];

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return campaigns.filter((row) => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (!needle) return true;
      return `${row.topic} ${row.candidate.user.full_name} ${row.candidate.user.username} ${row.election.title}`
        .toLowerCase()
        .includes(needle);
    });
  }, [campaigns, query, statusFilter]);

  const hasFilters = Boolean(query.trim() || statusFilter);
  const activeAction = ACTIONS.find((action) => action.value === nextStatus) ?? ACTIONS[0];

  function openModeration(row: CampaignRow) {
    setModeration(row);
    setNextStatus("PUBLISHED");
    setNote(row.moderation_note ?? "");
    setNoteError("");
  }

  async function submitModeration() {
    if (!moderation) return;
    if (activeAction.noteRequired && !note.trim()) {
      setNoteError("A moderation note is required when hiding or rejecting a campaign.");
      return;
    }
    setPending(true);
    try {
      await apiRequest(token, `/api/admin/campaigns/${moderation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, moderation_note: note.trim() || undefined }),
      });
      toast({ title: `Campaign marked ${nextStatus}`, tone: "success" });
      setModeration(null);
      await reload();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : undefined;
      if (message && message.toLowerCase().includes("moderation_note")) setNoteError(message);
      toast({
        title: "Moderation failed",
        description: message,
        tone: "error",
      });
    } finally {
      setPending(false);
    }
  }

  async function deleteCampaign() {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    try {
      await apiRequest(token, `/api/admin/campaigns/${deleteTarget.id}`, {
        method: "DELETE",
      });
      toast({
        title: "Campaign deleted",
        description: `"${deleteTarget.topic}" was permanently removed.`,
        tone: "success",
      });
      setDeleteTarget(null);
      setDetail(null);
      await reload();
    } catch (cause) {
      toast({
        title: "Delete failed",
        description: cause instanceof Error ? cause.message : undefined,
        tone: "error",
      });
    } finally {
      setDeleteSaving(false);
    }
  }

  if (loading && !data) {
    return (
      <div className="mt-6 space-y-3">
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
          icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
          title="Campaigns could not be loaded"
          description="The admin campaigns endpoint did not respond. Retry, or confirm your session is still valid."
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

      <Section
        title="All campaigns"
        description="Hiding or rejecting a campaign requires a moderation note; the API rejects the change without one."
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
              placeholder="Search topic, candidate or election"
              label="Search campaigns"
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_OPTIONS}
              label="Filter by status"
              placeholder="All statuses"
            />
          </FiltersToolbar>

          {campaigns.length === 0 ? (
            <EmptyState
              icon={<Megaphone className="h-5 w-5" aria-hidden="true" />}
              title="No campaigns yet"
              description="Campaigns appear here once candidates submit them for an election."
              action={
                <Button variant="outline" size="dense" className="w-auto" onClick={reload}>
                  Refresh
                </Button>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No campaigns match your filters"
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
                    <TableHead>Campaign</TableHead>
                    <TableHead>Candidate</TableHead>
                    <TableHead>Election</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className="text-[13px] font-semibold text-nv-ink">{row.topic}</p>
                          <p className="text-[12px] text-nv-muted">
                            {row.candidate.user.username}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-[13px]">
                        {row.candidate.user.full_name}
                        {row.candidate.party ? (
                          <span className="ml-1.5 text-[12px] text-nv-muted">
                            {row.candidate.party.code}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-[13px]">{row.election.title}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[row.status] ?? "muted"}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="nums-tabular whitespace-nowrap text-[12.5px] text-nv-muted">
                        {windowText(row.start_at, row.end_at)}
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
                          <Button size="dense" className="w-auto" onClick={() => openModeration(row)}>
                            Moderate
                          </Button>
                          <Button
                            variant="outline"
                            size="dense"
                            className="w-auto border-nv-danger/40 text-nv-danger hover:bg-nv-danger/10"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                            Delete
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
        title={detail ? detail.topic : "Campaign detail"}
        description={detail ? detail.candidate.user.full_name : undefined}
      >
        {detail ? (
          <div className="space-y-5 pb-2">
            <KeyValueList
              items={[
                {
                  label: "Status",
                  value: <Badge variant={STATUS_VARIANTS[detail.status] ?? "muted"}>{detail.status}</Badge>,
                },
                { label: "Election", value: detail.election.title },
                { label: "Election status", value: detail.election.status },
                { label: "Party", value: detail.candidate.party?.name ?? "—" },
                { label: "Owner", value: detail.owner?.full_name ?? "—" },
                { label: "Window", value: windowText(detail.start_at, detail.end_at) },
                { label: "Video", value: detail.video_url ? "Attached" : "—" },
                { label: "Moderated at", value: detail.moderated_at ?? "Not moderated yet" },
              ]}
            />

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Slogan
              </p>
              <p className="text-[13.5px] text-nv-text">{detail.candidate.slogan || "—"}</p>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Description
              </p>
              <p className="text-[13.5px] leading-relaxed text-nv-text">
                {detail.description?.trim() || "No description provided."}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Moderation note
              </p>
              <p className="text-[13.5px] leading-relaxed text-nv-text">
                {detail.moderation_note?.trim() || "No moderation note on record."}
              </p>
            </div>
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button variant="outline" size="dense" className="w-auto" onClick={() => setDetail(null)}>
              Close
            </Button>
            <Button
              size="dense"
              className="w-auto"
              onClick={() => {
                if (detail) openModeration(detail);
              }}
            >
              Moderate
            </Button>
          </div>
        }
      </Dialog>

      <Dialog
        open={moderation !== null}
        onOpenChange={(open) => {
          if (!open) setModeration(null);
        }}
        title={moderation ? `Moderate “${moderation.topic}”` : "Moderate campaign"}
        description="Publishing is immediate. Hiding or rejecting stores your note on the record."
      >
        {moderation ? (
          <div className="space-y-5 pb-2">
            <div className="space-y-2">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-nv-muted">
                Decision
              </p>
              <div className="flex flex-wrap gap-2">
                {ACTIONS.map((action) => (
                  <Button
                    key={action.value}
                    variant={nextStatus === action.value ? "primary" : "outline"}
                    size="dense"
                    className="w-auto"
                    aria-pressed={nextStatus === action.value}
                    onClick={() => {
                      setNextStatus(action.value);
                      setNoteError("");
                    }}
                  >
                    {action.label}
                  </Button>
                ))}
              </div>
              <p className="text-[12.5px] text-nv-muted">{activeAction.hint}</p>
            </div>

            <Textarea
              label="Moderation note"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError("");
              }}
              placeholder="Explain the decision for the audit trail"
              error={noteError || undefined}
              hint={
                activeAction.noteRequired
                  ? undefined
                  : "Optional when publishing. It replaces any previous note."
              }
              required={activeAction.noteRequired}
            />
          </div>
        ) : null}
        footer={
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            <Button
              variant="outline"
              size="dense"
              className="w-auto"
              disabled={pending}
              onClick={() => setModeration(null)}
            >
              Cancel
            </Button>
            <Button
              size="dense"
              className="w-auto"
              disabled={pending}
              onClick={() => void submitModeration()}
            >
              {pending ? "Saving…" : activeAction.label}
            </Button>
          </div>
        }
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleteSaving) setDeleteTarget(null);
        }}
        title="Delete this campaign permanently?"
        description={
          deleteTarget
            ? `"${deleteTarget.topic}" by ${deleteTarget.candidate.user.full_name} will be removed for good, including its images and video.`
            : undefined
        }
        confirmLabel="Delete campaign"
        cancelLabel="Keep campaign"
        tone="destructive"
        loading={deleteSaving}
        onConfirm={() => void deleteCampaign()}
      />
    </div>
  );
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
