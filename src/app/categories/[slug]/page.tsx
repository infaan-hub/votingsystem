import { notFound } from "next/navigation";

import { prisma } from "@/src/lib/db";
import { Card, CardContent } from "@/src/components/ui/card";
import { ElectionCard } from "@/src/components/election-card";
import { PageHero } from "@/src/components/page-hero";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await prisma.electionCategory.findFirst({
    where: { slug, isActive: true },
  });
  if (!category) notFound();

  const elections = await prisma.election.findMany({
    where: { categoryId: category.id, isPublished: true },
    orderBy: { votingStartAt: "asc" },
    include: {
      organization: true,
      _count: { select: { positions: true } },
    },
  });

  return (
    <div className="mx-auto max-w-7xl pb-nav lg:pb-0">
      <PageHero
        backHref="/categories"
        backLabel="Back to categories"
        avatar={
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 text-2xl" aria-hidden="true">
            {category.icon || "📋"}
          </span>
        }
        title={category.name}
        description={category.description || undefined}
        meta={`${elections.length} published election${elections.length === 1 ? "" : "s"}`}
        className="-mt-6"
      />

      {elections.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No published elections in this category yet.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {elections.map((election) => (
            <ElectionCard
              key={election.id}
              election={{
                id: election.id,
                title: election.title,
                description: election.description,
                slug: election.slug,
                status: election.status,
                categoryName: category.name,
                categoryIcon: category.icon,
                positionCount: election._count?.positions ?? 0,
                organizationName: election.organization?.name ?? null,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}