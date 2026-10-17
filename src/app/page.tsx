import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { isAcceptingVotes, serializeElectionList } from "@/src/lib/serializers";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Tile, type TileData } from "@/src/components/ui/tile";
import { BrandLogo } from "@/src/components/brand-logo";
import { PageHero } from "@/src/components/page-hero";
import { FirstVisitOnboarding } from "@/src/components/first-visit";
import tenant, { t } from "@/config/tenant";
import { cn } from "@/src/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The election and the category tiles are independent — fetch them together.
  const [election, categories] = await Promise.all([
    prisma.election.findFirst({
      where: { isPublished: true },
      orderBy: { votingStartAt: "desc" },
      include: {
        category: true,
        organization: true,
        positions: {
          orderBy: { order: "asc" },
        },
      },
    }),
    // Explore tiles come from real categories, so nothing here is fabricated.
    prisma.electionCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      take: 6,
      include: { _count: { select: { elections: true } } },
    }),
  ]);

  // Explore tiles come from real categories, so nothing here is fabricated.
  const tiles: TileData[] = categories.map((category) => ({
    id: category.id,
    label: category.name,
    meta: `${category._count.elections}`,
    href: `/categories/${category.slug}`,
  }));

  const openElection = election ? serializeElectionList(election) : null;
  // Elections are published immediately by officers, so the window — not the
  // lifecycle status alone — decides whether voting is open right now.
  const isOpen = Boolean(election && isAcceptingVotes(election));
  const questionCount = election?.positions.length ?? 0;

  return (
    <div className="space-y-6">
      <FirstVisitOnboarding />
      {/* ---------------- Hero ---------------- */}
      <PageHero
        avatar={
          // White tile so the red logo artwork separates from the red hero.
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-float">
            <BrandLogo className="h-full w-full" />
          </span>
        }
        title={t.name}
        description={tenant.tagline}
        align="center"
        className="-mt-6"
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild className="w-auto">
          <Link href="/elections">Browse elections</Link>
        </Button>
      </div>

      {!election ? (
        <Card>
          <CardContent className="py-14 text-center">
            <h2 className="text-[18px] font-bold text-nv-ink">No open election</h2>
            <p className="mx-auto mt-2 max-w-sm text-[13px] text-nv-muted">
              There is no published election available for you at the moment.
              Browse categories to see what is scheduled.
            </p>
            <Button asChild className="mt-5 sm:w-56">
              <Link href="/explore">Explore elections</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ---------------- Current election ---------------- */}
          <Link
            href={`/vote/${election.slug}`}
            className="group relative block overflow-hidden rounded-nv-lg border border-nv-line bg-nv-surface p-4 shadow-nv-card transition-transform duration-200 active:scale-[0.99]"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-nv-muted">
                  Current election
                </p>
                <p className="mt-1 truncate text-[18px] font-bold text-nv-ink">
                  {election.title}
                </p>
                <p className="mt-0.5 text-[12px] text-nv-muted">
                  {openElection
                    ? `${questionCount} question${questionCount === 1 ? "" : "s"} on this ballot`
                    : "No open election right now"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "status-surface rounded-full px-2.5 py-1 text-[11px] font-semibold",
                    isOpen
                      ? "bg-status-open text-status-open-foreground"
                      : "bg-status-closed text-status-closed-foreground",
                  )}
                >
                  {isOpen ? "Voting open" : "Voting closed"}
                </span>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-nv-primary text-white transition-transform group-hover:translate-x-0.5">
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
            </div>
          </Link>
        </>
      )}

      {/* ---------------- Explore tiles ---------------- */}
      {tiles.length > 0 ? (
        <section aria-labelledby="explore-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="explore-heading" className="text-[16px] font-bold text-nv-ink">
              Explore
            </h2>
            <Link href="/explore" className="text-[12px] font-semibold text-nv-primary">
              See all
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {tiles.map((tile) => (
              <Tile key={tile.id} tile={tile} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
