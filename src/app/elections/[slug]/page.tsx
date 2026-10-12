"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarClock,
  Clapperboard,
  Info,
  Lock,
  RotateCw,
  Vote,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { ResultsBars, type ResultDatum } from "@/src/components/results-bars";
import { StatusBadge } from "@/src/components/status-badge";
import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Countdown } from "@/src/components/ui/countdown";
import { EmptyState } from "@/src/components/ui/empty-state";
import { LinkButton } from "@/src/components/ui/page-header";
import { KeyValueList, Section } from "@/src/components/ui/section";
import { Skeleton } from "@/src/components/ui/skeleton";

type PublicElection = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  image: string;
  image_url: string | null;
  lifecycle_status: string;
  visibility: string;
  result_visibility: string;
  category_id: number | null;
  organization_id: number | null;
  campaign_start_at: string | null;
  campaign_end_at: string | null;
  voting_start_at: string | null;
  voting_end_at: string | null;
  allow_live_results: boolean;
  announce_winners_automatically: boolean;
  status: "upcoming" | "active" | "ended";
  seconds_until_start: number;
  seconds_until_end: number;
};

type ElectionAdminDetail = {
  slug: string;
  lifecycle_status: string;
  eligibility_policy: string | null;
  result_visibility: string | null;
  secret_ballot: boolean;
  timezone: string | null;
  visibility: string;
  rules_text: string | null;
  voter_id_method: string | null;
  voter_id_label: string | null;
  capacity_mode: string | null;
  max_voters: number | null;
};

type Candidate = {
  id: number;
  user: { id: number; username: string; full_name: string };
  party: { id: number; name: string; code: string; color: string } | null;
  slogan: string | null;
  manifesto: string | null;
  photo_url: string | null;
  vote_total: number;
};

type Position = {
  id: number;
  name: string;
  description: string | null;
  voter_group_label: string;
  max_winners: number;
  candidates: Candidate[];
};

type PublicDetailResponse = {
  election: PublicElection;
  detail: ElectionAdminDetail;
  positions: Position[];
  eligibility: unknown;
};

type RankingEntry = {
  candidate_id: number;
  candidate_name: string;
  slogan: string | null;
  vote_total: number;
  is_winner: boolean;
};

type ResultsPayload = {
  stats: {
    registered_voters: number;
    votes_cast: number;
    turnout_percentage: number;
    positions: { id: number; name: string; results: RankingEntry[] }[];
  };
  winners: { position: string; scope: string; winner_names: string }[];
};

const VOTER_ID_LABELS: Record<string, string> = {
  account: "Platform account",
  email: "Email address",
  phone: "Phone number",
  membership: "Membership number",
  employee: "Employee ID",
  student_id: "Student ID",
  custom: "Custom identifier",
};

const RESULT_VISIBILITY_LABELS: Record<string, string> = {
  public: "Public",
  published: "Published",
  live: "Live during voting",
  hidden: "Hidden until finalized",
  admin_only: "Administrators only",
  officers: "Election officers only",
};

const ELIGIBILITY_LABELS: Record<string, string> = {
  all: "All eligible voters",
  voter_list: "Approved voter list",
  registered: "Registered users",
  staff: "Staff",
  student: "Students",
};

function formatDate(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function windowLabel(from: string | null, to: string | null): string {
  if (!from && !to) return "Not scheduled";
  return `${formatDate(from)} → ${formatDate(to)}`;
}

function resultsAreShown(detail: ElectionAdminDetail): boolean {
  if (detail.lifecycle_status === "RESULTS_PUBLISHED") return true;
  return (
    detail.lifecycle_status === "CLOSED" &&
    ["live", "published", "public"].includes(detail.result_visibility ?? "")
  );
}

function defaultVotingSteps(): string[] {
  return [
    "Sign in with your account before the voting window closes.",
    "Open the election and read the rules for each position.",
    "Select your choice for every position you are eligible to vote on.",
    "Review your ballot carefully — some ballots cannot be changed once submitted.",
    "Submit your ballot. Your vote is recorded anonymously and no one can see how you voted.",
  ];
}

function ElectionDetailContent() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const slug = params.slug;
  const invite = searchParams.get("invite") ?? "";

  const { token } = useApp();

  const [data, setData] = useState<PublicDetailResponse | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [categoryNames, setCategoryNames] = useState<Map<number, string>>(new Map());

  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [resultsError, setResultsError] = useState("");
  const [resultsHidden, setResultsHidden] = useState(false);
  const [resultsLoading, setResultsLoading] = useState(false);

  const load = useCallback(async () => {
    setData(null);
    setNotFound(false);
    setError("");
    const query = invite ? `?invite=${encodeURIComponent(invite)}` : "";
    try {
      const response = await fetch(`/api/elections/public/${encodeURIComponent(slug)}${query}`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (response.status === 404) {
        setNotFound(true);
        return;
      }
      if (!response.ok) {
        throw new Error("We could not load this election right now. Please try again.");
      }
      setData((await response.json()) as PublicDetailResponse);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load this election right now. Please try again.",
      );
    }
  }, [slug, invite, token]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let ignore = false;
    fetch("/api/categories")
      .then(async (response) => {
        if (!response.ok) return [] as { id: number; name: string }[];
        const list = (await response.json()) as { id: number; name: string }[];
        return Array.isArray(list) ? list : [];
      })
      .then((list) => {
        if (!ignore) setCategoryNames(new Map(list.map((entry) => [entry.id, entry.name])));
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, []);

  const election = data?.election ?? null;
  const detail = data?.detail ?? null;
  const positions = useMemo(() => data?.positions ?? [], [data]);

  const [campaignLive, setCampaignLive] = useState(false);
  useEffect(() => {
    if (!election?.campaign_end_at) {
      setCampaignLive(false);
      return;
    }
    const end = new Date(election.campaign_end_at).getTime();
    setCampaignLive(Number.isFinite(end) && end > Date.now());
  }, [election?.campaign_end_at]);

  const showResults = detail ? resultsAreShown(detail) : false;

  const loadResults = useCallback(async () => {
    if (!election) return;
    setResultsLoading(true);
    setResults(null);
    setResultsError("");
    setResultsHidden(false);
    try {
      const response = await fetch(`/api/elections/${election.id}/results`, {
        headers: token ? { Authorization: `Token ${token}` } : {},
      });
      if (response.status === 403) {
        setResultsHidden(true);
      } else if (!response.ok) {
        throw new Error("We could not load the results right now.");
      } else {
        setResults((await response.json()) as ResultsPayload);
      }
    } catch (requestError) {
      setResultsError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load the results right now.",
      );
    } finally {
      setResultsLoading(false);
    }
  }, [election, token]);

  useEffect(() => {
    if (showResults && election && !results && !resultsError && !resultsHidden && !resultsLoading) {
      void loadResults();
    }
  }, [showResults, election, results, resultsError, resultsHidden, resultsLoading, loadResults]);

  const votingOpen = election?.status === "active";
  const categoryName =
    election?.category_id !== null && election?.category_id !== undefined
      ? categoryNames.get(election.category_id) ?? null
      : null;

  const resultsByPosition = useMemo(() => {
    if (!results) return [];
    return results.stats.positions
      .filter((position) => position.results.length > 0)
      .map((position) => ({
        name: position.name,
        data: position.results.map(
          (entry): ResultDatum => ({
            id: entry.candidate_id,
            label: entry.candidate_name,
            votes: entry.vote_total,
            detail: entry.slogan ?? undefined,
          }),
        ),
      }));
  }, [results]);

  if (notFound) {
    return (
      <div className="py-8">
        <EmptyState
          icon={<Lock className="h-6 w-6" aria-hidden="true" />}
          title="Election not found"
          description="This election may be private, unlisted, or no longer available. If you were given an invitation link, make sure you opened the full URL including the invite token. Otherwise, contact the team running this platform for help."
          action={
            <>
              <Button asChild variant="outline">
                <Link href="/elections">Browse public elections</Link>
              </Button>
              <Button asChild>
                <Link href="/contact">Contact support</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
      >
        <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{error}</p>
        <Button variant="outline" size="dense" onClick={() => void load()}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Retry
        </Button>
      </div>
    );
  }

  if (!election || !detail) {
    return (
      <div className="space-y-5" aria-busy="true">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const inviteUsed = invite.trim().length > 0;

  return (
    <div className="space-y-8 pb-24 lg:pb-8">
      <Link
        href="/elections"
        className="inline-flex min-h-11 items-center gap-2 text-[13px] font-semibold text-nv-muted hover:text-nv-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to elections
      </Link>

      <header className="space-y-4">
        <div className="relative h-44 w-full overflow-hidden rounded-nv-md sm:h-56">
          {election.image_url ? (
            <img
              src={election.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="nv-grad-candidate nv-dots h-full w-full text-nv-navy" aria-hidden="true" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={detail.lifecycle_status} />
          {categoryName ? <Badge variant="secondary">{categoryName}</Badge> : null}
          <Badge variant="outline">
            <Lock className="h-3 w-3" aria-hidden="true" />
            {detail.visibility === "private" ? "Private" : "Open access"}
          </Badge>
        </div>

        <h1 className="text-display text-nv-ink">{election.title}</h1>

        {votingOpen && election.voting_end_at ? (
          <Countdown target={election.voting_end_at} prefix="Voting closes in" />
        ) : election.status === "upcoming" ? (
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {campaignLive && election.campaign_end_at ? (
              <Countdown target={election.campaign_end_at} prefix="Campaign closes in" />
            ) : null}
            {election.voting_start_at ? (
              <Countdown target={election.voting_start_at} prefix="Voting opens in" />
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {votingOpen ? (
            <LinkButton href={`/vote/${election.slug}`}>
              <Vote className="h-4 w-4" aria-hidden="true" />
              Cast your vote
            </LinkButton>
          ) : (
            <Button disabled className="sm:w-auto">
              <Vote className="h-4 w-4" aria-hidden="true" />
              {election.status === "upcoming" ? "Voting has not opened yet" : "Voting is closed"}
            </Button>
          )}
          {!votingOpen && election.status === "upcoming" ? (
            <p className="text-[13px] text-nv-muted">
              The ballot opens {formatDate(election.voting_start_at)}.
            </p>
          ) : null}
          {!votingOpen && election.status === "ended" ? (
            <p className="text-[13px] text-nv-muted">
              Voting closed {formatDate(election.voting_end_at)}.
            </p>
          ) : null}
        </div>
      </header>

      <Section title="About this election">
        {election.description ? (
          <p className="mb-5 max-w-3xl whitespace-pre-line text-[14.5px] leading-relaxed text-nv-text">
            {election.description}
          </p>
        ) : null}
        <KeyValueList
          items={[
            { label: "Campaign window", value: windowLabel(election.campaign_start_at, election.campaign_end_at), block: true },
            { label: "Voting window", value: windowLabel(election.voting_start_at, election.voting_end_at), block: true },
            { label: "Timezone", value: detail.timezone ?? "Not set" },
            { label: "Eligibility policy", value: ELIGIBILITY_LABELS[detail.eligibility_policy ?? ""] ?? detail.eligibility_policy ?? "Not set" },
            {
              label: "Capacity",
              value:
                detail.capacity_mode === "restricted"
                  ? detail.max_voters
                    ? `Restricted · up to ${detail.max_voters.toLocaleString()} voters`
                    : "Restricted"
                  : "Unlimited",
            },
            {
              label: "Result visibility",
              value: RESULT_VISIBILITY_LABELS[detail.result_visibility ?? ""] ?? detail.result_visibility ?? "Not set",
            },
            { label: "Secret ballot", value: detail.secret_ballot ? "Yes — votes are anonymous" : "No" },
            {
              label: "Voter identification",
              value: detail.voter_id_label
                ? `${VOTER_ID_LABELS[detail.voter_id_method ?? ""] ?? detail.voter_id_method ?? "Not set"} — ${detail.voter_id_label}`
                : VOTER_ID_LABELS[detail.voter_id_method ?? ""] ?? detail.voter_id_method ?? "Not set",
            },
            { label: "Invite link used", value: inviteUsed ? "Yes" : "No" },
          ]}
        />
      </Section>

      <Section title="How to vote">
        <div className="space-y-4">
          {detail.rules_text ? (
            <div className="whitespace-pre-line text-[14px] leading-relaxed text-nv-text">
              {detail.rules_text}
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-[14px] font-bold text-nv-ink">
                <Info className="h-4 w-4 text-nv-primary" aria-hidden="true" />
                General rules
              </h3>
              <ol className="list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-nv-text">
                {defaultVotingSteps().map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          )}
          <div>
            <h3 className="text-[14px] font-bold text-nv-ink">Good to know</h3>
            <ol className="mt-1.5 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed text-nv-text">
              <li>
                Campaigns run before voting opens — browse them under Campaigns while you decide.
              </li>
              <li>
                Results are announced after the voting window closes, according to this
                election&apos;s result visibility policy.
              </li>
              <li>
                Need help? Use the contact page and mention this election by name.
              </li>
            </ol>
          </div>
        </div>
      </Section>

      <Section
        title="Candidates"
        description="Everyone approved to stand in this election, grouped by position."
      >
        {positions.length === 0 ? (
          <p className="text-[13.5px] text-nv-muted">
            No positions have been published for this ballot yet.
          </p>
        ) : (
          <div className="space-y-8">
            {positions.map((position) => (
              <div key={position.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-fluid-lg text-nv-ink">{position.name}</h3>
                  <span className="nums-tabular text-[12.5px] text-nv-muted">
                    {position.candidates.length} candidate{position.candidates.length === 1 ? "" : "s"}
                    {" · "}
                    {position.voter_group_label}
                  </span>
                </div>
                {position.description ? (
                  <p className="mt-1 text-[13px] text-nv-muted">{position.description}</p>
                ) : null}
                {position.candidates.length === 0 ? (
                  <p className="mt-3 text-[13px] text-nv-muted">
                    No candidates have been approved for this position yet.
                  </p>
                ) : (
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {position.candidates.map((candidate) => (
                      <li
                        key={candidate.id}
                        className="flex gap-3 rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card"
                      >
                        <Avatar
                          name={candidate.user.full_name || candidate.user.username}
                          src={candidate.photo_url}
                          size={64}
                          className="shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[14.5px] font-bold text-nv-ink">
                              {candidate.user.full_name || candidate.user.username}
                            </p>
                            {candidate.party ? (
                              <Badge
                                className="text-[10px]"
                                style={
                                  candidate.party.color
                                    ? { backgroundColor: candidate.party.color, color: "#fff" }
                                    : undefined
                                }
                              >
                                {candidate.party.code || candidate.party.name}
                              </Badge>
                            ) : null}
                          </div>
                          {candidate.slogan ? (
                            <p className="mt-0.5 text-[12.5px] font-semibold text-nv-primary">
                              {candidate.slogan}
                            </p>
                          ) : null}
                          {candidate.manifesto ? (
                            <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-nv-muted">
                              {candidate.manifesto}
                            </p>
                          ) : null}
                          <Link
                            href={`/candidates/${candidate.id}`}
                            className="mt-2 inline-block text-[12.5px] font-bold text-nv-primary hover:underline"
                          >
                            View profile
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <div id="results">
        <Section title="Results">
        {!showResults ? (
          <p className="flex items-start gap-2 text-[13.5px] leading-relaxed text-nv-muted">
            <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {detail.lifecycle_status === "CLOSED"
              ? "Results are published when the election closes and the outcome is released by the election administrators."
              : "Results are published when the election closes. Check back after the voting window ends."}
          </p>
        ) : resultsLoading ? (
          <div className="space-y-3" aria-busy="true">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : resultsHidden ? (
          <p className="text-[13.5px] text-nv-muted">
            Results are published when the election closes. They are not visible just yet.
          </p>
        ) : resultsError ? (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-nv-md border border-nv-danger/40 bg-nv-danger/10 p-4"
          >
            <p className="min-w-0 flex-1 text-[13.5px] text-nv-danger">{resultsError}</p>
            <Button variant="outline" size="dense" onClick={() => void loadResults()}>
              <RotateCw className="h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : results ? (
          <div className="space-y-6">
            {results.winners.length > 0 ? (
              <ul className="space-y-2">
                {results.winners.map((winner) => (
                  <li
                    key={`${winner.position}-${winner.scope}`}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-nv-md bg-nv-success/10 px-4 py-3"
                  >
                    <span className="text-[13px] font-semibold text-nv-muted">
                      {winner.position}
                      {winner.scope ? ` · ${winner.scope}` : ""}
                    </span>
                    <span className="text-[14.5px] font-bold text-nv-ink">
                      {winner.winner_names}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {resultsByPosition.map((position) => (
              <div key={position.name}>
                <h3 className="mb-3 text-[13px] font-bold uppercase tracking-[0.4px] text-nv-muted">
                  {position.name}
                </h3>
                <ResultsBars data={position.data} />
              </div>
            ))}
            {resultsByPosition.length === 0 && results.winners.length === 0 ? (
              <p className="text-[13.5px] text-nv-muted">
                Results have been released, but no vote totals were recorded.
              </p>
            ) : null}
          </div>
        ) : null}
        </Section>
      </div>

      <Section
        title="Campaigns"
        description="Manifestos and videos candidates published while the campaign window was open."
      >
        <div className="flex flex-wrap items-center gap-2">
          <LinkButton href={`/compaigns?election=${election.id}`} variant="ghost" className="sm:w-auto">
            <Clapperboard className="h-4 w-4" aria-hidden="true" />
            View campaigns for this election
          </LinkButton>
          <LinkButton href="/compaigns" variant="outline" className="sm:w-auto">
            All campaigns
          </LinkButton>
        </div>
      </Section>

      {votingOpen ? (
        <div className="fixed inset-x-0 bottom-16 z-40 border-t border-nv-line bg-nv-surface/95 px-4 py-3 shadow-panel backdrop-blur lg:bottom-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13.5px] font-bold text-nv-ink">{election.title}</p>
              {election.voting_end_at ? (
                <Countdown target={election.voting_end_at} prefix="Closes in" />
              ) : null}
            </div>
            <LinkButton href={`/vote/${election.slug}`} className="shrink-0">
              <Vote className="h-4 w-4" aria-hidden="true" />
              Vote now
            </LinkButton>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ElectionDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5" aria-busy="true">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      }
    >
      <ElectionDetailContent />
    </Suspense>
  );
}
