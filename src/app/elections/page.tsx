import Link from "next/link";
import { prisma } from "@/src/lib/db";
import { serializeElectionList } from "@/src/lib/serializers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ElectionsPage() {
  const elections = await prisma.election.findMany({
    where: { isPublished: true },
    orderBy: { votingStartAt: "asc" },
    include: { category: true, _count: { select: { positions: true } } },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Elections</h1>
        <p className="mt-2 text-muted-foreground">Discover and participate in published elections.</p>
      </div>

      {elections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <p className="text-lg font-medium">No elections available</p>
            <p className="mt-2 text-sm text-muted-foreground">Check back later for new elections.</p>
            <Button asChild className="mt-4">
              <Link href="/">Go home</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                    <CardDescription>{election.category?.name || "General"}</CardDescription>
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