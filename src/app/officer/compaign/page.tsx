"use client";

import { Suspense, useState } from "react";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Avatar } from "@/src/components/ui/avatar";
import { Button } from "@/src/components/ui/button";
import { AlertDialog, Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { LinkButton, PageHeader } from "@/src/components/ui/page-header";
import { RadioGroup } from "@/src/components/ui/radio-group";
import { Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/toast";
import { MAX_IMAGE_BYTES, MAX_VIDEO_BYTES, MAX_VIDEO_SECONDS } from "@/src/lib/media";
import {
  ElectionPickerSection,
  ErrorBanner,
  FormAlert,
  ListSkeleton,
  NoElectionsState,
  PickElectionAction,
  apiFetch,
  firstError,
  formatDuration,
  splitError,
  useElectionSelection,
  useResource,
  windowText,
  type ManagedElection,
} from "../_shared";
import { Select } from "@/src/components/ui/select";

type CampaignRow = {
  id: number;
  topic: string;
  description: string | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  image_url: string | null;
  image_urls?: string[];
  video_url: string | null;
  video_duration_seconds: number | null;
  election: { id: number; slug: string; title: string; status: string };
  candidate: {
    id: number;
    slogan: string | null;
    photo_url: string | null;
    party: { id: number; name: string; color: string; code: string } | null;
    user: { username: string; full_name: string };
  };
};

type OfficerBallotPayload = {
  positions: {
    id: number;
    name: string;
    candidates: { id: number; user: { full_name: string } }[];
  }[];
};

type FormState = {
  topic: string;
  description: string;
  candidate_id: string;
  start_at: string;
  end_at: string;
  status: string;
  image: File | null;
  image2: File | null;
  image3: File | null;
  video: File | null;
};

const EMPTY_FORM: FormState = {
  topic: "",
  description: "",
  candidate_id: "",
  start_at: "",
  end_at: "",
  status: "DRAFT",
  image: null,
  image2: null,
  image3: null,
  video: null,
};

function toLocalInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export default function OfficerCampaignPage() {
  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Publish short candidate stories, cover images and videos that appear on the campaign feed for your election."
        breadcrumbs={[
          { label: "Officer dashboard", href: "/officer/dashboard" },
          { label: "Campaigns" },
        ]}
        actions={
          <LinkButton href="/officer/dashboard" variant="outline" className="w-auto">
            All elections
          </LinkButton>
        }
      />
      <RequireRole role="officer">
        <Suspense fallback={<div className="mt-6"><ListSkeleton /></div>}>
          <CampaignBody />
        </Suspense>
      </RequireRole>
    </>
  );
}

function CampaignBody() {
  const { token } = useApp();
  const { toast } = useToast();
  const { selected: selectedId, select } = useElectionSelection();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CampaignRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [formMessages, setFormMessages] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<CampaignRow | null>(null);
  const [deletePending, setDeletePending] = useState(false);

  const list = useResource<ManagedElection[]>(
    (authToken) => apiFetch<ManagedElection[]>(authToken, "/api/officer/elections"),
    [],
  );
  const campaigns = useResource<CampaignRow[]>(
    (authToken) =>
      selectedId
        ? apiFetch<CampaignRow[]>(authToken, `/api/officer/campaigns?election_id=${selectedId}`)
        : Promise.resolve([]),
    [selectedId],
  );
  const ballot = useResource<OfficerBallotPayload | null>(
    (authToken) =>
      dialogOpen && selectedId
        ? apiFetch<OfficerBallotPayload>(authToken, `/api/officer/elections/${selectedId}`)
        : Promise.resolve(null),
    [dialogOpen, selectedId],
  );

  const rows = list.data ?? [];
  const selected = rows.find((row) => String(row.id) === selectedId) ?? null;
  const scoped = (campaigns.data ?? []).filter(
    (campaign) => String(campaign.election.id) === selectedId,
  );

  const candidateOptions = (ballot.data?.positions ?? []).flatMap((position) =>
    position.candidates.map((candidate) => ({
      value: String(candidate.id),
      label: `${position.name} — ${candidate.user.full_name}`,
    })),
  );

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormMessages([]);
    setDialogOpen(true);
  }

  function openEdit(campaign: CampaignRow) {
    setEditing(campaign);
    setForm({
      topic: campaign.topic,
      description: campaign.description ?? "",
      candidate_id: String(campaign.candidate.id),
      start_at: toLocalInput(campaign.start_at),
      end_at: toLocalInput(campaign.end_at),
      status: campaign.status,
      image: null,
      image2: null,
      image3: null,
      video: null,
    });
    setFieldErrors({});
    setFormMessages([]);
    setDialogOpen(true);
  }

  function closeDialog() {
    if (saving) return;
    setDialogOpen(false);
    setFieldErrors({});
    setFormMessages([]);
  }

  async function submit() {
    if (!selectedId) return;
    const localErrors: Record<string, string[]> = {};
    if (!form.topic.trim()) localErrors.topic = ["This field is required."];
    if (!editing && !form.candidate_id) localErrors.candidate_id = ["Choose a candidate."];
    if (Object.keys(localErrors).length) {
      setFieldErrors(localErrors);
      setFormMessages([]);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    setFormMessages([]);
    try {
      const body = new FormData();
      body.set("topic", form.topic.trim());
      body.set("description", form.description.trim());
      body.set("status", form.status);
      const startAt = fromLocalInput(form.start_at);
      const endAt = fromLocalInput(form.end_at);
      if (startAt) body.set("start_at", startAt);
      if (endAt) body.set("end_at", endAt);
      if (form.image) body.set("image", form.image);
      if (form.image2) body.set("image2", form.image2);
      if (form.image3) body.set("image3", form.image3);
      if (form.video) body.set("video", form.video);

      if (editing) {
        await apiFetch(token, `/api/officer/campaigns/${editing.id}`, {
          method: "PATCH",
          body,
        });
      } else {
        body.set("election_id", selectedId);
        body.set("candidate_id", form.candidate_id);
        await apiFetch(token, "/api/officer/campaigns", { method: "POST", body });
      }

      toast({
        title: editing ? "Campaign updated" : "Campaign created",
        description: form.topic.trim(),
        tone: "success",
      });
      setDialogOpen(false);
      campaigns.reload();
    } catch (cause) {
      const split = splitError(cause);
      setFieldErrors(split.fields);
      setFormMessages(
        split.form.length
          ? split.form
          : Object.keys(split.fields).length
            ? []
            : [split.message],
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    try {
      await apiFetch(token, `/api/officer/campaigns/${deleting.id}`, { method: "DELETE" });
      toast({ title: "Campaign deleted", description: deleting.topic, tone: "success" });
      setDeleting(null);
      campaigns.reload();
    } catch (cause) {
      const split = splitError(cause);
      toast({ title: "Campaign could not be deleted", description: split.message, tone: "error" });
    } finally {
      setDeletePending(false);
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
          description="Campaigns are grouped by the elections you manage, and that list did not load. Retry to try again."
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
        <Section
          title="Campaigns"
          description="Each campaign belongs to one candidate. Drafts stay private to officers; published campaigns appear on the public feed immediately."
          actions={
            <Button size="dense" className="w-auto" onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              New campaign
            </Button>
          }
        >
          <div className="space-y-4">
            {campaigns.error ? (
              <ErrorBanner message={campaigns.error} onRetry={campaigns.reload} />
            ) : null}

            {campaigns.loading && !campaigns.data ? (
              <div className="grid gap-4 md:grid-cols-2">
                <Skeleton className="h-44 w-full" />
                <Skeleton className="h-44 w-full" />
              </div>
            ) : campaigns.error && !campaigns.data ? (
              <EmptyState
                icon={<RefreshCw className="h-5 w-5" aria-hidden="true" />}
                title="Campaigns could not be loaded"
                description="The officer campaign endpoint did not respond for this election. Retry to try again."
                action={
                  <Button size="dense" className="w-auto" onClick={campaigns.reload}>
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Retry
                  </Button>
                }
              />
            ) : scoped.length === 0 ? (
              <EmptyState
                icon={<Plus className="h-5 w-5" aria-hidden="true" />}
                title="No campaigns for this election"
                description="Campaigns give voters context about each candidate. Create the first one with a topic, a candidate and optional media."
                action={
                  <Button size="dense" className="w-auto" onClick={openCreate}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create the first campaign
                  </Button>
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {scoped.map((campaign) => (
                  <CampaignCard
                    key={campaign.id}
                    campaign={campaign}
                    onEdit={() => openEdit(campaign)}
                    onDelete={() => setDeleting(campaign)}
                  />
                ))}
              </div>
            )}
          </div>
        </Section>
      ) : (
        <EmptyState
          title="No election selected"
          description="Choose one of your elections above to see and edit its campaigns."
          action={<PickElectionAction />}
        />
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
        title={editing ? "Edit campaign" : "New campaign"}
        description={
          editing
            ? "Update the wording, schedule, status or media for this campaign."
            : "Pick a candidate on this election's ballot, then add a topic, a description, a cover image, up to two extra images and a video of up to 30 seconds."
        }
        footer={
          <>
            <Button variant="outline" onClick={closeDialog} disabled={saving} className="sm:w-auto">
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={saving} className="sm:w-auto">
              {saving ? "Saving…" : editing ? "Save changes" : "Create campaign"}
            </Button>
          </>
        }
      >
        <form
          className="max-w-2xl space-y-4 py-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FormAlert messages={formMessages} />

          <Input
            label="Topic"
            required
            value={form.topic}
            maxLength={200}
            placeholder="Why this candidate deserves your vote"
            onChange={(event) => setForm({ ...form, topic: event.target.value })}
            error={firstError(fieldErrors, "topic")}
            invalid={Boolean(fieldErrors.topic)}
          />

          <Textarea
            label="Description"
            value={form.description}
            maxLength={4000}
            placeholder="Optional longer story shown under the topic."
            hint="Optional. Up to 4,000 characters."
            onChange={(event) => setForm({ ...form, description: event.target.value })}
            error={firstError(fieldErrors, "description")}
            invalid={Boolean(fieldErrors.description)}
          />

          <div>
            {ballot.loading && !ballot.data ? (
              <Skeleton className="h-12 w-full" />
            ) : ballot.error ? (
              <div className="space-y-2">
                <ErrorBanner message={ballot.error} onRetry={ballot.reload} />
                <p className="text-[12.5px] text-nv-muted">
                  Candidate options come from the published ballot of this election.
                </p>
              </div>
            ) : (
              <Select
                label="Candidate"
                required
                value={form.candidate_id}
                options={candidateOptions}
                placeholder="Choose a candidate"
                disabled={Boolean(editing)}
                hint={
                  editing
                    ? "The candidate cannot be changed after a campaign is created."
                    : "Candidates come from this election's ballot — pick the one this campaign supports."
                }
                onChange={(event) => setForm({ ...form, candidate_id: event.target.value })}
                error={firstError(fieldErrors, "candidate_id")}
                invalid={Boolean(fieldErrors.candidate_id)}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Input
                type="datetime-local"
                label="Starts at"
                value={form.start_at}
                onChange={(event) => setForm({ ...form, start_at: event.target.value })}
                error={firstError(fieldErrors, "start_at")}
                invalid={Boolean(fieldErrors.start_at)}
              />
              <p className="mt-1 text-[12px] text-nv-muted">
                {editing ? "Leave empty to keep the current value. " : "Optional. "}
                Times are read in this device&apos;s time zone.
              </p>
            </div>
            <div>
              <Input
                type="datetime-local"
                label="Ends at"
                value={form.end_at}
                onChange={(event) => setForm({ ...form, end_at: event.target.value })}
                error={firstError(fieldErrors, "end_at")}
                invalid={Boolean(fieldErrors.end_at)}
              />
              <p className="mt-1 text-[12px] text-nv-muted">
                {editing ? "Leave empty to keep the current value. " : "Optional. "}
                Times are read in this device&apos;s time zone.
              </p>
            </div>
          </div>

          <RadioGroup
            label="Status"
            name="campaign-status"
            value={form.status}
            onChange={(value) => setForm({ ...form, status: value })}
            hint="Published campaigns are immediately visible to voters. Drafts stay hidden until you switch them over."
            error={firstError(fieldErrors, "status")}
            options={[
              {
                value: "DRAFT",
                label: "Draft",
                description: "Private to officers. Voters never see it while it is a draft.",
              },
              {
                value: "PUBLISHED",
                label: "Published",
                description: "Immediately visible to voters on the campaign feed.",
              },
            ]}
          />

          <FileField
            id="campaign-image"
            label="Cover image"
            accept="image/*"
            hint={`Optional. Up to ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB — JPG, PNG or WebP.`}
            error={firstError(fieldErrors, "image")}
            onChange={(file) => setForm((current) => ({ ...current, image: file }))}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <FileField
              id="campaign-image2"
              label="Extra image 1 (optional)"
              accept="image/*"
              hint={`Gallery image. Up to ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.${
                editing ? " Replaces the current first extra image if one exists." : ""
              }`}
              error={firstError(fieldErrors, "image2")}
              onChange={(file) => setForm((current) => ({ ...current, image2: file }))}
            />
            <FileField
              id="campaign-image3"
              label="Extra image 2 (optional)"
              accept="image/*"
              hint={`Gallery image. Up to ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.${
                editing ? " Replaces the current second extra image if one exists." : ""
              }`}
              error={firstError(fieldErrors, "image3")}
              onChange={(file) => setForm((current) => ({ ...current, image3: file }))}
            />
          </div>

          <FileField
            id="campaign-video"
            label="Campaign video"
            accept="video/*"
            hint={`Optional. Max ${MAX_VIDEO_SECONDS} seconds / ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB — duration is verified server-side.`}
            error={firstError(fieldErrors, "video")}
            onChange={(file) => setForm((current) => ({ ...current, video: file }))}
          />
        </form>
      </Dialog>

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(next) => {
          if (!next) setDeleting(null);
        }}
        title="Delete this campaign?"
        description={
          deleting
            ? `“${deleting.topic}” will be removed from ${deleting.election.title} and disappears from the feed.`
            : undefined
        }
        confirmLabel="Delete campaign"
        tone="destructive"
        loading={deletePending}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  );
}

function FileField({
  id,
  label,
  accept,
  hint,
  error,
  onChange,
}: {
  id: string;
  label: string;
  accept: string;
  hint: string;
  error?: string;
  onChange: (file: File | null) => void;
}) {
  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted"
      >
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={accept}
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        className="block w-full text-[13px] text-nv-text file:mr-3 file:rounded-md file:border file:border-nv-line file:bg-nv-surface file:px-3 file:py-2 file:text-[12px] file:font-bold file:uppercase file:tracking-[0.5px] file:text-nv-ink"
      />
      <p className="mt-1.5 text-[12px] text-nv-muted">{hint}</p>
      {error ? (
        <p role="alert" className="mt-1 text-[12px] font-medium text-nv-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function CampaignCard({
  campaign,
  onEdit,
  onDelete,
}: {
  campaign: CampaignRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const gallery = campaign.image_urls ?? [];
  // The cover renders as the card's main visual — only show the rest as thumbs.
  const extras = campaign.image_url
    ? gallery.filter((url) => url !== campaign.image_url)
    : gallery;
  return (
    <article className="rounded-nv-md border border-nv-line bg-nv-surface p-5 shadow-nv-card">
      <div className="flex items-start gap-4">
        {campaign.image_url ? (
          <img
            src={campaign.image_url}
            alt=""
            className="h-16 w-16 shrink-0 rounded-nv-md object-cover"
          />
        ) : (
          <Avatar
            name={campaign.candidate.user.full_name}
            src={campaign.candidate.photo_url}
            size={64}
          />
        )}

        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-nv-ink">{campaign.topic}</h3>
            <StatusBadge status={campaign.status} />
          </div>
          <p className="text-[13px] text-nv-text">{campaign.candidate.user.full_name}</p>
          <p className="nums-tabular text-[12.5px] text-nv-muted">
            {formatDuration(campaign.video_duration_seconds)} · {windowText(campaign.start_at, campaign.end_at)}
          </p>
          {campaign.description ? (
            <p className="line-clamp-2 text-[12.5px] text-nv-muted">{campaign.description}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" size="dense" className="w-auto" onClick={onEdit}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Edit
        </Button>
        <Button
          variant="outline"
          size="dense"
          className="w-auto text-nv-danger"
          onClick={onDelete}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Delete
        </Button>
      </div>

      {extras.length ? (
        <div className="mt-3 flex gap-2">
          {extras.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-12 w-12 rounded-nv-md border border-nv-line object-cover"
            />
          ))}
        </div>
      ) : null}
    </article>
  );
}
