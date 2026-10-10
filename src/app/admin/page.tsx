import Link from "next/link";
import { prisma } from "@/src/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [elections, users, categories, votes] = await Promise.all([
    prisma.election.count(),
    prisma.user.count(),
    prisma.electionCategory.count(),
    prisma.vote.count(),
  ]);

  const recentElections = await prisma.election.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { category: true },
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-2 text-muted-foreground">Platform overview and management.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Elections</CardDescription>
            <CardTitle className="text-3xl">{elections}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Users</CardDescription>
            <CardTitle className="text-3xl">{users}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Categories</CardDescription>
            <CardTitle className="text-3xl">{categories}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Votes cast</CardDescription>
            <CardTitle className="text-3xl">{votes}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold">Quick actions</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/admin/elections/new">Create election</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/categories">Manage categories</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/admin/users">Manage users</Link>
          </Button>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-bold">Recent elections</h2>
        <div className="mt-4 space-y-3">
          {recentElections.map((election) => (
            <Card key={election.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-medium">{election.title}</p>
                  <p className="text-sm text-muted-foreground">{election.category?.name || "General"}</p>
                </div>
                <Badge
                  variant={
                    election.status === "OPEN"
                      ? "success"
                      : election.status === "CLOSED"
                        ? "muted"
                        : "secondary"
                  }
                >
                  {election.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {recentElections.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No elections yet. Create your first one.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}