import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { serializeElectionList } from "@/src/lib/serializers";
import { Card, CardContent, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";

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
    include: { _count: { select: { positions: true } } },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <Link href="/categories" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to categories
      </Link>

      <div className="mt-4">
        <h1 className="text-3xl font-bold tracking-tight">{category.name}</h1>
        {category.description && <p className="mt-2 text-muted-foreground">{category.description}</p>}
      </div>

      {elections.length === 0 ? (
        <Card className="mt-8">
          <CardContent className="py-16 text-center text-muted-foreground">
            No elections in this category yet.
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {elections.map((election) => {
            const serialized = serializeElectionList(election);
            return (
              <Link key={election.id} href={`/elections/${election.slug}`}>
                <Card className="transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-lg">{election.title}</CardTitle>
                      <Badge
                        variant={
                          serialized.status === "active"
                            ? "success"
                            : serialized.status === "ended"
                              ? "muted"
                              : "secondary"
                        }
                      >
                        {serialized.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {election._count?.positions ?? 0} position{(election._count?.positions ?? 0) !== 1 ? "s" : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}