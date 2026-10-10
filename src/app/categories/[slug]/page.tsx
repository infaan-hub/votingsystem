import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { Card, CardContent } from "@/src/components/ui/card";
import { ElectionCard } from "@/src/components/election-card";

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
    <div className="mx-auto max-w-7xl px-4 pb-nav lg:pb-0">
      <Link
        href="/categories"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to categories
      </Link>

      <header className="mt-4 mb-8 max-w-2xl">
        <p className="text-4xl" aria-hidden="true">
          {category.icon || "📋"}
        </p>
        <h1 className="mt-2 text-display text-fluid-3xl">{category.name}</h1>
        {category.description ? (
          <p className="mt-2 text-muted-foreground">{category.description}</p>
        ) : null}
        <p className="nums-tabular mt-2 text-sm font-medium">
          {elections.length} published election{elections.length === 1 ? "" : "s"}
        </p>
      </header>

      {elections.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            No published elections in this category yet.
          </CardContent>
        </Card>
      ) : (
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