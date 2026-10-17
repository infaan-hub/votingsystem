"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, X } from "lucide-react";

import { RequireRole } from "@/src/components/require-role";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Section } from "@/src/components/ui/section";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/toast";
import { useApp } from "@/src/components/AppProvider";
import { FormAlert, apiFetch, firstError, splitError } from "../../_shared";
import { MAX_IMAGE_BYTES } from "@/src/lib/media";

type CandidateDraft = {
  key: string;
  fullName: string;
  seat: string;
  description: string;
  photo: File | null;
  image2: File | null;
  image3: File | null;
};

type CreatedElection = {
  id: number;
  slug: string;
  title: string;
  voters_added?: number;
  unmatched_voters?: string[];
};

type CategoryOption = { id: number; name: string };

function newDraft(): CandidateDraft {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fullName: "",
    seat: "",
    description: "",
    photo: null,
    image2: null,
    image3: null,
  };
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function OfficerNewElectionPage() {
  const router = useRouter();
  const { token } = useApp();
  const { toast } = useToast();
  const formId = useId();

  const defaults = useMemo(() => {
    const start = new Date();
    const end = new Date(start.getTime() + 7 * 86400000);
    return { startDate: isoDate(start), endDate: isoDate(end) };
  }, []);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [cover, setCover] = useState<File | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState<CategoryOption[] | null>(null);
  const [categoriesFailed, setCategoriesFailed] = useState(false);
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [endTime, setEndTime] = useState("17:00");

  const [capacityMode, setCapacityMode] = useState<"open" | "restricted">("restricted");
  const [allowedVoters, setAllowedVoters] = useState<string[]>([]);
  const [allowedInput, setAllowedInput] = useState("");

  const [candidates, setCandidates] = useState<CandidateDraft[]>([newDraft()]);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState("");
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Categories come from the public list so the officer files the election
  // under one of the real explore categories (the home tiles and
  // /categories/[slug] pages read the same rows).
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    apiFetch<CategoryOption[]>(token, "/api/categories")
      .then((rows) => {
        if (!cancelled) setCategories(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setCategoriesFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  function addAllowedVoters() {
    const parts = allowedInput
      .split(/[\s,]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) return;
    setAllowedVoters((current) => {
      const next = [...current];
      for (const part of parts) {
        if (!next.some((entry) => entry.toLowerCase() === part.toLowerCase())) next.push(part);
      }
      return next;
    });
    setAllowedInput("");
  }

  function removeAllowedVoter(entry: string) {
    setAllowedVoters((current) => current.filter((item) => item !== entry));
  }

  function setCandidate(key: string, patch: Partial<CandidateDraft>) {
    setCandidates((rows) =>
      rows.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    );
  }

  function removeCandidate(key: string) {
    setCandidates((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));
  }

  function validate(): boolean {
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
    if (capacityMode === "restricted" && allowedVoters.length === 0) {
      errors.allowed_voters = [
        "Add at least one email or username so a limited election knows who may vote.",
      ];
    }
    candidates.forEach((row, index) => {
      if (!row.fullName.trim()) {
        errors[`candidate_${index}_full_name`] = ["Candidate name is required."];
      }
      if (!row.seat.trim()) {
        errors[`candidate_${index}_seat`] = ["Seat / position is required."];
      }
      if (!row.photo) {
        errors[`candidate_${index}_photo`] = ["A front image is required."];
      }
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setFormErrors(["Please fix the highlighted fields below."]);
      return false;
    }
    setFormErrors([]);
    return true;
  }

  async function submit(): Promise<void> {
    if (saving || !validate()) return;
    setSaving(true);
    setProgress("Creating the election…");
    let created: CreatedElection | null = null;
    try {
      created = await apiFetch<CreatedElection>(token, "/api/officer/elections", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          voting_start_at: new Date(`${startDate}T${startTime}`).toISOString(),
          voting_end_at: new Date(`${endDate}T${endTime}`).toISOString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          rules_text: "",
          voter_id_method: "account",
          voter_id_label: "",
          capacity_mode: capacityMode,
          max_voters: null,
          allowed_voters: capacityMode === "restricted" ? allowedVoters : [],
          category_id: categoryId ? Number(categoryId) : null,
        }),
      });

      if (cover) {
        setProgress("Uploading the election cover image…");
        const imageForm = new FormData();
        imageForm.append("image", cover);
        await apiFetch(token, `/api/officer/elections/${created.id}/image`, {
          method: "POST",
          body: imageForm,
        });
      }

      for (let i = 0; i < candidates.length; i++) {
        const row = candidates[i];
        setProgress(`Adding candidate ${i + 1} of ${candidates.length}: ${row.fullName.trim()}…`);
        const candidateForm = new FormData();
        candidateForm.append("position_name", row.seat.trim());
        candidateForm.append("full_name", row.fullName.trim());
        candidateForm.append("description", row.description.trim());
        if (row.photo) candidateForm.append("photo", row.photo);
        if (row.image2) candidateForm.append("image2", row.image2);
        if (row.image3) candidateForm.append("image3", row.image3);
        await apiFetch(token, `/api/officer/elections/${created.id}/candidates`, {
          method: "POST",
          body: candidateForm,
        });
      }

      setProgress("Done.");
      const unmatched = created.unmatched_voters ?? [];
      if (unmatched.length) {
        toast({
          title: `${unmatched.length} voter${unmatched.length === 1 ? "" : "s"} not found`,
          description: `No active account matches ${unmatched
            .slice(0, 5)
            .join(", ")}${unmatched.length > 5 ? "…" : ""}. Add them from Voter management once they register.`,
          tone: "warning",
        });
      }
      router.push(`/officer/election?election=${created.id}`);
    } catch (error) {
      const split = splitError(error);
      if (created) {
        const createdId = created.id;
        // The election exists — send the officer to it so they can finish
        // managing it instead of losing everything they typed.
        setFormErrors([
          `${split.message} Your election was already created — you are being taken to it…`,
        ]);
        setTimeout(() => router.push(`/officer/election?election=${createdId}`), 1600);
        return;
      }
      setFormErrors(split.form.length ? split.form : [split.message]);
      setFieldErrors(split.fields);
    } finally {
      setSaving(false);
      setProgress("");
    }
  }

  return (
    <>
      <PageHero
        eyebrow="Officer dashboard"
        title="Add election"
        description="Create a new election with its schedule, voter list and full candidate slate. It goes live immediately — no approval needed."
      />
      <RequireRole role="officer">
        <form
          id={formId}
          className="max-w-2xl space-y-6"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <FormAlert messages={formErrors} />
          {progress ? (
            <p
              role="status"
              className="rounded-nv-md border border-nv-line bg-nv-surface px-4 py-3 text-[13px] font-medium text-nv-text"
            >
              {progress}
            </p>
          ) : null}

          <Section title="Election details" description="Identity, cover image and voting window.">
            <div className="space-y-5">
              <Input
                label="Title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Student Council 2026"
                maxLength={200}
                required
                invalid={Boolean(firstError(fieldErrors, "title"))}
                error={firstError(fieldErrors, "title")}
              />
              <Textarea
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this election is about…"
                maxLength={2000}
                invalid={Boolean(firstError(fieldErrors, "description"))}
                error={firstError(fieldErrors, "description")}
              />
              <ImageFileField
                id="election-cover"
                label="Front image"
                hint="Shown on the election page and share cards. JPG, PNG or WEBP."
                file={cover}
                onChange={setCover}
                error={firstError(fieldErrors, "image")}
              />
              <div className="grid gap-5 sm:grid-cols-2">
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
            </div>
          </Section>

          <Section
            title="Category"
            description="File this election under one of the platform categories. It shows up on the home Explore tiles and its category page."
          >
            {categoriesFailed ? (
              <p className="text-[13px] text-nv-muted">
                Categories could not be loaded right now. You can still create the election
                and pick a category later from Edit election.
              </p>
            ) : (
              <Select
                label="Category"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                options={(categories ?? []).map((category) => ({
                  value: String(category.id),
                  label: category.name,
                }))}
                placeholder={categories === null ? "Loading categories…" : "No category"}
                disabled={categories === null}
                hint={
                  categories === null
                    ? "Loading categories…"
                    : categories.length === 0
                      ? "No categories are available yet — an administrator can add them."
                      : "Voters browse elections through these categories. You can change this later from Edit election."
                }
                invalid={Boolean(firstError(fieldErrors, "category_id"))}
                error={firstError(fieldErrors, "category_id")}
              />
            )}
          </Section>

          <Section
            title="Who may vote"
            description="Voters identify with their platform username. Choose whether the election is open to everyone or limited to a list you build."
          >
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-nv-md border border-nv-line bg-nv-surface px-4 py-3">
                <span className="text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted">
                  Voters identify with
                </span>
                <span className="text-[14px] font-semibold text-nv-ink">Username</span>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted">
                  Who may vote
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CapacityOption
                    name={`${formId}-capacity`}
                    title="Open to everyone"
                    detail="Any signed-in student or staff account may vote."
                    checked={capacityMode === "open"}
                    onChange={() => setCapacityMode("open")}
                  />
                  <CapacityOption
                    name={`${formId}-capacity`}
                    title="Limited to a list"
                    detail="Only the people you add below may vote."
                    checked={capacityMode === "restricted"}
                    onChange={() => setCapacityMode("restricted")}
                  />
                </div>
              </fieldset>

              {capacityMode === "restricted" ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        label="Allowed voters"
                        value={allowedInput}
                        onChange={(event) => setAllowedInput(event.target.value)}
                        placeholder="Email or username, then Add"
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            addAllowedVoters();
                          }
                        }}
                        invalid={Boolean(firstError(fieldErrors, "allowed_voters"))}
                        error={firstError(fieldErrors, "allowed_voters")}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-auto"
                      onClick={addAllowedVoters}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Add
                    </Button>
                  </div>
                  {allowedVoters.length ? (
                    <ul className="flex flex-wrap gap-2">
                      {allowedVoters.map((entry) => (
                        <li
                          key={entry}
                          className="flex items-center gap-1.5 rounded-full border border-nv-line bg-nv-surface py-1 pl-3 pr-1.5 text-[13px] font-medium text-nv-ink"
                        >
                          {entry}
                          <button
                            type="button"
                            onClick={() => removeAllowedVoter(entry)}
                            aria-label={`Remove ${entry}`}
                            className="grid h-6 w-6 place-items-center rounded-full text-nv-muted transition-colors hover:bg-nv-danger/10 hover:text-nv-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[12.5px] text-nv-muted">
                      Add the email or username of everyone allowed to vote. Each person must
                      already have an account on the platform.
                    </p>
                  )}
                  <p className="text-[12px] text-nv-muted">
                    <span className="nums-tabular font-semibold text-nv-ink">
                      {allowedVoters.length}
                    </span>{" "}
                    voter{allowedVoters.length === 1 ? "" : "s"} on the list. You can manage the
                    list any time from Voter management.
                  </p>
                </div>
              ) : (
                <p className="text-[12.5px] text-nv-muted">
                  Any signed-in student or staff account can vote in this election — no voter list
                  is required.
                </p>
              )}
            </div>
          </Section>

          <Section
            title="Candidates"
            description="One card per candidate. Candidates sharing the same seat form a single ballot question."
          >
            <div className="space-y-5">
              {candidates.map((row, index) => (
                <CandidateCard
                  key={row.key}
                  index={index}
                  row={row}
                  fieldErrors={fieldErrors}
                  onPatch={(patch) => setCandidate(row.key, patch)}
                  onRemove={() => removeCandidate(row.key)}
                  canRemove={candidates.length > 1}
                />
              ))}
              <Button
                type="button"
                variant="outline"
                className="w-auto"
                onClick={() => setCandidates((rows) => [...rows, newDraft()])}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add candidate
              </Button>
            </div>
          </Section>

          <div className="flex flex-wrap gap-3 pb-4">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create election"}
            </Button>
            <LinkButton href="/officer/election" variant="ghost" className="w-auto">
              Cancel
            </LinkButton>
          </div>
        </form>
      </RequireRole>
    </>
  );
}

function CapacityOption({
  name,
  title,
  detail,
  checked,
  onChange,
}: {
  name: string;
  title: string;
  detail: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-start gap-3 rounded-nv-md border p-4 transition-colors ${
        checked ? "border-nv-primary bg-nv-primary-100" : "border-nv-line bg-nv-surface"
      }`}
    >
      <input
        id={id}
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 accent-white"
      />
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold text-nv-ink">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-relaxed text-nv-muted">{detail}</span>
      </span>
    </label>
  );
}

function CandidateCard({
  index,
  row,
  fieldErrors,
  onPatch,
  onRemove,
  canRemove,
}: {
  index: number;
  row: CandidateDraft;
  fieldErrors: Record<string, string[]>;
  onPatch: (patch: Partial<CandidateDraft>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  return (
    <div className="rounded-nv-md border border-nv-line bg-nv-surface p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[13px] font-bold uppercase tracking-[0.6px] text-nv-muted">
          Candidate {index + 1}
        </h3>
        {canRemove ? (
          <Button
            type="button"
            variant="ghost"
            size="dense"
            className="w-auto"
            onClick={onRemove}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Remove
          </Button>
        ) : null}
      </div>
      <div className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            label="Full name"
            value={row.fullName}
            onChange={(event) => onPatch({ fullName: event.target.value })}
            placeholder="e.g. Amina Yusuf"
            maxLength={160}
            required
            invalid={Boolean(firstError(fieldErrors, `candidate_${index}_full_name`))}
            error={firstError(fieldErrors, `candidate_${index}_full_name`)}
          />
          <Input
            label="Seat / position"
            value={row.seat}
            onChange={(event) => onPatch({ seat: event.target.value })}
            placeholder="e.g. President"
            maxLength={120}
            required
            invalid={Boolean(firstError(fieldErrors, `candidate_${index}_seat`))}
            error={firstError(fieldErrors, `candidate_${index}_seat`)}
          />
        </div>
        <Textarea
          label="Description"
          value={row.description}
          onChange={(event) => onPatch({ description: event.target.value })}
          placeholder="Manifesto or short bio shown under the candidate's name…"
          maxLength={4000}
        />
        <ImageFileField
          id={`candidate-photo-${row.key}`}
          label="Front image"
          hint="Primary photo shown on the ballot."
          file={row.photo}
          onChange={(file) => onPatch({ photo: file })}
          error={firstError(fieldErrors, `candidate_${index}_photo`)}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <ImageFileField
            id={`candidate-image2-${row.key}`}
            label="Extra image 1 (optional)"
            hint="Second photo for the candidate profile."
            file={row.image2}
            onChange={(file) => onPatch({ image2: file })}
          />
          <ImageFileField
            id={`candidate-image3-${row.key}`}
            label="Extra image 2 (optional)"
            hint="Third photo for the candidate profile."
            file={row.image3}
            onChange={(file) => onPatch({ image3: file })}
          />
        </div>
      </div>
    </div>
  );
}

function ImageFileField({
  id,
  label,
  hint,
  file,
  onChange,
  error,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
}) {
  const [sizeError, setSizeError] = useState<string | null>(null);
  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.6px] text-nv-muted"
      >
        {label}
      </label>
      <div className="flex items-start gap-3">
        {file ? <FilePreview file={file} /> : null}
        <div className="min-w-0 flex-1">
          <input
            id={id}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              if (next && next.size > MAX_IMAGE_BYTES) {
                // The server enforces the same cap; catching it here saves a
                // pointless upload round-trip.
                setSizeError(
                  `Image is too large. The limit is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
                );
                event.target.value = "";
                onChange(null);
                return;
              }
              setSizeError(null);
              onChange(next);
            }}
            className="block w-full text-[13px] text-nv-text file:mr-3 file:rounded-md file:border file:border-nv-line file:bg-nv-surface file:px-3 file:py-2 file:text-[12px] file:font-bold file:uppercase file:tracking-[0.5px] file:text-nv-ink"
          />
          <p className="mt-1.5 text-[12px] text-nv-muted">{hint}</p>
        </div>
      </div>
      {error || sizeError ? (
        <p role="alert" className="mt-1 text-[12px] font-medium text-nv-danger">
          {error || sizeError}
        </p>
      ) : null}
    </div>
  );
}

function FilePreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      className="h-16 w-16 shrink-0 rounded-nv-md border border-nv-line object-cover"
    />
  );
}
