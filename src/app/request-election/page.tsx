"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileText, Inbox, RotateCw } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { RadioGroup } from "@/src/components/ui/radio-group";
import { Section } from "@/src/components/ui/section";
import { Select, type SelectOption } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { useToast } from "@/src/components/ui/toast";

type Category = { id: number; name: string };

type ElectionSlugEntry = { id: number; slug: string };

type ElectionRequest = {
  id: number;
  title: string;
  category_name: string | null;
  category_id: number | null;
  organization: string | null;
  status: string;
  decision_note: string | null;
  election_id: number | null;
  created_at: string | null;
};

type FieldErrors = Record<string, string[]>;

function readFieldErrors(body: unknown): FieldErrors {
  if (!body || typeof body !== "object") return {};
  const result: FieldErrors = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      result[key] = value.map((entry) => String(entry));
    } else if (typeof value === "string") {
      result[key] = [value];
    }
  }
  return result;
}

const ELECTION_TYPE_OPTIONS = [
  {
    value: "public",
    label: "Public",
    description: "Anyone with an account on this platform can see the election and vote.",
  },
  {
    value: "restricted",
    label: "Restricted",
    description: "Only voters on an approved list, or people with a valid invite link, can take part.",
  },
  {
    value: "internal",
    label: "Internal",
    description: "Limited to an organization's own members, staff, or a closed group.",
  },
];

const VOTER_ID_OPTIONS: SelectOption[] = [
  { value: "account", label: "Platform account" },
  { value: "email", label: "Email address" },
  { value: "phone", label: "Phone number" },
  { value: "membership", label: "Membership number" },
  { value: "employee", label: "Employee ID" },
  { value: "student_id", label: "Student ID" },
  { value: "custom", label: "Custom identifier" },
];

function formatDateTime(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function RequestElectionContent() {
  const { token } = useApp();
  const { toast } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [requests, setRequests] = useState<ElectionRequest[] | null>(null);
  const [historyError, setHistoryError] = useState("");
  const [electionSlugs, setElectionSlugs] = useState<Map<number, string>>(new Map());

  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [organization, setOrganization] = useState("");
  const [purpose, setPurpose] = useState("");
  const [description, setDescription] = useState("");
  const [expectedVoters, setExpectedVoters] = useState("");
  const [electionType, setElectionType] = useState("public");
  const [voterIdMethod, setVoterIdMethod] = useState("account");
  const [positionsText, setPositionsText] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [contactInfo, setContactInfo] = useState("");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!token) return;
    setRequests(null);
    setHistoryError("");
    try {
      const response = await fetch("/api/election-requests", {
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) throw new Error("We could not load your requests. Please try again.");
      const data = (await response.json()) as ElectionRequest[];
      setRequests(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setHistoryError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load your requests. Please try again.",
      );
    }
  }, [token]);

  useEffect(() => {
    let ignore = false;
    fetch("/api/categories")
      .then(async (response) => {
        if (!response.ok) return [];
        const data = (await response.json()) as Category[];
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!ignore) setCategories(data);
      })
      .catch(() => {
        if (!ignore) setCategories([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    fetch("/api/elections")
      .then(async (response) => {
        if (!response.ok) return [] as ElectionSlugEntry[];
        const data = (await response.json()) as ElectionSlugEntry[];
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        setElectionSlugs(new Map(data.map((election) => [election.id, election.slug])));
      })
      .catch(() => {
        setElectionSlugs(new Map());
      });
  }, []);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const categoryOptions: SelectOption[] = [
    ...categories.map((category) => ({ value: String(category.id), label: category.name })),
    { value: "other", label: "Other (describe below)" },
  ];

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setErrors({});
    setFormError("");

    const localErrors: FieldErrors = {};
    if (!title.trim()) localErrors.title = ["This field is required."];
    if (!startAt) localErrors.start_at = ["This field is required."];
    if (!endAt) localErrors.end_at = ["This field is required."];
    if (categoryId === "other" && !categoryName.trim()) {
      localErrors.category_name = ["Describe the category you need."];
    }
    if (startAt && endAt && new Date(endAt) <= new Date(startAt)) {
      localErrors.end_at = ["The end date must be after the start date."];
    }
    if (expectedVoters && Number(expectedVoters) < 0) {
      localErrors.expected_voters = ["Expected voters must be zero or a positive number."];
    }
    if (Object.keys(localErrors).length > 0) {
      setErrors(localErrors);
      setFormError("Please fix the highlighted problems before submitting.");
      return;
    }

    const payload: Record<string, unknown> = {
      title: title.trim(),
      organization: organization.trim(),
      description: description.trim(),
      purpose: purpose.trim(),
      start_at: new Date(startAt).toISOString(),
      end_at: new Date(endAt).toISOString(),
      expected_voters: expectedVoters ? Number(expectedVoters) : 0,
      election_type: electionType,
      voter_id_method: voterIdMethod,
      positions_text: positionsText.trim(),
      reason: reason.trim(),
      contact_info: contactInfo.trim(),
    };
    if (categoryId === "other") {
      payload.category_name = categoryName.trim();
    } else if (categoryId) {
      payload.category_id = Number(categoryId);
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/election-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Token ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown;
        const fieldErrors = readFieldErrors(body);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
          setFormError(
            fieldErrors.detail?.[0] ??
              "Please fix the highlighted problems and submit the request again.",
          );
        } else {
          setFormError("We could not submit your request right now. Please try again shortly.");
        }
        return;
      }

      const created = (await response.json()) as ElectionRequest;
      setRequests((current) => [created, ...(current ?? [])]);
      setSubmitted(true);
      setErrors({});
      toast({
        title: "Submitted for administrator review",
        description: "You can follow the status in the Your requests panel.",
        tone: "success",
      });

      setTitle("");
      setCategoryId("");
      setCategoryName("");
      setOrganization("");
      setPurpose("");
      setDescription("");
      setExpectedVoters("");
      setElectionType("public");
      setVoterIdMethod("account");
      setPositionsText("");
      setStartAt("");
      setEndAt("");
      setReason("");
      setContactInfo("");
    } catch {
      setFormError("We could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHero
        title="Request an election"
        description="Ask an administrator to set up a new election for your organization. Provide as much detail as you can — it speeds up the review."
        backHref="/dashboard"
        className="-mt-6"
      />

      <div className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
        <Section title="Request a new election">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 rounded-nv-md border border-nv-success/40 bg-nv-success/10 px-6 py-10 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-nv-surface text-nv-success">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </span>
              <h3 className="text-fluid-lg text-nv-ink">Submitted for administrator review</h3>
              <p className="max-w-sm text-[13.5px] leading-relaxed text-nv-muted">
                An administrator will review your request. You will see the decision, and any notes,
                in the Your requests panel on this page.
              </p>
              <Button variant="outline" className="mt-2 sm:w-auto" onClick={() => setSubmitted(false)}>
                Submit another request
              </Button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="max-w-2xl space-y-4" noValidate>
              {formError ? (
                <p
                  role="alert"
                  className="rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 px-3 py-2.5 text-[13px] text-nv-danger"
                >
                  {formError}
                </p>
              ) : null}

              <Input
                label="Election title"
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Student Union President 2027"
                invalid={!!errors.title}
                error={errors.title?.[0]}
              />

              <Select
                label="Category"
                required
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
                options={categoryOptions}
                placeholder="Choose a category"
                invalid={!!errors.category_id}
                error={errors.category_id?.[0]}
              />
              {categoryId === "other" ? (
                <Input
                  label="Describe the category"
                  required
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="e.g. Departmental referendum"
                  invalid={!!errors.category_name}
                  error={errors.category_name?.[0]}
                />
              ) : null}

              <div>
                <Input
                  label="Organization"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  invalid={!!errors.organization}
                  error={errors.organization?.[0]}
                />
                {!errors.organization ? (
                  <p className="mt-1.5 text-[12px] text-nv-muted">
                    Optional — the body running the election, if it is not obvious from the title.
                  </p>
                ) : null}
              </div>

              <Textarea
                label="Purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                hint="What decision should this election make?"
                invalid={!!errors.purpose}
                error={errors.purpose?.[0]}
              />

              <Textarea
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                hint="Background voters will see on the election page."
                invalid={!!errors.description}
                error={errors.description?.[0]}
              />

              <div>
                <Input
                  label="Expected voters"
                  type="number"
                  min={0}
                  value={expectedVoters}
                  onChange={(event) => setExpectedVoters(event.target.value)}
                  invalid={!!errors.expected_voters}
                  error={errors.expected_voters?.[0]}
                />
                {!errors.expected_voters ? (
                  <p className="mt-1.5 text-[12px] text-nv-muted">
                    An estimate helps size the voter list.
                  </p>
                ) : null}
              </div>

              <RadioGroup
                label="Election type"
                name="election_type"
                value={electionType}
                onChange={setElectionType}
                options={ELECTION_TYPE_OPTIONS}
                variant="card"
              />

              <Select
                label="How voters identify themselves"
                value={voterIdMethod}
                onChange={(event) => setVoterIdMethod(event.target.value)}
                options={VOTER_ID_OPTIONS}
                invalid={!!errors.voter_id_method}
                error={errors.voter_id_method?.[0]}
              />

              <Textarea
                label="Positions"
                value={positionsText}
                onChange={(event) => setPositionsText(event.target.value)}
                hint="One position per line, e.g. President, Treasurer, Representative."
                invalid={!!errors.positions_text}
                error={errors.positions_text?.[0]}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Starts"
                  type="datetime-local"
                  required
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                  invalid={!!errors.start_at}
                  error={errors.start_at?.[0]}
                />
                <Input
                  label="Ends"
                  type="datetime-local"
                  required
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                  invalid={!!errors.end_at}
                  error={errors.end_at?.[0]}
                />
              </div>

              <Textarea
                label="Why is this election needed?"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                invalid={!!errors.reason}
                error={errors.reason?.[0]}
              />

              <div>
                <Input
                  label="Contact information"
                  value={contactInfo}
                  onChange={(event) => setContactInfo(event.target.value)}
                  invalid={!!errors.contact_info}
                  error={errors.contact_info?.[0]}
                />
                {!errors.contact_info ? (
                  <p className="mt-1.5 text-[12px] text-nv-muted">
                    An email or phone number in case the reviewer has questions.
                  </p>
                ) : null}
              </div>

              <Button type="submit" disabled={submitting} className="sm:w-auto">
                <FileText className="h-4 w-4" aria-hidden="true" />
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </form>
          )}
        </Section>

        <Section title="Your requests" description="Requests you have submitted before.">
          {historyError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
            >
              <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{historyError}</p>
              <Button variant="outline" size="dense" onClick={() => void loadHistory()}>
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Retry
              </Button>
            </div>
          ) : requests === null ? (
            <div className="space-y-3" aria-busy="true">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
              title="No requests yet"
              description="Once you submit the form, every request appears here with its review status and any decision notes from the administrator."
            />
          ) : (
            <ul className="space-y-3">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[14.5px] font-bold text-nv-ink">
                      {request.title}
                    </p>
                    <StatusBadge status={request.status} />
                  </div>
                  <p className="nums-tabular mt-1 text-[12px] text-nv-muted">
                    Submitted {formatDateTime(request.created_at)}
                    {request.organization ? ` · ${request.organization}` : ""}
                  </p>
                  {request.decision_note ? (
                    <p className="mt-2 rounded-nv-md bg-nv-bg px-3 py-2 text-[13px] leading-relaxed text-nv-text">
                      {request.decision_note}
                    </p>
                  ) : null}
                  {request.election_id ? (
                    <Link
                      href={
                        request.election_id !== null && electionSlugs.has(request.election_id)
                          ? `/elections/${electionSlugs.get(request.election_id)}`
                          : "/elections"
                      }
                      className="mt-2 inline-block text-[12.5px] font-bold text-nv-primary hover:underline"
                    >
                      An election was created from this request — view it in Elections
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4">
            <LinkButton href="/elections" variant="outline" className="sm:w-auto">
              Browse published elections
            </LinkButton>
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function RequestElectionPage() {
  return (
    <RequireRole role="user">
      <RequestElectionContent />
    </RequireRole>
  );
}
