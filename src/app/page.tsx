import Link from "next/link";
import { ChevronRight, Search, Sparkles } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { serializeElectionList } from "@/src/lib/serializers";
import { candidatePhotoPath } from "@/src/lib/serializers";
import { CandidateCard, type CandidateCardData } from "@/src/components/candidate-card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Tile, type TileData } from "@/src/components/ui/tile";
import { t } from "@/config/tenant";

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
          include: {
            candidates: {
              where: { approved: true },
              include: {
                user: { include: { department: true, section: true } },
                department: true,
                section: true,
                _count: { select: { votes: true } },
              },
            },
          },
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

  // Featured: highest-voted approved candidates across the election.
  const featured: CandidateCardData[] = election
    ? election.positions
        .flatMap((position) =>
          position.candidates.map((candidate) => ({
            candidate,
            positionName: position.name,
            votes: candidate._count.votes,
          })),
        )
        .sort((a, b) => b.votes - a.votes)
        .slice(0, 6)
        .map(({ candidate, positionName }) => ({
          id: candidate.id,
          name: displayName(candidate.user),
          role: positionName,
          photoUrl: candidatePhotoPath(candidate),
          href: `/candidates/${candidate.id}`,
          rating: null,
        }))
    : [];

  const firstPosition = election?.positions[0];
  const listed: CandidateCardData[] = firstPosition
    ? firstPosition.candidates.map((candidate) => ({
        id: candidate.id,
        name: displayName(candidate.user),
        party: candidate.user.department?.name ?? null,
        partyCode: candidate.user.department?.code?.slice(0, 3) ?? null,
        role: firstPosition.name,
        photoUrl: candidatePhotoPath(candidate),
        href: `/candidates/${candidate.id}`,
      }))
    : [];

  // Explore tiles come from real categories, so nothing here is fabricated.
  const tiles: TileData[] = categories.map((category) => ({
    id: category.id,
    label: category.name,
    meta: `${category._count.elections}`,
    href: `/categories/${category.slug}`,
  }));

  const openElection = election ? serializeElectionList(election) : null;
  const isOpen = election?.status === "OPEN";

  return (
    <div className="space-y-7">
      {/* ---------------- Header ---------------- */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-nv-muted">
            {t.constituency}
          </p>
          <h1 className="mt-0.5 truncate text-[26px] font-extrabold leading-8 tracking-tight text-nv-ink">
            {election?.organization?.name ?? election?.title ?? "All regions"}
          </h1>
          <p className="mt-1 text-[13px] text-nv-muted">
            {openElection
              ? `${election?.positions.length ?? 0} question${
                  (election?.positions.length ?? 0) === 1 ? "" : "s"
                } on this ballot`
              : "No open election right now"}
          </p>
        </div>
        <Button asChild variant="subtle" size="icon" aria-label="Search">
          <Link href="/explore">
            <Search className="h-5 w-5" aria-hidden="true" />
          </Link>
        </Button>
      </header>

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
          {/* ---------------- Cast vote banner ---------------- */}
          <Link
            href={`/vote/${election.slug}`}
            className="nv-grad-candidate relative block overflow-hidden rounded-nv-lg p-4 shadow-nv-card transition-transform duration-200 active:scale-[0.99]"
          >
            <span
              aria-hidden="true"
              className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-white/12"
            />
            <div className="relative flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.6px] text-white/80">
                  {isOpen ? "Voting open" : "Voting closed"}
                </p>
                <p className="mt-1 truncate text-[18px] font-bold text-white">
                  {election.title}
                </p>
                <p className="mt-0.5 text-[12px] text-white/85">
                  {election.category?.name ?? "General"}
                </p>
              </div>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-nv-primary">
                <ChevronRight className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </Link>

          {/* ---------------- Most upvoted ---------------- */}
          {featured.length > 0 ? (
            <section aria-labelledby="featured-heading">
              <div className="mb-3 flex items-center justify-between">
                <h2
                  id="featured-heading"
                  className="flex items-center gap-1.5 text-[16px] font-bold text-nv-ink"
                >
                  <Sparkles className="h-4 w-4 text-nv-primary" aria-hidden="true" />
                  Most upvoted
                </h2>
                <Link
                  href="/explore"
                  className="text-[12px] font-semibold text-nv-primary"
                >
                  See all
                </Link>
              </div>
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {featured.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} featured />
                ))}
              </div>
            </section>
          ) : null}

          {/* ---------------- Candidates ---------------- */}
          <section aria-labelledby="candidates-heading">
            <div className="mb-3 flex items-center justify-between">
              <h2 id="candidates-heading" className="text-[16px] font-bold text-nv-ink">
                {firstPosition ? firstPosition.name : "Candidates"}
              </h2>
              {t.groupsEnabled ? (
                <Badge variant="secondary" className="text-[10px]">
                  {t.partyPlural}
                </Badge>
              ) : null}
            </div>
            {listed.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-[13px] text-nv-muted">
                  No approved candidates yet.
                </CardContent>
              </Card>
            ) : (
              <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {listed.map((candidate) => (
                  <CandidateCard key={candidate.id} candidate={candidate} />
                ))}
              </div>
            )}
          </section>
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
          <div className="grid grid-cols-2 gap-3">
            {tiles.map((tile) => (
              <Tile key={tile.id} tile={tile} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** Displays a name without duplicating the serializer's logic. */
function displayName(user: { firstName: string; lastName: string; username: string }): string {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return full || user.username;
}