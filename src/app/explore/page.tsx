import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { Card, CardContent } from "@/src/components/ui/card";
import { Tile, type TileData } from "@/src/components/ui/tile";
import { displayName } from "@/src/lib/page-helpers";
import { t } from "@/config/tenant";

export const dynamic = "force-dynamic";

const CHIPS = ["All", "Regions", "Leaders", "Reports", "Polls"] as const;
type Chip = (typeof CHIPS)[number];

function chipHref(chip: Chip): string {
  switch (chip) {
    case "Regions":
      return "?tab=regions";
    case "Leaders":
      return "?tab=leaders";
    case "Reports":
      return "?tab=reports";
    case "Polls":
      return "?tab=polls";
    default:
      return "/explore";
  }
}

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const params = await searchParams;
  const active = (CHIPS.find((chip) => chip.toLowerCase() === params.tab) ?? "All") as Chip;
  const query = (params.q ?? "").trim();

  // Tiles are real categories; regions are real organizations. Nothing on this
  // screen is generated or fabricated.
  const categories = await prisma.electionCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { elections: true } } },
  });

  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    include: { _count: { select: { elections: true } } },
  });

  const leaders = await prisma.candidate.findMany({
    where: { approved: true },
    orderBy: { createdAt: "desc" },
    take: 8,
    include: {
      user: { include: { department: true } },
      position: true,
      _count: { select: { votes: true } },
    },
  });

  const categoryTiles: TileData[] = categories.map((category) => ({
    id: category.id,
    label: category.name,
    meta: `${category._count.elections}`,
    href: `/categories/${category.slug}`,
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-[26px] font-extrabold leading-8 tracking-tight text-nv-ink">
          Explore
        </h1>
        <p className="mt-1 text-[13px] text-nv-muted">
          Elections, {t.regionPlural.toLowerCase()}, and {t.partyPlural.toLowerCase()} on{" "}
          {t.name}.
        </p>
      </header>

      {/* Search */}
      <form action="/explore" method="get" role="search" className="relative">
        <label htmlFor="explore-search" className="sr-only">
          Search
        </label>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-nv-muted"
        >
          <Search className="h-4 w-4" />
        </span>
        <input
          id="explore-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search elections, regions, leaders"
          className="h-12 w-full rounded-xl border-0 bg-nv-surface pl-10 pr-3 text-[14px] text-nv-ink placeholder:text-nv-muted focus:border-nv-primary focus:outline-none"
        />
      </form>

      {/* Chips */}
      <nav aria-label="Explore filters" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {CHIPS.map((chip) => {
          const selected = chip === active;
          return (
            <Link
              key={chip}
              href={chipHref(chip)}
              aria-current={selected ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center rounded-full px-4 text-[13px] font-semibold transition-colors duration-200 ${
                selected
                  ? "bg-nv-primary text-white"
                  : "bg-nv-surface text-nv-text hover:brightness-[0.97]"
              }`}
            >
              {chip}
            </Link>
          );
        })}
      </nav>

      {active === "Regions" ? (
        <RegionList organizations={organizations} />
      ) : active === "Leaders" ? (
        <LeaderGrid leaders={leaders} />
      ) : (
        <section aria-label="Categories">
          <h2 className="mb-3 text-[15px] font-bold text-nv-ink">Categories</h2>
          {categoryTiles.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-[13px] text-nv-muted">
                No categories available yet.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {categoryTiles.map((tile) => (
                <Tile key={tile.id} tile={tile} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

type OrganizationRow = {
  id: number;
  name: string;
  slug: string;
  description: string;
  _count: { elections: number };
};

function RegionList({ organizations }: { organizations: OrganizationRow[] }) {
  if (organizations.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-[13px] text-nv-muted">
          No {t.regionPlural.toLowerCase()} configured yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-label={t.regionPlural} className="space-y-3">
      <h2 className="text-[15px] font-bold text-nv-ink">{t.regionPlural}</h2>
      {organizations.map((organization) => (
        <Link
          key={organization.id}
          href={`/explore?tab=regions&org=${organization.slug}`}
          className="flex items-center gap-3.5 rounded-nv-md bg-white p-3 shadow-nv-card transition-transform duration-200 active:scale-[0.99] dark:bg-[#171930]"
        >
          <span
            aria-hidden="true"
            className="nv-grad-profile grid h-12 w-12 shrink-0 place-items-center rounded-full text-[15px] font-bold text-white"
          >
            {initialsFor(organization.name)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-bold text-nv-ink">
              {organization.name}
            </span>
            <span className="nums-tabular block truncate text-[12px] text-nv-muted">
              {organization._count.elections} election
              {organization._count.elections === 1 ? "" : "s"}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 shrink-0 text-nv-muted" aria-hidden="true" />
        </Link>
      ))}
    </section>
  );
}

type LeaderRow = {
  id: number;
  user: { firstName: string; lastName: string; username: string; department: { name: string } | null };
  position: { name: string } | null;
  _count: { votes: number };
};

function LeaderGrid({ leaders }: { leaders: LeaderRow[] }) {
  if (leaders.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-[13px] text-nv-muted">
          No candidates have been approved yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <section aria-label="Leaders" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {leaders.map((leader) => (
        <Link
          key={leader.id}
          href={`/candidates/${leader.id}`}
          className="rounded-nv-md bg-white p-3 text-center shadow-nv-card transition-transform duration-200 active:scale-[0.98] dark:bg-[#171930]"
        >
          <span
            aria-hidden="true"
            className="nv-grad-candidate mx-auto grid h-16 w-16 place-items-center rounded-full text-lg font-bold text-white"
          >
            {initialsFor(displayName(leader.user))}
          </span>
          <span className="mt-2 block truncate text-[13px] font-bold text-nv-ink">
            {displayName(leader.user)}
          </span>
          <span className="block truncate text-[11px] text-nv-muted">
            {leader.position?.name ?? t.constituency}
          </span>
          <span className="nums-tabular mt-1 block text-[11px] font-semibold text-nv-primary">
            {leader._count.votes} votes
          </span>
        </Link>
      ))}
    </section>
  );
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}