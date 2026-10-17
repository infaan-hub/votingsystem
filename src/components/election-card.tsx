import Link from "next/link";
import { Users } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { StatusBadge } from "@/src/components/status-badge";
import { cn } from "@/src/lib/utils";

export type ElectionCardData = {
  id: number;
  title: string;
  description: string;
  slug: string;
  status: string;
  categoryName: string | null;
  categoryIcon: string | null;
  positionCount: number;
  organizationName: string | null;
};

/**
 * Election summary card. Marked `@container` so its internals respond to the
 * width of the column it lands in rather than to the viewport — the same card
 * adapts whether it sits in a one-up mobile column or a three-up desktop grid.
 */
export function ElectionCard({ election, className }: { election: ElectionCardData; className?: string }) {
  return (
    <Card className={cn("@container h-full transition-shadow hover:shadow-panel", className)}>
      <Link href={`/elections/${election.slug}`} className="block h-full rounded-lg focus-visible:outline-none">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-fluid-lg @[18rem]:text-fluid-xl">
              {election.title}
            </CardTitle>
            <StatusBadge status={election.status} className="shrink-0" />
          </div>
          <CardDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {election.categoryName || "General"}
            {election.organizationName ? (
              <>
                <span aria-hidden="true">·</span>
                {election.organizationName}
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {election.description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {election.description}
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="nums-tabular inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {election.positionCount} position
              {election.positionCount === 1 ? "" : "s"}
            </span>
            <span className="text-primary font-medium">View details →</span>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}