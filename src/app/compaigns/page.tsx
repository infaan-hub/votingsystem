"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Clapperboard, RotateCw, UserRound } from "lucide-react";

import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { FilterSelect, SearchInput } from "@/src/components/ui/filters";
import { LinkButton } from "@/src/components/ui/page-header";
import { PageHero } from "@/src/components/page-hero";
import { Skeleton } from "@/src/components/ui/skeleton";

type Campaign = {
  id: number;
  topic: string;
  description: string | null;
  status: string;
  start_at: string | null;
  end_at: string | null;
  image_url: string | null;
  video_url: string | null;
  video_duration_seconds: number | null;
  election: { id: number; slug: string; title: string; status: string };
  candidate: {
    id: number;
    slogan: string | null;
    photo_url: string | null;
    party: { id: number; name: string; code: string; color: string } | null;
    user: { username: string; full_name: string };
  };
};

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function CampaignsContent() {
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [electionFilter, setElectionFilter] = useState(
    () => searchParams.get("election") ?? "",
  );
  const [active, setActive] = useState<Campaign | null>(null);

  const load = useCallback(async () => {
    setCampaigns(null);
    setError("");
    try {
      const response = await fetch("/api/campaigns");
      if (!response.ok) {
        throw new Error("We could not load campaigns right now. Please try again.");
      }
      const data = (await response.json()) as Campaign[];
      setCampaigns(Array.isArray(data) ? data : []);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "We could not load campaigns right now. Please try again.",
      );
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const electionOptions = useMemo(() => {
    if (!campaigns) return [];
    const seen = new Map<number, string>();
    for (const campaign of campaigns) {
      if (!seen.has(campaign.election.id)) {
        seen.set(campaign.election.id, campaign.election.title);
      }
    }
    return [...seen.entries()].map(([value, label]) => ({
      value: String(value),
      label,
    }));
  }, [campaigns]);

  const filtered = useMemo(() => {
    if (!campaigns) return [];
    const needle = query.trim().toLowerCase();
    return campaigns.filter((campaign) => {
      if (electionFilter && String(campaign.election.id) !== electionFilter) return false;
      if (!needle) return true;
      return (
        campaign.topic.toLowerCase().includes(needle) ||
        campaign.candidate.user.full_name.toLowerCase().includes(needle) ||
        campaign.candidate.user.username.toLowerCase().includes(needle) ||
        (campaign.description ?? "").toLowerCase().includes(needle)
      );
    });
  }, [campaigns, query, electionFilter]);

  return (
    <div className="space-y-6">
      <PageHero
        title="Campaigns"
        description="Manifestos and campaign videos candidates publish before their election opens for voting."
        className="-mt-6"
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder="Search by topic or candidate"
        />
        <FilterSelect
          value={electionFilter}
          onChange={setElectionFilter}
          options={electionOptions}
          label="Filter by election"
          placeholder="All elections"
        />
      </div>

      {error ? (
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
      ) : null}

      {campaigns === null && !error ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2, 3, 4, 5].map((card) => (
            <div key={card} className="space-y-3 rounded-nv-md border border-nv-line bg-nv-surface p-5">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : null}

      {!error && campaigns !== null && filtered.length === 0 ? (
        <EmptyState
          icon={<Clapperboard className="h-6 w-6" aria-hidden="true" />}
          title={query || electionFilter ? "No campaigns match these filters" : "No campaigns published yet"}
          description={
            query || electionFilter
              ? "Adjust the search or election filter to see more campaign posts."
              : "While an election is in its campaign period, candidates publish manifestos and videos here. Check back once nominations open, or browse the elections themselves."
          }
          action={
            query || electionFilter ? (
              <Button
                variant="outline"
                onClick={() => {
                  setQuery("");
                  setElectionFilter("");
                }}
              >
                Clear filters
              </Button>
            ) : (
              <Button asChild>
                <Link href="/elections">Browse elections</Link>
              </Button>
            )
          }
        />
      ) : null}

      {!error && filtered.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((campaign) => (
            <button
              key={campaign.id}
              type="button"
              onClick={() => setActive(campaign)}
              className="flex h-full flex-col overflow-hidden rounded-nv-md border border-nv-line bg-nv-surface text-left shadow-nv-card transition-shadow hover:shadow-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary"
            >
              {campaign.image_url || campaign.candidate.photo_url ? (
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-nv-bg">
                  <img
                    src={campaign.image_url ?? campaign.candidate.photo_url ?? ""}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  {campaign.video_url ? (
                    <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[11px] font-bold text-white">
                      <Clapperboard className="h-3 w-3" aria-hidden="true" />
                      {campaign.video_duration_seconds
                        ? formatDuration(campaign.video_duration_seconds)
                        : "Video"}
                    </span>
                  ) : null}
                </div>
              ) : (
                <div className="nv-grad-candidate grid aspect-[16/10] w-full place-items-center">
                  <Avatar
                    name={campaign.candidate.user.full_name || campaign.candidate.user.username}
                    size={64}
                  />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-2 p-5">
                <p className="text-fluid-lg leading-snug text-nv-ink">{campaign.topic}</p>
                <p className="flex items-center gap-2 text-[13px] text-nv-muted">
                  <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  {campaign.candidate.user.full_name || campaign.candidate.user.username}
                  {campaign.candidate.party ? (
                    <Badge variant="secondary" className="text-[10px]">
                      {campaign.candidate.party.code || campaign.candidate.party.name}
                    </Badge>
                  ) : null}
                </p>
                <p className="truncate text-[12.5px] text-nv-muted">{campaign.election.title}</p>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      <Dialog
        open={active !== null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
        title={active?.topic ?? ""}
        description={
          active
            ? `${active.candidate.user.full_name || active.candidate.user.username} · ${active.election.title}`
            : undefined
        }
        footer={
          active ? (
            <LinkButton href={`/elections/${active.election.slug}`} className="sm:w-auto">
              View election
            </LinkButton>
          ) : null
        }
      >
        {active?.video_url ? (
          <video
            controls
            preload="metadata"
            playsInline
            poster={active.image_url ?? undefined}
            src={active.video_url}
            className="mb-3 w-full rounded-nv-md bg-black"
          />
        ) : null}
        {active?.candidate.slogan ? (
          <p className="mb-2 text-[13px] font-semibold text-nv-primary">{active.candidate.slogan}</p>
        ) : null}
        {active?.description ? (
          <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-nv-text">
            {active.description}
          </p>
        ) : (
          <p className="text-[13.5px] text-nv-muted">No description was provided.</p>
        )}
      </Dialog>
    </div>
  );
}

export default function CampaignsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6" aria-busy="true">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-11 w-full sm:max-w-md" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <Skeleton key={card} className="h-80 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <CampaignsContent />
    </Suspense>
  );
}
