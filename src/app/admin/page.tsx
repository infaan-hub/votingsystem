"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3,
  Building2,
  FolderTree,
  LayoutList,
  RefreshCw,
  Rows3,
  Shield,
  Tags,
  Users,
  Vote,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { StatusBadge } from "@/src/components/status-badge";
import { CountUp } from "@/src/components/count-up";
import { PullToRefresh } from "@/src/components/pull-to-refresh";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

type Election = {
  id: number;
  slug: string;
  title: string;
  status: string;
  eligibility_policy: string;
  result_visibility: string;
  category_id: number | null;
  organization_id: number | null;
};

type Stats = {
  election_count: number;
  user_count: number;
  category_count: number;
  organization_count: number;
  vote_count: number;
};

type Density = "comfortable" | "compact";

const DENSITY_KEY = "election-hub-table-density";

export default function AdminPage() {
  const { user, token } = useApp();
  const [elections, setElections] = useState<Election[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<Density>("comfortable");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(DENSITY_KEY);
    if (stored === "compact" || stored === "comfortable") setDensity(stored);
  }, []);

  const load = useCallback(async () => {
    if (!token) return;
    const response = await fetch("/api/admin/elections/", {
      headers: { Authorization: `Token ${token}` },
    });
    if (!response.ok) return;
    const data = (await response.json()) as Election[];
    setElections(data);

    // Platform totals, derived from a single pass over what the admin can see.
    const categoriesResponse = await fetch("/api/admin/categories/", {
      headers: { Authorization: `Token ${token}` },
    });
    const categories = categoriesResponse.ok
      ? ((await categoriesResponse.json()) as Array<{ id: number }>)
      : [];
    const usersResponse = await fetch("/api/admin/users/", {
      headers: { Authorization: `Token ${token}` },
    });
    const users = usersResponse.ok
      ? ((await usersResponse.json()) as Array<{ id: number }>)
      : [];

    setStats({
      election_count: data.length,
      category_count: categories.length,
      organization_count: data.filter((e) => e.organization_id !== null).length,
      user_count: users.length,
      vote_count: 0,
    });
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const filtered = useMemo(() => {
    if (!elections) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return elections;
    return elections.filter((election) =>
      `${election.title} ${election.status} ${election.eligibility_policy}`
        .toLowerCase()
        .includes(needle),
    );
  }, [elections, query]);

  const selected = useMemo(
    () => filtered.find((election) => election.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  function toggleDensity() {
    const next: Density = density === "compact" ? "comfortable" : "compact";
    setDensity(next);
    window.localStorage.setItem(DENSITY_KEY, next);
  }

  if (!user || user.role !== "admin") {
    return (
      <Card>
        <CardContent className="py-16 text-center">
          <h1 className="text-fluid-xl font-semibold">Administrator access required</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            This area is restricted to platform administrators.
          </p>
          <Button asChild className="mt-5">
            <Link href="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const cell = density === "compact" ? "py-1.5" : "py-3";

  return (
    <div className="mx-auto max-w-7xl px-4 pb-nav lg:pb-0">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Administration
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-display text-fluid-3xl">
            <Shield className="h-6 w-6" aria-hidden="true" />
            Platform overview
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden="true" />
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
          <Button onClick={toggleDensity} variant="outline">
            {density === "compact" ? (
              <LayoutList className="h-4 w-4" aria-hidden="true" />
            ) : (
              <Rows3 className="h-4 w-4" aria-hidden="true" />
            )}
            {density === "compact" ? "Comfortable" : "Compact"}
          </Button>
        </div>
      </header>

      {/* ---------------- Metrics ---------------- */}
      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Platform metrics">
        <Metric
          icon={<Vote className="h-4 w-4" aria-hidden="true" />}
          label="Elections"
          value={stats?.election_count}
        />
        <Metric
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label="Users"
          value={stats?.user_count}
        />
        <Metric
          icon={<Tags className="h-4 w-4" aria-hidden="true" />}
          label="Categories"
          value={stats?.category_count}
        />
        <Metric
          icon={<Building2 className="h-4 w-4" aria-hidden="true" />}
          label="Organizations"
          value={stats?.organization_count}
        />
      </section>

      {/* ---------------- Quick actions ---------------- */}
      <section className="mb-8 flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/admin?view=new">Create election</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin/categories">
            <FolderTree className="h-4 w-4" aria-hidden="true" />
            Categories
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/admin?view=users">
            <Users className="h-4 w-4" aria-hidden="true" />
            Users
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/elections">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
            Public view
          </Link>
        </Button>
      </section>

      {/* ---------------- Master / detail ---------------- */}
      <PullToRefresh onRefresh={refresh} className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <section aria-label="Election list" className="min-w-0">
          <label htmlFor="election-filter" className="mb-2 block text-sm font-medium">
            Filter elections
          </label>
          <input
            id="election-filter"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, status, or policy"
            className="mb-3 h-11 w-full rounded-md border bg-background px-3 text-sm"
          />

          {elections === null ? (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No elections match your filter.
              </CardContent>
            </Card>
          ) : (
            <ul className="divide-y rounded-lg border">
              {filtered.map((election) => {
                const active = selected?.id === election.id;
                return (
                  <li key={election.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(election.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 text-left transition-colors",
                        cell,
                        active ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {election.title}
                        </span>
                        <span className="nums-tabular block truncate text-xs text-muted-foreground">
                          {election.eligibility_policy.replace(/_/g, " ")}
                        </span>
                      </span>
                      <StatusBadge status={election.status} className="shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Election detail" className="min-w-0">
          {selected === null ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Select an election to see its configuration.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="space-y-5 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-display text-fluid-xl">{selected.title}</h2>
                    <p className="nums-tabular mt-1 text-sm text-muted-foreground">
                      /elections/{selected.slug}
                    </p>
                  </div>
                  <StatusBadge status={selected.status} />
                </div>

                <dl className="grid gap-3 sm:grid-cols-2">
                  <DetailRow term="Eligibility policy" value={selected.eligibility_policy.replace(/_/g, " ")} />
                  <DetailRow term="Result visibility" value={selected.result_visibility.replace(/_/g, " ")} />
                  <DetailRow term="Category" value={selected.category_id ? `#${selected.category_id}` : "Uncategorized"} />
                  <DetailRow
                    term="Organization"
                    value={selected.organization_id ? `#${selected.organization_id}` : "None"}
                  />
                </dl>

                <div className="flex flex-wrap gap-2 border-t pt-4">
                  <Button asChild size="sm">
                    <Link href={`/elections/${selected.slug}`}>View public page</Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/vote/${selected.slug}`}>Open ballot</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </section>
      </PullToRefresh>
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <p className="nums-tabular mt-2 text-3xl font-extrabold tracking-tight">
          {value === undefined ? (
            <Skeleton className="h-9 w-16" />
          ) : (
            <CountUp value={value} />
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function DetailRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <dt className="text-xs text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-sm font-medium capitalize">{value}</dd>
    </div>
  );
}