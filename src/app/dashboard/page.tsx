"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Vote } from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { ElectionCard, type ElectionCardData } from "@/src/components/election-card";
import { PullToRefresh } from "@/src/components/pull-to-refresh";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

export default function DashboardPage() {
  const router = useRouter();
  const { token } = useApp();
  const [elections, setElections] = useState<ElectionCardData[] | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/elections/", {
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) {
        setElections([]);
        return;
      }
      const data = (await response.json()) as Array<{
        id: number;
        title: string;
        description: string;
        slug: string;
        status: string;
        category?: { name: string; icon: string } | null;
        organization?: { name: string } | null;
        _count?: { positions: number };
      }>;
      setElections(
        data.map((entry) => ({
          id: entry.id,
          title: entry.title,
          description: entry.description,
          slug: entry.slug,
          status: entry.status,
          categoryName: entry.category?.name ?? null,
          categoryIcon: entry.category?.icon ?? null,
          positionCount: entry._count?.positions ?? 0,
          organizationName: entry.organization?.name ?? null,
        })),
      );
      setError("");
    } catch {
      setError("Could not load your elections. Pull down to retry.");
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      router.push("/login");
      return;
    }
    void load();
  }, [token, router, load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-nav lg:pb-0">
      <PullToRefresh onRefresh={refresh}>
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Your dashboard
            </p>
            <h1 className="mt-1 text-display text-fluid-3xl">Elections for you</h1>
            <p className="mt-2 max-w-prose text-muted-foreground">
              Published elections you are eligible to take part in.
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </header>

        {error ? (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-destructive/40 bg-destructive/10 p-3.5 text-sm text-destructive"
          >
            {error}
          </p>
        ) : null}

        {elections === null ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <Card key={card}>
                <CardContent className="space-y-3 p-6">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : elections.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
                <Vote className="h-6 w-6" aria-hidden="true" />
              </span>
              <h2 className="text-fluid-xl font-semibold">No elections available</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                There is nothing to vote on right now. Browse published elections
                to see what is coming up.
              </p>
              <Button asChild>
                <Link href="/elections">Browse elections</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {elections.map((election) => (
              <ElectionCard key={election.id} election={election} />
            ))}
          </div>
        )}
      </PullToRefresh>
    </div>
  );
}