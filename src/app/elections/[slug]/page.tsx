import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Users, Vote } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { serializeElectionDetail } from "@/src/lib/serializers";
import { formatDateTime } from "@/src/lib/time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { StatusBadge } from "@/src/components/status-badge";
import { ResultsBars } from "@/src/components/results-bars";

export const dynamic = "force-dynamic";

export default async function ElectionDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const election = await prisma.election.findFirst({
    where: { slug, isPublished: true },
    include: { category: true, organization: true },
  });
  if (!election) notFound();

  const serialized = await serializeElectionDetail(election);

  const isOpen = election.status === "OPEN";
  const isClosed =
    election.status === "CLOSED" ||
    election.status === "RESULTS_PUBLISHED" ||
    election.status === "ARCHIVED";

  return (
    <div className="mx-auto max-w-4xl px-4 pb-nav lg:pb-0">
      <Link
        href="/elections"
        className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to elections
      </Link>

      <header className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={election.status} />
          <Badge2
            icon={<span aria-hidden="true">{election.category?.icon || "📋"}</span>}
            label={election.category?.name || "General"}
          />
          {election.organization ? (
            <Badge2 label={election.organization.name} />
          ) : null}
        </div>

        <h1 className="mt-3 text-display text-fluid-3xl">{election.title}</h1>

        <dl className="mt-5 grid gap-3 sm:grid-cols-3">
          <Fact
            icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            term="Voting opens"
            value={formatDateTime(election.votingStartAt) ?? "Not scheduled"}
          />
          <Fact
            icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
            term="Voting closes"
            value={formatDateTime(election.votingEndAt) ?? "Not scheduled"}
          />
          <Fact
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            term="Questions"
            value={`${serialized.positions.length}`}
          />
        </dl>

        {election.description ? (
          <p className="mt-5 max-w-2xl leading-relaxed text-muted-foreground">
            {election.description}
          </p>
        ) : null}

        {election.instructions ? (
          <Card className="mt-5 bg-muted/40">
            <CardContent className="p-4">
              <h2 className="text-sm font-semibold">How to vote</h2>
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                {election.instructions}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {isOpen ? (
          <div className="mt-6">
            <Button asChild size="lg">
              <Link href={`/vote/${election.slug}`}>
                <Vote className="h-4 w-4" aria-hidden="true" />
                Cast your vote
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <section className="mt-10 space-y-5" aria-label="Ballot questions">
        {serialized.positions.map((position) => {
          const bars = position.candidates.map((candidate) => ({
            id: candidate.id,
            label: candidate.user.full_name || candidate.user.username,
            votes: candidate.vote_total ?? 0,
            detail: candidate.slogan || undefined,
          }));

          return (
            <Card key={position.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <CardTitle className="text-fluid-xl">{position.name}</CardTitle>
                  {isClosed ? (
                    <span className="nums-tabular text-sm text-muted-foreground">
                      {position.max_winners} winner
                      {position.max_winners === 1 ? "" : "s"}
                    </span>
                  ) : null}
                </div>
                <CardDescription>
                  {position.candidates.length} option
                  {position.candidates.length === 1 ? "" : "s"} ·{" "}
                  {position.voter_group_label}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-5">
                {position.candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No options have been published for this question yet.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2">
                      {position.candidates.map((candidate) => (
                        <li
                          key={candidate.id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">
                              {candidate.user.full_name || candidate.user.username}
                            </p>
                            {candidate.slogan ? (
                              <p className="text-sm text-muted-foreground">
                                {candidate.slogan}
                              </p>
                            ) : null}
                          </div>
                          {isOpen ? (
                            <Button asChild variant="outline" size="sm">
                              <Link
                                href={`/vote/${election.slug}?position=${position.id}`}
                              >
                                Vote
                              </Link>
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>

                    {isClosed ? (
                      <div className="rounded-lg border bg-muted/30 p-4">
                        <h3 className="mb-3 text-sm font-semibold">Results</h3>
                        <ResultsBars data={bars} />
                      </div>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

function Badge2({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs font-medium">
      {icon}
      {label}
    </span>
  );
}

function Fact({
  icon,
  term,
  value,
}: {
  icon: React.ReactNode;
  term: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {term}
      </dt>
      <dd className="nums-tabular mt-1 text-sm font-medium">{value}</dd>
    </div>
  );
}