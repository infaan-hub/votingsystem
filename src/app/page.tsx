import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { prisma } from "@/src/lib/db";
import { serializeElectionList } from "@/src/lib/serializers";

export const dynamic = "force-dynamic";

async function getLandingData() {
  const [elections, categories] = await Promise.all([
    prisma.election.findMany({
      where: { isPublished: true },
      orderBy: { votingStartAt: "asc" },
      take: 6,
      include: { category: true, _count: { select: { positions: true } } },
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
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold tracking-tight">
            Election<span className="text-primary">Hub</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/elections" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Elections
            </Link>
            <Link href="/categories" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Categories
            </Link>
            <Button asChild variant="outline" size="sm">
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/elections">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
          <div className="relative mx-auto max-w-7xl px-4 py-24 sm:py-32">
            <div className="max-w-3xl">
              <Badge className="mb-4">Secure · Transparent · Accessible</Badge>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl">
                Elections for every organization
              </h1>
              <p className="mt-6 text-lg text-muted-foreground sm:text-xl">
                From universities to corporations, associations to communities — run secure, configurable elections with real-time results, eligibility controls, and audit trails.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Button asChild size="lg">
                  <Link href="/elections">Explore Elections</Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/login">Create an Election</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {categories.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-16">
            <h2 className="text-2xl font-bold tracking-tight">Browse by category</h2>
            <p className="mt-2 text-muted-foreground">Discover elections across different organization types.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <Link key={category.id} href={`/categories/${category.slug}`}>
                  <Card className="transition-shadow hover:shadow-md">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <span className="text-2xl">{category.icon || "📋"}</span>
                        {category.name}
                      </CardTitle>
                      <CardDescription>
                        {category._count?.elections ?? 0} election{(category._count?.elections ?? 0) !== 1 ? "s" : ""}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        )}

        {elections.length > 0 && (
          <section className="mx-auto max-w-7xl px-4 py-16">
            <h2 className="text-2xl font-bold tracking-tight">Active & upcoming elections</h2>
            <p className="mt-2 text-muted-foreground">Published elections you can participate in.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {elections.map((election) => {
                const serialized = serializeElectionList(election);
                return (
                  <Link key={election.id} href={`/elections/${election.slug}`}>
                    <Card className="transition-shadow hover:shadow-md">
                      <CardHeader>
                        <div className="flex items-start justify-between gap-2">
                          <CardTitle className="text-lg">{election.title}</CardTitle>
                          <Badge variant={serialized.status === "active" ? "success" : serialized.status === "ended" ? "muted" : "secondary"}>
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
          </section>
        )}

        <section className="border-t bg-muted/50">
          <div className="mx-auto max-w-7xl px-4 py-16">
            <div className="grid gap-8 sm:grid-cols-3">
              <div>
                <h3 className="font-semibold">Secure by design</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Token-based authentication, PBKDF2 password hashing, and database-enforced vote uniqueness.
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Configurable eligibility</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Voter lists, organization membership, open polls, or custom rules per election.
                </p>
              </div>
              <div>
                <h3 className="font-semibold">Transparent results</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Live or published results with configurable visibility and audit logging.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row">
          <p className="text-sm text-muted-foreground">ElectionHub — general-purpose election platform</p>
          <div className="flex gap-4">
            <Link href="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy</Link>
            <Link href="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}