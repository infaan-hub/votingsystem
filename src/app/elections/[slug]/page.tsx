import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/db";
import { serializeElectionDetail } from "@/src/lib/serializers";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

export const dynamic = "force-dynamic";

export default async function ElectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const election = await prisma.election.findFirst({
    where: { slug, isPublished: true },
    include: { category: true },
  });
  if (!election) notFound();

  const serialized = await serializeElectionDetail(election);

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <Link href="/elections" className="text-sm text-muted-foreground hover:text-foreground">
        ← Back to elections
      </Link>

      <div className="mt-4">
        <Badge variant={serialized.status === "active" ? "success" : serialized.status === "ended" ? "muted" : "secondary"}>
          {serialized.status}
        </Badge>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{election.title}</h1>
        <p className="mt-2 text-muted-foreground">{election.category?.name || "General"}</p>
      </div>

      <div className="mt-8 space-y-4">
        {serialized.positions.map((position) => (
          <Card key={position.id}>
            <CardHeader>
              <CardTitle>{position.name}</CardTitle>
              <CardDescription>
                {position.max_winners} winner{position.max_winners !== 1 ? "s" : ""} ·{" "}
                {position.candidates.length} candidate{position.candidates.length !== 1 ? "s" : ""}
              </CardDescription>
            </CardHeader>
            {position.candidates.length > 0 && (
              <CardContent>
                <div className="space-y-2">
                  {position.candidates.map((candidate) => (
                    <div
                      key={candidate.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div>
                        <p className="font-medium">{candidate.user.full_name || candidate.user.username}</p>
                        {candidate.slogan && (
                          <p className="text-sm text-muted-foreground">{candidate.slogan}</p>
                        )}
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/vote/${election.slug}?position=${position.id}`}>Vote</Link>
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      {serialized.status === "active" && (
        <div className="mt-8">
          <Button asChild size="lg">
            <Link href={`/vote/${election.slug}`}>Cast your vote</Link>
          </Button>
        </div>
      )}
    </div>
  );
}