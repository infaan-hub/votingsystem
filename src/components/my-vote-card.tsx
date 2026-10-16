"use client";

import { CheckCircle2, Hourglass } from "lucide-react";

import { Badge } from "@/src/components/ui/badge";
import type { MyVote } from "@/src/lib/my-vote";
import { cn } from "@/src/lib/utils";

/**
 * The voter's own recorded choices, shown while the results are still
 * pending. Only the signed-in voter's ballot is ever passed in here; the
 * public tally stays hidden until it is officially published.
 */
export function MyVoteCard({
  myVote,
  className,
}: {
  myVote: MyVote | null | undefined;
  className?: string;
}) {
  if (!myVote?.has_voted || myVote.votes.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-nv-md border border-nv-line bg-nv-surface p-4 shadow-nv-card sm:p-5",
        className,
      )}
    >
      <h3 className="flex items-center gap-2 text-[14px] font-bold text-nv-ink">
        <CheckCircle2 className="h-4 w-4 text-nv-success" aria-hidden="true" />
        Your vote
      </h3>
      <p className="mt-1 text-[12.5px] leading-relaxed text-nv-muted">
        Only you can see this. Your ballot is recorded and cannot be changed.
      </p>

      <ul className="mt-3 divide-y divide-nv-line">
        {myVote.votes.map((vote) => (
          <li
            key={vote.position_id}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
          >
            <span className="text-[13px] font-semibold text-nv-muted">
              {vote.position_name}
            </span>
            <span className="flex items-center gap-2 text-[14px] font-bold text-nv-ink">
              {vote.choice}
              {vote.party_code ? (
                <Badge className="text-[10px]">{vote.party_code}</Badge>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-3 flex items-start gap-1.5 text-[12.5px] leading-relaxed text-nv-muted">
        <Hourglass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-nv-primary" aria-hidden="true" />
        Results are still pending — you will be notified the moment the election
        officers publish them.
      </p>
    </div>
  );
}
