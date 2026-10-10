import Link from "next/link";
import { prisma } from "@/src/lib/db";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { ElectionCard } from "@/src/components/election-card";
import { Skeleton } from "@/src/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default function ElectionsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 pb-nav lg:pb-0">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Discover
        </p>
        <h1 className="mt-1 text-display text-fluid-3xl">Elections</h1>
        <p className="mt-2 max-w-prose text-muted-foreground">
          Published elections you can take part in, across every organization
          type on the platform.
        </p>
      </header>

      <ElectionList />
    </div>
  );
}

function ElectionList() {
  return (
    <ElectionListSection />
  );
}

async function ElectionListSection() {
  const elections = await prisma.election.findMany({
    where: { isPublished: true },
    orderBy: { votingStartAt: "asc" },
    include: {
      category: true,
      organization: true,
      _count: { select: { positions: true } },
    },
  });

  if (elections.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
          <h2 className="text-fluid-xl font-semibold">No elections available</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            There are no published elections right now. Check back soon, or browse
            by category to see what is coming up.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/categories">Browse categories</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/">Go home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {elections.map((election) => (
        <ElectionCard
          key={election.id}
          election={{
            id: election.id,
            title: election.title,
            description: election.description,
            slug: election.slug,
            status: election.status,
            categoryName: election.category?.name ?? null,
            categoryIcon: election.category?.icon ?? null,
            positionCount: election._count?.positions ?? 0,
            organizationName: election.organization?.name ?? null,
          }}
        />
      ))}
    </div>
  );
}

export function ElectionCardSkeleton() {
  return (
    <Card className="h-full">
      <CardContent className="space-y-3 p-6">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-2/3" />
      </CardContent>
    </Card>
  );
}