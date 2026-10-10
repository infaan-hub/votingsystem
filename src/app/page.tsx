import Link from "next/link";
import { ArrowRight, Lock, Sliders, Tags } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { ElectionCard } from "@/src/components/election-card";
import { prisma } from "@/src/lib/db";

export const dynamic = "force-dynamic";

async function getLandingData() {
  const [elections, categories] = await Promise.all([
    prisma.election.findMany({
      where: { isPublished: true },
      orderBy: { votingStartAt: "asc" },
      take: 6,
      include: {
        category: true,
        organization: true,
        _count: { select: { positions: true } },
      },
    }),
    prisma.electionCategory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { _count: { select: { elections: true } } },
    }),
  ]);
  return { elections, categories };
}

export default async function Home() {
  const { elections, categories } = await getLandingData();

  return (
    <div className="mx-auto max-w-7xl px-4 pb-nav lg:pb-0">
      {/* ---------------- Hero ---------------- */}
      <section className="relative -mx-4 mb-16 overflow-hidden border-b px-4 py-20 sm:py-28">
        <div
          className="absolute inset-0 -z-10"
          aria-hidden="true"
          style={{
            background:
              "radial-gradient(60rem 30rem at 15% -10%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%), radial-gradient(45rem 25rem at 90% 10%, color-mix(in oklab, var(--status-nominations) 14%, transparent), transparent 65%)",
          }}
        />
        <div className="max-w-3xl">
          <Badge variant="secondary" className="mb-5">
            Secure · Transparent · Configurable
          </Badge>
          <h1 className="text-display-tight text-fluid-4xl">
            Elections for every
            <span className="text-primary"> kind of organization</span>
          </h1>
          <p className="mt-6 max-w-2xl text-fluid-base text-muted-foreground">
            Run secure, configurable elections — from universities to corporations,
            associations to communities, unions to boards. Configure eligibility,
            ballots, and result visibility per election, without touching code.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/elections">
                Explore elections
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/admin">Create an election</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ---------------- Categories ---------------- */}
      {categories.length > 0 && (
        <section className="mb-16">
          <SectionHeading
            eyebrow="By organization type"
            title="Browse categories"
            description="Each category carries its own rules; administrators can add their own."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <Link key={category.id} href={`/categories/${category.slug}`}>
                <Card className="h-full transition-shadow hover:shadow-panel">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-fluid-lg">
                      <span className="text-2xl" aria-hidden="true">
                        {category.icon || "📋"}
                      </span>
                      {category.name}
                    </CardTitle>
                    <CardDescription className="nums-tabular">
                      {category._count?.elections ?? 0} election
                      {(category._count?.elections ?? 0) === 1 ? "" : "s"}
                    </CardDescription>
                  </CardHeader>
                  {category.description ? (
                    <CardContent>
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {category.description}
                      </p>
                    </CardContent>
                  ) : null}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------------- Elections ---------------- */}
      {elections.length > 0 && (
        <section className="mb-16">
          <SectionHeading
            eyebrow="Live now"
            title="Active and upcoming elections"
            description="Published elections with real schedules and real ballots."
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        </section>
      )}

      {/* ---------------- Capabilities ---------------- */}
      <section className="mb-16">
        <SectionHeading
          eyebrow="How it works"
          title="Configuration drives behaviour"
          description="None of the following assumes an educational institution."
        />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <CapabilityCard
            icon={<Sliders className="h-5 w-5" aria-hidden="true" />}
            title="Configurable eligibility"
            body="Choose per election: registered voters, approved organization members, an imported voter list, invitations, or an open poll."
          />
          <CapabilityCard
            icon={<Tags className="h-5 w-5" aria-hidden="true" />}
            title="Any ballot format"
            body="Candidate elections, yes/no referendums, multiple-choice questions, and multi-select ballots — each with its own limits."
          />
          <CapabilityCard
            icon={<Lock className="h-5 w-5" aria-hidden="true" />}
            title="Controlled results"
            body="Publish live, hold until the poll closes, or restrict to officers only. Every state change is auditable."
          />
        </div>
      </section>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {eyebrow}
      </p>
      <h2 className="mt-1 text-display text-fluid-2xl">{title}</h2>
      <p className="mt-2 text-muted-foreground">{description}</p>
    </header>
  );
}

function CapabilityCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <span className="mb-2 grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <CardTitle className="text-fluid-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}