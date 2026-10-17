"use client";

import { Suspense, useEffect, useState } from "react";
import { ClipboardList, ExternalLink, Pencil, RefreshCw, Trash2, Vote } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Select } from "@/src/components/ui/select";
import { Section, KeyValueList } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { Tooltip } from "@/src/components/ui/tooltip";
import { useToast } from "@/src/components/ui/toast";
import {
  ElectionPickerSection,
  ErrorBanner,
  FormAlert,
  ListSkeleton,
  NoElectionsState,
  PickElectionAction,
  apiFetch,
  displayValue,
  firstError,
  humanize,
  splitError,
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
      <PageHero
        eyebrow="Officer dashboard"
        title="Run my election"
        description="Overview, lifecycle, ballot and share link for one of the elections you administer."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <LinkButton href="/officer/election/new" className="w-auto">
          Add election
        </LinkButton>
        <LinkButton href="/officer/dashboard" variant="outline" className="w-auto">
          All elections
        </LinkButton>
      </div>
      <RequireRole role="officer">
        <Suspense fallback={<div className="mt-6"><ListSkeleton /></div>}>
          <ElectionBody />
        </Suspense>
      </RequireRole>
    </>
  );
}

/** Statuses officers may still edit or delete from this screen. */
const EDITABLE_STATUSES = new Set(["DRAFT", "PUBLISHED", "NOMINATIONS", "READY"]);
const DELETABLE_STATUSES = new Set(["DRAFT", "PUBLISHED", "NOMINATIONS", "READY", "ARCHIVED"]);

/**
 * Elections are born OPEN (officers publish directly, no admin approval), so
 * an OPEN election with no ballots yet keeps the same edit/delete grace as a
 * pre-open one — mirrors the server-side guards.
 */
function isOpenEditable(row: { status: string; counts: { votes: number } }): boolean {
  return row.status === "OPEN" && row.counts.votes === 0;
}

function splitDateTimeParts(
  value: string | null | undefined,
): { date: string; time: string } {
  if (!value) return { date: "", time: "" };
  return { date: value.slice(0, 10), time: value.slice(11, 16) || "09:00" };
}

function ElectionBody() {
  const { selected: selectedId, select } = useElectionSelection();
  const list = useResource<ManagedElection[]>(
    (token) => apiFetch<ManagedElection[]>(token, "/api/officer/elections"),
    [],
  );

  const rows = list.data ?? [];
  const selected = rows.find((row) => String(row.id) === selectedId) ?? null;

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

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
        {selected ? (
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={selected.status} />
            {EDITABLE_STATUSES.has(selected.status) || isOpenEditable(selected) ? (
              <Button
                variant="outline"
                size="dense"
                className="w-auto"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
            ) : null}
            {DELETABLE_STATUSES.has(selected.status) || isOpenEditable(selected) ? (
              <Button
                variant="outline"
                size="dense"
                className="w-auto text-nv-danger hover:bg-nv-danger/10"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </ElectionPickerSection>

      {selected ? (
        <>
          <OverviewSection row={selected} overview={overview} />
          <LifecycleSection status={selected.status} />
          <BallotSection row={selected} ballot={ballot} />
          <ShareLinkSection row={selected} />
          {editOpen ? (
            <EditElectionDialog
              row={selected}
              onClose={() => setEditOpen(false)}
              onSaved={() => {
                setEditOpen(false);
                list.reload();
                overview.reload();
              }}
            />
          ) : null}
          {deleteOpen ? (
            <DeleteElectionDialog
              row={selected}
              onClose={() => setDeleteOpen(false)}
              onDeleted={() => {
                setDeleteOpen(false);
                select("");
                list.reload();
              }}
            />
          ) : null}
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
              { label: "Category", value: row.category?.name ?? "No category" },
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

type AdminElectionDetail = {
  id: number;
  title: string;
  description: string;
  rules_text: string;
  voter_id_method: string;
  voter_id_label: string;
  capacity_mode: string;
  max_voters: number | null;
  timezone: string | null;
  category_id: number | null;
  voting_start_at: string | null;
  voting_end_at: string | null;
};

type DetailPayload = { election: AdminElectionDetail };

type CategoryRow = { id: number; name: string };

function EditElectionDialog({
  row,
  onClose,
  onSaved,
}: {
  row: ManagedElection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { token } = useApp();
  const { toast } = useToast();
  const detail = useResource<DetailPayload>(
    (authToken) => apiFetch<DetailPayload>(authToken, `/api/officer/elections/${row.id}`),
    [row.id],
  );
  // Same public list the Add-election page uses, so a category can be changed
  // after the fact without leaving this screen.
  const categories = useResource<CategoryRow[]>(
    (authToken) => apiFetch<CategoryRow[]>(authToken, "/api/categories"),
    [],
  );

  const [title, setTitle] = useState(row.title);
  const [description, setDescription] = useState("");
  const [rules, setRules] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("17:00");
  const [voterIdMethod, setVoterIdMethod] = useState("account");
  const [voterIdLabel, setVoterIdLabel] = useState("");
  const [capacityMode, setCapacityMode] = useState<"open" | "restricted">("restricted");
  const [maxVoters, setMaxVoters] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!detail.data || hydrated) return;
    const election = detail.data.election;
    const start = splitDateTimeParts(election.voting_start_at ?? row.voting_start_at);
    const end = splitDateTimeParts(election.voting_end_at ?? row.voting_end_at);
    setTitle(election.title);
    setDescription(election.description ?? "");
    setRules(election.rules_text ?? "");
    setStartDate(start.date);
    setStartTime(start.time);
    setEndDate(end.date);
    setEndTime(end.time);
    setVoterIdMethod(election.voter_id_method || "account");
    setVoterIdLabel(election.voter_id_label ?? "");
    setCapacityMode(election.capacity_mode === "open" ? "open" : "restricted");
    setMaxVoters(election.max_voters != null ? String(election.max_voters) : "");
    setCategoryId(election.category_id != null ? String(election.category_id) : "");
    setHydrated(true);
  }, [detail.data, hydrated, row.voting_start_at, row.voting_end_at]);

  async function save(): Promise<void> {
    if (saving) return;
    const errors: Record<string, string[]> = {};
    if (!title.trim()) errors.title = ["Title is required."];
    if (!startDate || !startTime || !endDate || !endTime) {
      errors.voting_start_at = ["Start and end date with time are required."];
    } else {
      const vs = new Date(`${startDate}T${startTime}`);
      const ve = new Date(`${endDate}T${endTime}`);
      if (Number.isNaN(vs.getTime()) || Number.isNaN(ve.getTime())) {
        errors.voting_end_at = ["Enter a valid date and time."];
      } else if (ve <= vs) {
        errors.voting_end_at = ["End must be after start."];
      }
    }
    if (voterIdMethod === "custom" && !voterIdLabel.trim()) {
      errors.voter_id_label = ["A label is required for a custom identifier."];
    }
    if (capacityMode === "restricted" && maxVoters.trim()) {
      const cap = Number(maxVoters);
      if (!Number.isInteger(cap) || cap < 1) {
        errors.max_voters = ["Maximum voters must be a whole number of at least 1."];
      }
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormErrors(["Please fix the highlighted fields below."]);
      return;
    }

    setSaving(true);
    setFormErrors([]);
    try {
      await apiFetch(token, `/api/officer/elections/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          voting_start_at: new Date(`${startDate}T${startTime}`).toISOString(),
          voting_end_at: new Date(`${endDate}T${endTime}`).toISOString(),
          rules_text: rules.trim(),
          voter_id_method: voterIdMethod,
          voter_id_label: voterIdMethod === "custom" ? voterIdLabel.trim() : "",
          capacity_mode: capacityMode,
          max_voters:
            capacityMode === "restricted" && maxVoters.trim() ? Number(maxVoters) : null,
          category_id: categoryId ? Number(categoryId) : null,
        }),
      });
      toast({ title: "Election updated", tone: "success" });
      onSaved();
    } catch (error) {
      const split = splitError(error);
      setFormErrors(split.form.length ? split.form : [split.message]);
      setFieldErrors(split.fields);
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(): Promise<void> {
    if (!imageFile || uploadingImage) return;
    setUploadingImage(true);
    try {
      const form = new FormData();
      form.append("image", imageFile);
      await apiFetch(token, `/api/officer/elections/${row.id}/image`, {
        method: "POST",
        body: form,
      });
      toast({ title: "Election image uploaded", tone: "success" });
      setImageFile(null);
      onSaved();
    } catch (error) {
      const split = splitError(error);
      toast({ title: split.message || "Could not upload image", tone: "warning" });
    } finally {
      setUploadingImage(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Edit election"
      description="Change the title, category, voting window, rules and voter settings for this election."
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving} className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving || (detail.loading && !hydrated)} className="sm:w-auto">
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </>
      }
    >
      <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
        <FormAlert messages={formErrors} />
        {detail.loading && !hydrated ? <Skeleton className="h-64 w-full" /> : null}
        {detail.error && !hydrated ? <ErrorBanner message={detail.error} onRetry={detail.reload} /> : null}
        {hydrated ? (
          <>
            <Input
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              invalid={Boolean(firstError(fieldErrors, "title"))}
              error={firstError(fieldErrors, "title")}
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={2000}
              invalid={Boolean(firstError(fieldErrors, "description"))}
              error={firstError(fieldErrors, "description")}
            />
            <div className="space-y-2">
              <label className="text-sm font-medium text-nv-ink">Election image</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setImageFile(event.target.files?.[0] ?? null)}
                className="block w-full text-sm text-nv-muted"
              />
              <Button
                variant="outline"
                onClick={() => void uploadImage()}
                disabled={!imageFile || uploadingImage}
                className="w-auto"
              >
                {uploadingImage ? "Uploading…" : "Upload image"}
              </Button>
            </div>
            <Select
              label="Category"
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              options={(categories.data ?? []).map((category) => ({
                value: String(category.id),
                label: category.name,
              }))}
              placeholder={categories.data === null ? "Loading categories…" : "No category"}
              disabled={categories.data === null}
              hint="Shown on the home Explore tiles and under its category page."
              invalid={Boolean(firstError(fieldErrors, "category_id"))}
              error={firstError(fieldErrors, "category_id")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Starts (date)"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                required
                invalid={Boolean(firstError(fieldErrors, "voting_start_at"))}
                error={firstError(fieldErrors, "voting_start_at")}
              />
              <Input
                label="Starts (time)"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                required
              />
              <Input
                label="Ends (date)"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                required
                invalid={Boolean(firstError(fieldErrors, "voting_end_at"))}
                error={firstError(fieldErrors, "voting_end_at")}
              />
              <Input
                label="Ends (time)"
                type="time"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                required
              />
            </div>
            <Textarea
              label="Who may vote"
              value={rules}
              onChange={(event) => setRules(event.target.value)}
              maxLength={4000}
            />
            <Select
              label="Voters identify with"
              value={voterIdMethod}
              onChange={(event) => setVoterIdMethod(event.target.value)}
              options={[
                { value: "account", label: "Platform account" },
                { value: "email", label: "Email address" },
                { value: "phone", label: "Phone number" },
                { value: "membership", label: "Membership number" },
                { value: "employee", label: "Employee ID" },
                { value: "student_id", label: "Student ID" },
                { value: "custom", label: "Custom identifier" },
              ]}
            />
            {voterIdMethod === "custom" ? (
              <Input
                label="Custom identifier label"
                value={voterIdLabel}
                onChange={(event) => setVoterIdLabel(event.target.value)}
                maxLength={120}
                required
                invalid={Boolean(firstError(fieldErrors, "voter_id_label"))}
                error={firstError(fieldErrors, "voter_id_label")}
              />
            ) : null}
            <Select
              label="Capacity"
              value={capacityMode}
              onChange={(event) =>
                setCapacityMode(event.target.value === "open" ? "open" : "restricted")
              }
              options={[
                { value: "restricted", label: "Limited — capped voter list" },
                { value: "open", label: "Unlimited · public" },
              ]}
            />
            {capacityMode === "restricted" ? (
              <Input
                label="Maximum voters (optional)"
                type="number"
                min={1}
                inputMode="numeric"
                value={maxVoters}
                onChange={(event) => setMaxVoters(event.target.value)}
                placeholder="Leave empty for no fixed cap"
                invalid={Boolean(firstError(fieldErrors, "max_voters"))}
                error={firstError(fieldErrors, "max_voters")}
              />
            ) : null}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

function DeleteElectionDialog({
  row,
  onClose,
  onDeleted,
}: {
  row: ManagedElection;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { token } = useApp();
  const { toast } = useToast();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function confirm(): Promise<void> {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      await apiFetch(token, `/api/officer/elections/${row.id}`, { method: "DELETE" });
      toast({ title: `"${row.title}" deleted`, tone: "success" });
      onDeleted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The election could not be deleted.");
      setPending(false);
    }
  }

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title={`Delete "${row.title}"?`}
      description="This removes the election, its ballot, candidates and campaigns. It cannot be undone."
      confirmLabel={pending ? "Deleting…" : "Delete election"}
      tone="destructive"
      loading={pending}
      onConfirm={() => void confirm()}
    >
      {row.counts.votes > 0 ? (
        <p className="mb-2 text-[13px] font-semibold text-nv-danger">
          This election has {row.counts.votes} recorded ballot{row.counts.votes === 1 ? "" : "s"}.
          Elections with votes cannot be deleted here — ask an administrator to archive or
          delete it instead.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-nv-danger">
          {error}
        </p>
      ) : null}
    </AlertDialog>
  );
}
