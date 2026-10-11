import Link from "next/link";
import { Star } from "lucide-react";

import { cn } from "@/src/lib/utils";

export type CandidateCardData = {
  id: number;
  name: string;
  /** Group/party label; omitted when the ballot is non-partisan. */
  party?: string | null;
  /** Two-letter or emblem short code for the badge. */
  partyCode?: string | null;
  role?: string | null;
  photoUrl?: string | null;
  href?: string;
  /** Approve/rating percentage, shown as a chip on "most upvoted" cards. */
  rating?: number | null;
};

/**
 * 96x120 rounded photo card with a party badge at the top-left and name/role
 * below. Used in horizontally scrolling rows. `featured` renders the gradient
 * crimson variant used for "most upvoted" candidates.
 */
export function CandidateCard({
  candidate,
  featured = false,
  className,
}: {
  candidate: CandidateCardData;
  featured?: boolean;
  className?: string;
}) {
  const href = candidate.href ?? `/candidates/${candidate.id}`;
  const initials = candidate.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <Link
      href={href}
      className={cn(
        "group block w-[104px] shrink-0 rounded-nv-md transition-transform duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nv-primary focus-visible:ring-offset-2",
        "active:scale-[0.97]",
        className,
      )}
    >
      <div
        className={cn(
          "relative h-[120px] w-[96px] overflow-hidden rounded-nv-md shadow-nv-card",
          featured ? "nv-grad-candidate" : "bg-nv-surface",
        )}
      >
        {candidate.photoUrl ? (
          // Plain <img>: candidate media is tenant-supplied and already served
          // through the application's own media route.
          <img
            src={candidate.photoUrl}
            alt=""
            width={96}
            height={120}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "flex h-full w-full items-center justify-center text-2xl font-bold",
              featured ? "text-white/85" : "text-nv-muted",
            )}
          >
            {initials || "?"}
          </span>
        )}

        {candidate.partyCode ? (
          <span
            className={cn(
              "absolute left-1.5 top-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide",
              featured
                ? "bg-white/90 text-nv-primary"
                : "bg-nv-primary text-white",
            )}
          >
            {candidate.partyCode}
          </span>
        ) : null}

        {candidate.rating != null ? (
          <span className="absolute bottom-1.5 right-1.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-bold text-white backdrop-blur-sm">
            <Star className="h-3 w-3 fill-nv-warning text-nv-warning" aria-hidden="true" />
            <span className="nums-tabular">{candidate.rating.toFixed(0)}%</span>
          </span>
        ) : null}
      </div>

      <p
        className={cn(
          "mt-2 truncate text-[13px] font-bold leading-4",
          featured ? "text-nv-primary" : "text-nv-ink",
        )}
      >
        {candidate.name}
      </p>
      {candidate.role ? (
        <p className="truncate text-[11px] leading-4 text-nv-muted">{candidate.role}</p>
      ) : null}
      {candidate.party && !candidate.partyCode ? (
        <p className="truncate text-[11px] leading-4 text-nv-muted">{candidate.party}</p>
      ) : null}
    </Link>
  );
}