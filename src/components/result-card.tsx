"use client";

import { useState } from "react";
import { ChevronDown, Trophy } from "lucide-react";

import { BrandLogo } from "@/src/components/brand-logo";
import { Avatar } from "@/src/components/ui/avatar";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

export type ResultCardCandidate = {
  candidate_id: number;
  name: string;
  photo_url: string | null;
  slogan: string;
  position_name: string;
  votes: number;
  percentage: number;
};

export type ResultCardPayload = {
  election: {
    id: number;
    slug: string;
    title: string;
    status: string;
    lifecycle_status: string;
    voting_end_at: string | null;
    published: boolean;
    result_published_at: string | null;
  };
  winner: ResultCardCandidate | null;
  candidates: ResultCardCandidate[];
  totals: { votes: number; candidates: number };
};

function voteLabel(count: number): string {
  return `${count.toLocaleString()} vote${count === 1 ? "" : "s"}`;
}

/**
 * The one result card. The officer preview and the page opened from the
 * published notification render the same payload through this same component,
 * so what an officer previews is exactly what voters receive.
 *
 * Layout follows the product spec: small NexVote logo top-left, election
 * name, the winner in large green type, the winner's photo, their name, the
 * votes and share, then a "Show full result" toggle that reveals every
 * candidate with photo, name, votes and percentage.
 */
export function ResultCard({ card, className }: { card: ResultCardPayload; className?: string }) {
  const [showAll, setShowAll] = useState(false);
  const winner = card.winner;

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="space-y-5 p-5 sm:p-6">
        {/* Small NexVote logo, top-left. */}
        <div className="flex items-center justify-between gap-3">
          <BrandLogo className="h-9 w-auto" />
          {card.election.published ? (
            <Badge variant="success" className="shrink-0">
              Published
            </Badge>
          ) : (
            <Badge variant="muted" className="shrink-0">
              Preview
            </Badge>
          )}
        </div>

        {/* Election name. */}
        <div className="space-y-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-nv-muted">
            Election result
          </p>
          <h2 className="text-fluid-lg leading-snug text-nv-ink">{card.election.title}</h2>
        </div>

        {winner ? (
          <div className="space-y-4 text-center">
            {/* Winner in large green type. */}
            <p className="text-[26px] font-extrabold leading-tight tracking-tight text-nv-success sm:text-[30px]">
              {winner.name}
            </p>

            {/* Winner's front image. */}
            <Avatar
              name={winner.name}
              src={winner.photo_url}
              size={132}
              square
              className="mx-auto rounded-2xl border border-nv-line"
            />

            {/* Winner's name… */}
            <p className="text-[17px] font-bold text-nv-ink">{winner.name}</p>

            {/* …with the votes and share received. */}
            <p className="nums-tabular text-[13px] text-nv-muted">
              {voteLabel(winner.votes)} · {winner.percentage.toFixed(1)}% of the vote
            </p>
          </div>
        ) : (
          <p className="rounded-nv-md border border-nv-line bg-nv-bg p-4 text-center text-[13px] text-nv-muted">
            No votes were cast in this election yet.
          </p>
        )}

        {card.candidates.length > 0 ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => setShowAll((value) => !value)}
              aria-expanded={showAll}
            >
              <Trophy className="h-4 w-4" aria-hidden="true" />
              {showAll ? "Hide full result" : "Show full result"}
              <ChevronDown
                className={cn("h-4 w-4 transition-transform", showAll && "rotate-180")}
                aria-hidden="true"
              />
            </Button>

            {showAll ? (
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-nv-muted">
                  Full result · {card.totals.candidates} candidate
                  {card.totals.candidates === 1 ? "" : "s"} · {voteLabel(card.totals.votes)} counted
                </p>
                <ul className="divide-y divide-nv-line rounded-nv-md border border-nv-line bg-nv-bg">
                  {card.candidates.map((candidate, index) => (
                    <li
                      key={candidate.candidate_id}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      <span className="nums-tabular w-4 shrink-0 text-center text-[12px] font-bold text-nv-muted">
                        {index + 1}
                      </span>
                      <Avatar
                        name={candidate.name}
                        src={candidate.photo_url}
                        size={44}
                        className="shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-nv-ink">
                          {candidate.name}
                        </span>
                        <span className="block truncate text-[12px] text-nv-muted">
                          {candidate.position_name}
                          {candidate.slogan ? ` · ${candidate.slogan}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="nums-tabular block text-[13.5px] font-bold text-nv-ink">
                          {candidate.votes.toLocaleString()}
                        </span>
                        <span className="nums-tabular block text-[12px] text-nv-muted">
                          {candidate.percentage.toFixed(1)}%
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-center text-[12.5px] text-nv-muted">
            Nothing has been tallied yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
