"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { useApp } from "@/src/components/AppProvider";

type Election = {
  id: number;
  title: string;
  slug: string;
  status: string;
  category: { name: string } | null;
  _count: { positions: number };
};

export default function DashboardPage() {
  const router = useRouter();
  const { user, token } = useApp();
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    fetch("/api/elections/", { headers: { Authorization: `Token ${token}` } })
      .then((r) => (r.ok ? r.json() : []))
      .then(setElections)
      .finally(() => setLoading(false));
  }, [token, router]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Welcome back, {user.full_name || user.username}. Here are your elections.
        </p>
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">Loading...</CardContent>
        </Card>
      ) : elections.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <p className="text-lg font-medium">No elections available</p>
            <p className="mt-2 text-sm text-muted-foreground">Check back later.</p>
            <Button asChild className="mt-4">
              <Link href="/elections">Browse elections</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {elections.map((election) => (
            <Link key={election.id} href={`/elections/${election.slug}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{election.title}</CardTitle>
                    <Badge
                      variant={
                        election.status === "active"
                          ? "success"
                          : election.status === "ended"
                            ? "muted"
                            : "secondary"
                      }
                    >
                      {election.status}
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
          ))}
        </div>
      )}
    </div>
  );
}