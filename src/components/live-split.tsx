import { cn } from "@/src/lib/utils";

export type LiveSplitEntry = {
  id: string;
  name: string;
  photoUrl?: string | null;
  votes: number;
};

/**
 * Head-to-head hero: two candidates with live vote counts and an animated bar
 * between them. Scales to N candidates by rendering a split card per pair, and
 * the schemas always print the exact numbers so the graphic is never the only
 * source of truth.
 */
export function LiveSplit({ entries }: { entries: LiveSplitEntry[] }) {
  const total = entries.reduce((sum, entry) => sum + entry.votes, 0);
  const [leader, challenger] = entries;

  if (!leader || !challenger) return null;

  const leaderPct = total > 0 ? (leader.votes / total) * 100 : 50;
  const challengerPct = total > 0 ? 100 - leaderPct : 50;

  return (
    <div className="rounded-nv-lg bg-nv-surface p-4 shadow-nv-card">
      <div className="flex items-center justify-between gap-3">
        <SplitSide entry={leader} pct={leaderPct} align="left" leading />
        <span className="nums-tabular shrink-0 text-[11px] font-bold uppercase tracking-wide text-nv-muted">
          Live
        </span>
        <SplitSide entry={challenger} pct={challengerPct} align="right" />      </div>

      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-nv-surface"
        role="img"
        aria-label={`${leader.name} ${leaderPct.toFixed(1)} percent, ${challenger.name} ${challengerPct.toFixed(1)} percent`}
      >
        <span
          className="h-full bg-nv-primary transition-[width] duration-500 ease-out"
          style={{ width: `${leaderPct}%` }}
        />
        <span
          className="h-full bg-nv-navy transition-[width] duration-500 ease-out"
          style={{ width: `${challengerPct}%` }}
        />
      </div>
    </div>
  );
}

function SplitSide({
  entry,
  pct,
  align,
  leading = false,
}: {
  entry: LiveSplitEntry;
  pct: number;
  align: "left" | "right";
  leading?: boolean;
}) {
  const initials = entry.name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-2.5", align === "right" && "flex-row-reverse text-right")}>
      <span
        aria-hidden="true"
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-bold",
          leading ? "nv-grad-candidate text-nv-navy" : "nv-grad-profile text-white",
        )}
      >
        {initials || "?"}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-bold text-nv-ink">{entry.name}</span>
        <span className="nums-tabular block text-[12px] text-nv-muted">
          {entry.votes.toLocaleString()} votes · {pct.toFixed(1)}%
        </span>
      </span>
    </div>
  );
}