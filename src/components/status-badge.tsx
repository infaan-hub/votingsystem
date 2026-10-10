import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/utils";

/**
 * Election lifecycle states. Each has a dedicated colour token *and* a glyph so
 * status is never conveyed by colour alone.
 */
export const ELECTION_STATUSES = [
  "DRAFT",
  "PUBLISHED",
  "NOMINATIONS",
  "READY",
  "OPEN",
  "CLOSED",
  "RESULTS_PUBLISHED",
  "ARCHIVED",
] as const;

export type ElectionStatus = (typeof ELECTION_STATUSES)[number];

const STATUS_STYLE: Record<ElectionStatus, { className: string; glyph: string; label: string }> = {
  DRAFT: {
    className: "bg-status-draft text-status-draft-foreground border-status-draft",
    glyph: "✎",
    label: "Draft",
  },
  PUBLISHED: {
    className:
      "bg-status-published text-status-published-foreground border-status-published",
    glyph: "◈",
    label: "Published",
  },
  NOMINATIONS: {
    className:
      "bg-status-nominations text-status-nominations-foreground border-status-nominations",
    glyph: "✚",
    label: "Nominations",
  },
  READY: {
    className: "bg-status-ready text-status-ready-foreground border-status-ready",
    glyph: "◔",
    label: "Ready",
  },
  OPEN: {
    className: "bg-status-open text-status-open-foreground border-status-open",
    glyph: "●",
    label: "Open",
  },
  CLOSED: {
    className: "bg-status-closed text-status-closed-foreground border-status-closed",
    glyph: "■",
    label: "Closed",
  },
  RESULTS_PUBLISHED: {
    className:
      "bg-status-results text-status-results-foreground border-status-results",
    glyph: "▤",
    label: "Results",
  },
  ARCHIVED: {
    className:
      "bg-status-archived text-status-archived-foreground border-status-archived",
    glyph: "▣",
    label: "Archived",
  },
};

type StatusBadgeProps = {
  status: string;
  className?: string;
};

/**
 * Renders an election lifecycle status. Falls back to a neutral pill for
 * unknown values so an unexpected status never crashes a list.
 */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status as ElectionStatus;
  const style = STATUS_STYLE[key];
  const label = style?.label ?? status;
  const glyph = style?.glyph ?? "○";

  return (
    <Badge
      className={cn(
        "status-surface gap-1.5",
        style
          ? style.className
          : "bg-muted text-muted-foreground border-border",
        className,
      )}
    >
      <span aria-hidden="true" className="text-[0.7em] leading-none">
        {glyph}
      </span>
      {label}
    </Badge>
  );
}