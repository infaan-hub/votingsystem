"use client";

import { Suspense, useState } from "react";
import { Check, Copy, Link2, RefreshCw, UserPlus } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { RequireRole } from "@/src/components/require-role";
import { StatusBadge } from "@/src/components/status-badge";
import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { AlertDialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Progress } from "@/src/components/ui/progress";
import { RadioGroup } from "@/src/components/ui/radio-group";
import { KeyValueList, Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/src/components/ui/table";
import { Textarea } from "@/src/components/ui/textarea";
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
  humanize,
  splitError,
  useElectionSelection,
  useResource,
  windowText,
  type ManagedElection,
} from "../_shared";

type VoterRow = {
  id: number;
  unique_key: string;
  label: string | null;
  user: { id: number; username: string; full_name: string } | null;
  created_at: string | null;
};

type AddResult = { added: number; skipped: number; total: number; unmatched?: string[] };

type ShareTokenPayload = {
  share_token: string;
  invite_path: string;
  expires_at: string | null;
};

type ManagedCandidate = {
  id: number;
  user: { full_name: string; username: string };
  slogan: string | null;
  manifesto: string | null;
  photo_url: string | null;
  approved: boolean;
  vote_total: number;
};

type ManagedPosition = {
  id: number;
  name: string;
  description: string | null;
  voter_group_label: string;
  max_winners: number;
  candidates: ManagedCandidate[];
};

type ManagedElectionDetail = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  image_url: string | null;
  lifecycle_status: string;
  status: "upcoming" | "active" | "ended";
  visibility: string;
  result_visibility: string;
  secret_ballot: boolean;
  timezone: string | null;
  eligibility_policy: string;
  rules_text: string;
  voter_id_method: string;
  voter_id_label: string;
  capacity_mode: string;
  max_voters: number | null;
  is_published: boolean;
  campaign_start_at: string | null;
  campaign_end_at: string | null;
  voting_start_at: string | null;
  voting_end_at: string | null;
};

type OfficerDetailPayload = {
  election: ManagedElectionDetail;
  positions: ManagedPosition[];
  counts: {
    positions: number;
    candidates: number;
    votes: number;
    published_campaigns: number;
    eligible_voters: number;
  };
};

const NOT_OPEN_STATUSES = new Set(["DRAFT", "PUBLISHED", "NOMINATIONS", "READY"]);

function shortKey(value: string): string {
  return value.length > 16 ? `${value.slice(0, 16)}…` : value;
}

export default function OfficerManagementPage() {
  return (
    <>
      <PageHero
        eyebrow="Officer dashboard"
        title="Election management"
        description="Full details of one election you administer: schedule, rules, ballot, eligible voters, capacity and a shareable voter link."
        actions={
          <LinkButton href="/officer/dashboard" variant="heroGhost" className="w-auto">
            All elections
          </LinkButton>
        }
      />
      <RequireRole role="officer">
        <Suspense fallback={<div className="mt-6"><ListSkeleton /></div>}>
          <ManagementBody />
        </Suspense>
      </RequireRole>
    </>
  );
}

function ManagementBody() {
  const { token } = useApp();
  const { toast } = useToast();
  const { selected: selectedId, select } = useElectionSelection();

  const list = useResource<ManagedElection[]>(
    (authToken) => apiFetch<ManagedElection[]>(authToken, "/api/officer/elections"),
    [],
  );
  const rows = list.data ?? [];
  const selected = rows.find((row) => String(row.id) === selectedId) ?? null;

  const voters = useResource<VoterRow[]>(
    (authToken) =>
      selected
        ? apiFetch<VoterRow[]>(authToken, `/api/elections/${selected.id}/voters`)
        : Promise.resolve([]),
    [selected?.id ?? 0],
  );

  const overview = useResource<OfficerDetailPayload | null>(
    (authToken) =>
      selected
        ? apiFetch<OfficerDetailPayload>(authToken, `/api/officer/elections/${selected.id}`)
        : Promise.resolve(null),
    [selected?.id ?? 0],
  );

  const [mode, setMode] = useState("account");
  const [entryText, setEntryText] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<AddResult | null>(null);
  const [addError, setAddError] = useState<string[]>([]);
  const [removing, setRemoving] = useState<VoterRow | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [share, setShare] = useState<ShareTokenPayload | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sharePending, setSharePending] = useState(false);
  const [shareError, setShareError] = useState("");
  const [copied, setCopied] = useState(false);

  const shareUrl = share
    ? `${typeof window !== "undefined" ? window.location.origin : ""}${share.invite_path}`
    : "";

  const voterRows = voters.data ?? [];
  const detail = overview.data?.election ?? null;
  const positions = overview.data?.positions ?? [];
  const voterCount = voters.data
    ? voterRows.length
    : selected?.counts.eligible_voters ?? 0;
  const cap = detail?.max_voters ?? null;
  const usagePercent =
    cap && cap > 0 ? Math.min(100, Math.round((voterCount / cap) * 100)) : 0;

  async function addVoters() {
    if (!selected) return;
    const entries =
      mode === "account"
        ? entryText.split(/[\s,]+/).filter(Boolean)
        : entryText
            .split(/[\r\n,]+/)
            .map((entry) => entry.trim())
            .filter(Boolean);

    if (!entries.length) {
      setAddError([
        mode === "account"
          ? "Enter at least one email or username."
          : "Enter at least one identifier.",
      ]);
      setAddResult(null);
      return;
    }

    setAdding(true);
    setAddError([]);
    setAddResult(null);
    try {
      const payload =
        mode === "account"
          ? { accounts: entries }
          : {
              identifiers: entries,
              ...(label.trim() ? { label: label.trim() } : {}),
            };
      const result = await apiFetch<AddResult>(
        token,
        `/api/elections/${selected.id}/voters`,
        { method: "POST", body: JSON.stringify(payload) },
      );
      setAddResult(result);
      setEntryText("");
      toast({
        title: `${result.added} voter${result.added === 1 ? "" : "s"} added`,
        description: `${result.skipped} skipped · ${result.total} total`,
        tone: "success",
      });
      if (result.unmatched?.length) {
        toast({
          title: `${result.unmatched.length} entr${result.unmatched.length === 1 ? "y" : "ies"} not found`,
          description: `No active account matches ${result.unmatched
            .slice(0, 5)
            .join(", ")}${result.unmatched.length > 5 ? "…" : ""}.`,
          tone: "warning",
        });
      }
      voters.reload();
    } catch (cause) {
      const split = splitError(cause);
      setAddError(split.form.length ? split.form : [split.message]);
    } finally {
      setAdding(false);
    }
  }

  async function confirmRemove() {
    if (!removing || !selected) return;
    setRemovePending(true);
    try {
      await apiFetch(token, `/api/elections/${selected.id}/voters/${removing.id}`, {
        method: "DELETE",
      });
      toast({ title: "Voter removed", description: removing.unique_key, tone: "success" });
      setRemoving(null);
      voters.reload();
    } catch (cause) {
      const split = splitError(cause);
      toast({ title: "Voter could not be removed", description: split.message, tone: "error" });
    } finally {
      setRemovePending(false);
    }
  }

  async function regenerateShare() {
    if (!selected) return;
    setSharePending(true);
    setShareError("");
    try {
      const result = await apiFetch<ShareTokenPayload>(
        token,
        `/api/elections/${selected.id}/share-token`,
        { method: "POST", body: JSON.stringify({ expires_in_days: 30 }) },
      );
      setShare(result);
      setCopied(false);
      setShareOpen(false);
      toast({ title: "New share link generated", description: result.invite_path, tone: "success" });
    } catch (cause) {
      const split = splitError(cause);
      setShareError(split.message);
      setShareOpen(false);
      toast({ title: "Share link failed", description: split.message, tone: "error" });
    } finally {
      setSharePending(false);
    }
  }

  async function copyInvite() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast({ title: "Copied", tone: "success" });
    } catch {
      toast({
        title: "Copy failed",
        description: "Select the link and copy it manually.",
        tone: "error",
      });
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
          description="Voter management is scoped to the elections you administer, and that list did not load. Retry to try again."
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
          <Section
            title="Election details"
            description="Everything about this election: schedule, rules, ballot and live participation."
          >
            {overview.loading && !overview.data ? (
              <Skeleton className="h-48 w-full" />
            ) : overview.error && !overview.data ? (
              <ErrorBanner message={overview.error} onRetry={overview.reload} />
            ) : detail ? (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  {detail.image_url ? (
                    <img
                      src={detail.image_url}
                      alt=""
                      className="h-28 w-full shrink-0 rounded-nv-md border border-nv-line object-cover sm:h-32 sm:w-48"
                    />
                  ) : (
                    <div
                      className="nv-grad-candidate nv-dots h-28 w-full shrink-0 rounded-nv-md text-nv-navy sm:h-32 sm:w-48"
                      aria-hidden="true"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={detail.lifecycle_status} />
                      <Badge variant="outline">
                        {detail.visibility === "private"
                          ? "Private"
                          : detail.visibility === "unlisted"
                            ? "Unlisted"
                            : "Public"}
                      </Badge>
                      {detail.is_published ? (
                        <Badge variant="secondary">Published</Badge>
                      ) : (
                        <Badge variant="outline">Unpublished</Badge>
                      )}
                    </div>
                    <h2 className="text-fluid-lg font-bold text-nv-ink">{detail.title}</h2>
                    {detail.description ? (
                      <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-nv-muted">
                        {detail.description}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-x-6 gap-y-1">
                      {detail.status === "upcoming" && detail.campaign_end_at ? (
                        <Countdown target={detail.campaign_end_at} prefix="Campaign closes in" />
                      ) : null}
                      {detail.status === "upcoming" && detail.voting_start_at ? (
                        <Countdown target={detail.voting_start_at} prefix="Voting opens in" />
                      ) : null}
                      {detail.status === "active" && detail.voting_end_at ? (
                        <Countdown target={detail.voting_end_at} prefix="Voting closes in" />
                      ) : null}
                    </div>
                  </div>
                </div>

                <KeyValueList
                  columns={3}
                  items={[
                    {
                      label: "Campaign window",
                      value: windowText(detail.campaign_start_at, detail.campaign_end_at),
                      block: true,
                    },
                    {
                      label: "Voting window",
                      value: windowText(detail.voting_start_at, detail.voting_end_at),
                      block: true,
                    },
                    { label: "Timezone", value: detail.timezone || "Not set" },
                    {
                      label: "Eligibility policy",
                      value: humanize(detail.eligibility_policy),
                    },
                    {
                      label: "Capacity",
                      value:
                        detail.capacity_mode === "open"
                          ? "Unlimited · public"
                          : detail.max_voters
                            ? `Restricted · up to ${detail.max_voters.toLocaleString()} voters`
                            : "Restricted",
                    },
                    {
                      label: "Voter identification",
                      value: detail.voter_id_label
                        ? `${humanize(detail.voter_id_method)} — ${detail.voter_id_label}`
                        : humanize(detail.voter_id_method),
                    },
                    {
                      label: "Result visibility",
                      value: humanize(detail.result_visibility),
                    },
                    {
                      label: "Secret ballot",
                      value: detail.secret_ballot ? "Yes — votes are anonymous" : "No",
                    },
                    {
                      label: "Ballot size",
                      value: `${detail ? (overview.data?.counts.positions ?? 0) : 0} position${
                        (overview.data?.counts.positions ?? 0) === 1 ? "" : "s"
                      } · ${(overview.data?.counts.candidates ?? 0).toLocaleString()} candidates`,
                    },
                    {
                      label: "Participation",
                      value: `${(overview.data?.counts.votes ?? 0).toLocaleString()} votes cast · ${(
                        overview.data?.counts.eligible_voters ?? 0
                      ).toLocaleString()} eligible voters`,
                      block: true,
                    },
                    ...(detail.rules_text
                      ? [
                          {
                            label: "Voting rules (who may vote)",
                            value: detail.rules_text,
                            block: true,
                          },
                        ]
                      : []),
                  ]}
                />

                <div>
                  <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Candidates on the ballot
                  </h3>
                  {positions.length === 0 ? (
                    <p className="text-[13px] text-nv-muted">
                      No positions or candidates have been added yet. Use Add election or the
                      campaign workspace to build the ballot.
                    </p>
                  ) : (
                    <div className="space-y-5">
                      {positions.map((position) => (
                        <div key={position.id}>
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="text-[14px] font-bold text-nv-ink">{position.name}</p>
                            <span className="nums-tabular text-[12px] text-nv-muted">
                              {position.candidates.length} candidate
                              {position.candidates.length === 1 ? "" : "s"} ·{" "}
                              {position.voter_group_label} · max {position.max_winners} winner
                              {position.max_winners === 1 ? "" : "s"}
                            </span>
                          </div>
                          {position.candidates.length === 0 ? (
                            <p className="mt-1 text-[12.5px] text-nv-muted">
                              No approved candidates yet.
                            </p>
                          ) : (
                            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                              {position.candidates.map((candidate) => (
                                <li
                                  key={candidate.id}
                                  className="flex gap-3 rounded-nv-md border border-nv-line bg-nv-bg p-3"
                                >
                                  <Avatar
                                    name={candidate.user.full_name || candidate.user.username}
                                    src={candidate.photo_url}
                                    size={44}
                                    className="shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-semibold text-nv-ink">
                                      {candidate.user.full_name || candidate.user.username}
                                    </p>
                                    {candidate.slogan ? (
                                      <p className="text-[12px] text-nv-primary">
                                        {candidate.slogan}
                                      </p>
                                    ) : null}
                                    {candidate.manifesto ? (
                                      <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-nv-muted">
                                        {candidate.manifesto}
                                      </p>
                                    ) : null}
                                  </div>
                                  <Badge
                                    variant={candidate.approved ? "secondary" : "outline"}
                                    className="h-fit shrink-0"
                                  >
                                    {candidate.approved ? "Approved" : "Pending"}
                                  </Badge>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </Section>

          {NOT_OPEN_STATUSES.has(selected.status) ? (
            <div
              role="status"
              className="rounded-nv-md border border-nv-line bg-nv-bg p-4 text-[13.5px] text-nv-text"
            >
              This election has not opened yet (status{" "}
              <span className="font-semibold text-nv-ink">{humanize(selected.status)}</span>).
              Eligible voters can be prepared now, but nobody can cast a ballot until an
              administrator moves the election to OPEN inside its voting window.
            </div>
          ) : null}

          <Section
            title="Eligible voters"
            description="Everyone who may cast a ballot in this election, added by account or by identifier."
          >
            <div className="space-y-5">
              {voters.error ? (
                <ErrorBanner message={voters.error} onRetry={voters.reload} />
              ) : null}

              {voters.loading && !voters.data ? (
                <Skeleton className="h-40 w-full" />
              ) : voterRows.length === 0 ? (
                <EmptyState
                  icon={<UserPlus className="h-5 w-5" aria-hidden="true" />}
                  title="No eligible voters yet"
                  description="For a limited election, add the people who may vote by email or username. Use identifiers such as student IDs when you only know their membership number."
                  action={
                    <Button
                      variant="outline"
                      size="dense"
                      className="w-auto"
                      onClick={() => {
                        const field = document.getElementById("officer-voter-entries");
                        field?.focus();
                        field?.scrollIntoView({ block: "center" });
                      }}
                    >
                      <UserPlus className="h-4 w-4" aria-hidden="true" />
                      Add voters
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Voter</TableHead>
                        <TableHead>Key</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Added</TableHead>
                        <TableHead>
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {voterRows.map((voter) => (
                        <TableRow key={voter.id}>
                          <TableCell className="text-[13px]">
                            <span className="block font-semibold text-nv-ink">
                              {voter.user ? voter.user.full_name : voter.label || "Identifier entry"}
                            </span>
                            <span className="block text-[12px] text-nv-muted">
                              {voter.user ? voter.user.username : "No linked account"}
                            </span>
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-nv-bg px-1.5 py-0.5 text-[12px] text-nv-text">
                              {shortKey(voter.unique_key)}
                            </code>
                          </TableCell>
                          <TableCell className="text-[12.5px] text-nv-muted">
                            {displayValue(voter.label)}
                          </TableCell>
                          <TableCell className="nums-tabular whitespace-nowrap text-[12.5px]">
                            {displayValue(voter.created_at)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="outline"
                              size="dense"
                              className="w-auto text-nv-danger"
                              onClick={() => setRemoving(voter)}
                            >
                              Remove
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="rounded-nv-md border border-nv-line bg-nv-bg p-4">
                <p className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                  How voters are identified
                </p>
                <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-3">
                  <div>
                    <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                      Eligibility policy
                    </dt>
                    <dd className="mt-1 text-[14px] font-medium text-nv-text">
                      {detail ? humanize(detail.eligibility_policy) : "Not available yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                      Voter id method
                    </dt>
                    <dd className="mt-1 text-[14px] font-medium text-nv-text">
                      {detail ? humanize(detail.voter_id_method) : "Not available yet"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                      What voters type
                    </dt>
                    <dd className="mt-1 text-[14px] font-medium text-nv-text">
                      {detail && detail.voter_id_label
                        ? displayValue(detail.voter_id_label)
                        : "Their account sign-in"}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-[12.5px] text-nv-muted">
                  Values entered below are matched against this method at voting time. Identifiers
                  are stored only as one-way salted hashes, so they cannot be read back here.
                </p>
              </div>

              <div className="space-y-4 rounded-nv-md border border-nv-line bg-nv-bg p-4">
                <p className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                  Add eligible voters
                </p>

                <FormAlert messages={addError} />

                <RadioGroup
                  label="Add by"
                  name="voter-mode"
                  value={mode}
                  onChange={(value) => {
                    setMode(value);
                    setAddError([]);
                  }}
                  options={[
                    {
                      value: "account",
                      label: "By email or username",
                      description: "Email addresses or usernames of people who already have accounts.",
                    },
                    {
                      value: "identifier",
                      label: "By identifier (student ID / membership number / employee ID)",
                      description: "Matched against what a voter types at voting time.",
                    },
                  ]}
                />

                <Textarea
                  id="officer-voter-entries"
                  label={mode === "account" ? "Emails or usernames" : "Identifiers"}
                  required
                  value={entryText}
                  onChange={(event) => setEntryText(event.target.value)}
                  placeholder={
                    mode === "account"
                      ? "alice@school.edu, bob\ncharlie"
                      : "S12345, S12346\nE-778"
                  }
                  hint={
                    mode === "account"
                      ? "Comma or newline separated, up to 500 per request. Each person must already have an account."
                      : "Comma or newline separated, up to 500 per request. Identifiers are stored only as one-way salted hashes, so they cannot be read back."
                  }
                />

                {mode === "identifier" ? (
                  <div>
                    <Input
                      label="Batch label (optional)"
                      value={label}
                      maxLength={200}
                      placeholder="Year 2 · Science block"
                      onChange={(event) => setLabel(event.target.value)}
                    />
                    <p className="mt-1 text-[12px] text-nv-muted">
                      Tags everyone in this batch so you can recognise them in the list.
                    </p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    size="dense"
                    className="w-auto"
                    onClick={() => void addVoters()}
                    disabled={adding}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden="true" />
                    {adding ? "Adding…" : "Add voters"}
                  </Button>
                  <p className="text-[12.5px] text-nv-muted">
                    Up to 500 entries are accepted per request; split larger batches.
                  </p>
                </div>

                {addResult ? (
                  <div
                    role="status"
                    className="rounded-nv-md border border-nv-success/40 bg-nv-success/10 p-3 text-[13px] text-nv-success"
                  >
                    <span className="nums-tabular font-semibold">{addResult.added}</span> added ·{" "}
                    <span className="nums-tabular font-semibold">{addResult.skipped}</span>{" "}
                    skipped ·{" "}
                    <span className="nums-tabular font-semibold">{addResult.total}</span> total on
                    this election.
                    {addResult.unmatched?.length ? (
                      <span className="mt-1 block font-medium">
                        {addResult.unmatched.length} entr
                        {addResult.unmatched.length === 1 ? "y" : "ies"} did not match any active
                        account: {addResult.unmatched.slice(0, 5).join(", ")}
                        {addResult.unmatched.length > 5 ? "…" : ""}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </Section>

          <Section
            title="Capacity"
            description="How many people this election admits, and where the limit is enforced."
          >
            <div className="space-y-4">
              {overview.error ? (
                <p className="text-[13px] text-nv-muted">
                  Capacity settings could not be read in detail for this election, so the summary
                  below falls back to the managed-election list.
                </p>
              ) : null}

              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                <div>
                  <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Capacity mode
                  </dt>
                  <dd className="mt-1 text-[14px] font-medium text-nv-text">
                    {detail ? humanize(detail.capacity_mode) : "Not available yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Maximum voters
                  </dt>
                  <dd className="nums-tabular mt-1 text-[14px] font-medium text-nv-text">
                    {detail
                      ? cap
                        ? cap.toLocaleString()
                        : "No declared cap"
                      : "Not available yet"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Eligible list size
                  </dt>
                  <dd className="nums-tabular mt-1 text-[14px] font-medium text-nv-text">
                    {voterCount.toLocaleString()}
                  </dd>
                </div>
              </dl>

              {cap && cap > 0 ? (
                <div className="space-y-2">
                  <Progress
                    value={usagePercent}
                    className="h-2.5"
                    aria-label={`${voterCount} of ${cap} voter slots used`}
                  />
                  <p className="nums-tabular text-[12.5px] text-nv-muted">
                    {voterCount.toLocaleString()} of {cap.toLocaleString()} voter slots used (
                    {usagePercent}%).
                  </p>
                </div>
              ) : null}

              <p className="text-[13px] text-nv-muted">
                {cap
                  ? "The voter cap is checked when a ballot is submitted: once the cap is reached, further ballots are rejected even if the eligible list is shorter."
                  : "This election has no declared voter cap, so eligibility is decided by the list above and the election's eligibility policy."}
              </p>
            </div>
          </Section>

          <Section
            title="Share link for voters"
            description="A direct link to this election. Voters open it, sign in, review the candidates and cast their ballot."
          >
            <div className="space-y-4">
              <p className="text-[13.5px] text-nv-muted">
                {detail?.visibility === "private" || selected.visibility === "private"
                  ? "This election is private: voters need this link before they can even open it. Regenerating replaces the current link immediately, so anyone holding the old address loses access."
                  : "Send this link to voters so they land directly on this election. They still sign in and must satisfy the eligibility rules before a ballot is accepted."}
              </p>

              {shareError ? <ErrorBanner message={shareError} /> : null}

              <div className="flex flex-wrap gap-2">
                <Button
                  size="dense"
                  className="w-auto"
                  onClick={() => setShareOpen(true)}
                  disabled={sharePending}
                >
                  <Link2 className="h-4 w-4" aria-hidden="true" />
                  Generate share link
                </Button>
                <LinkButton
                  href={`/elections/${selected.slug}${share ? `?invite=${share.share_token}` : ""}`}
                  variant="outline"
                  className="w-auto"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open election page
                </LinkButton>
              </div>

              {share ? (
                <div className="space-y-2">
                  <p className="text-[12px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                    Link to send to voters
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      readOnly
                      value={shareUrl}
                      aria-label="Share link"
                      containerClassName="min-w-0 flex-1"
                      className="text-[13px]"
                    />
                    <Button
                      variant="outline"
                      size="dense"
                      className="w-auto"
                      onClick={() => void copyInvite()}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-nv-success" aria-hidden="true" />
                      ) : (
                        <Copy className="h-4 w-4" aria-hidden="true" />
                      )}
                      {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-[12.5px] text-nv-muted">
                    {copied ? "Copied to the clipboard. " : ""}
                    Expires {displayValue(share.expires_at)}. Voters who open this link see the
                    election page with the rules, candidates and live countdowns, then sign in to
                    vote.
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-nv-muted">
                  No link has been generated in this session. Generating creates a token that is
                  valid for 30 days and shows the exact address to send to voters.
                </p>
              )}

              <p className="text-[12.5px] text-nv-muted">
                The share link only opens the election page — voters still have to satisfy the
                eligibility rules of this election before a ballot is accepted. Voting window:{" "}
                {windowText(
                  detail?.voting_start_at ?? selected.voting_start_at,
                  detail?.voting_end_at ?? selected.voting_end_at,
                )}
                .
              </p>
            </div>
          </Section>
        </>
      ) : (
        <EmptyState
          title="No election selected"
          description="Choose one of your elections above to manage its voters, capacity and share link."
          action={<PickElectionAction />}
        />
      )}

      <AlertDialog
        open={shareOpen}
        onOpenChange={(next) => {
          if (!next) setShareOpen(false);
        }}
        title="Generate a new share link?"
        description="A fresh token is created and valid for 30 days. Any previously generated link stops working immediately."
        confirmLabel="Regenerate link"
        loading={sharePending}
        onConfirm={() => void regenerateShare()}
      />

      <AlertDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (!next) setRemoving(null);
        }}
        title="Remove this eligible voter?"
        description={
          removing
            ? `${removing.unique_key} will lose access to this election's ballot. You can add it again later.`
            : undefined
        }
        confirmLabel="Remove voter"
        tone="destructive"
        loading={removePending}
        onConfirm={() => void confirmRemove()}
      />
    </div>
  );
}
