"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ChevronRight,
  LogOut,
  MessageSquare,
  Pencil,
  Shield,
  Vote,
} from "lucide-react";

import { useApp } from "@/src/components/AppProvider";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useToast } from "@/src/components/ui/toast";
import { initialsFor } from "@/src/lib/page-helpers";
import tenant, { t } from "@/config/tenant";

const FAVOURITES_KEY = "nexvote-favourites";

function readFavourites(): number[] {
  try {
    const raw = window.localStorage.getItem(FAVOURITES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "number") : [];
  } catch {
    return [];
  }
}

export default function ProfilePage() {
  const { user, token, handleLogout } = useApp();
  const { toast } = useToast();
  const [favourites, setFavourites] = useState<number[]>([]);
  const [votesCast, setVotesCast] = useState<number | null>(null);

  useEffect(() => {
    setFavourites(readFavourites());
  }, []);

  const loadActivity = useCallback(async () => {
    if (!token) return;
    try {
      const response = await fetch("/api/elections/", {
        headers: { Authorization: `Token ${token}` },
      });
      if (!response.ok) return;
      const elections = (await response.json()) as Array<{
        positions?: Array<{ candidates?: Array<{ vote_total?: number }> }>;
      }>;
      // The public list endpoint does not expose a voter's own ballot, so this
      // reports the platform-wide total that is actually observable.
      const total = elections.reduce((sum, entry) => {
        const positions = entry.positions ?? [];
        return (
          sum +
          positions.reduce((inner, position) => {
            const candidates = position.candidates ?? [];
            return (
              inner +
              candidates.reduce((deep, candidate) => deep + (candidate.vote_total ?? 0), 0)
            );
          }, 0)
        );
      }, 0);
      setVotesCast(total);
    } catch {
      setVotesCast(null);
    }
  }, [token]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  /** Profile edits go through the electoral office; the button says so rather
   *  than navigating to a page that does not exist. */
  function onEditRequest() {
    toast({
      title: "Contact the electoral office",
      description: `Profile changes are handled by ${tenant.authority.name} at ${tenant.authority.contactEmail}.`,
      tone: "info",
    });
  }

  if (!user) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
          <span className="nv-grad-profile grid h-14 w-14 place-items-center rounded-full text-nv-ink">
            <Shield className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="text-[18px] font-bold text-nv-ink">Sign in to continue</h1>
          <p className="max-w-sm text-[13px] text-nv-muted">
            Your profile, favourites, and voting history live behind
            authentication.
          </p>
          <Button asChild className="sm:w-52">
            <Link href="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* ---------------- Navy banner ---------------- */}
      <section className="nv-grad-profile relative -mx-4 -mt-4 overflow-hidden rounded-b-[28px] px-4 pb-6 pt-6">
        <div className="relative flex items-center gap-3.5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-nv-ink/20 text-xl font-bold text-nv-ink">
            {initialsFor(user.full_name || user.username)}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[20px] font-extrabold text-nv-ink">
              {user.full_name || user.username}
            </h1>
            <p className="nums-tabular truncate text-[13px] text-nv-ink/80">
              {t.idLabel}: {user.username}
            </p>
          </div>
          <button
            type="button"
            onClick={onEditRequest}
            aria-label="Edit profile"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-nv-ink/20 text-nv-ink transition-colors hover:bg-nv-ink/30"
          >
            <Pencil className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <dl className="relative mt-5 grid grid-cols-2 gap-3">
          <BannerStat term="Role" value={user.role} />
          <BannerStat term="Sign-in" value={user.auth_provider} />
        </dl>
      </section>

      {/* ---------------- Constituency card ---------------- */}
      <Card>
        <CardContent className="flex items-center gap-3.5 p-4">
          <span
            aria-hidden="true"
            className="nv-grad-candidate grid h-11 w-11 shrink-0 place-items-center rounded-full text-nv-navy"
          >
            <Vote className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-nv-ink">
              {t.constituency} &amp; {t.region}
            </p>
            <p className="text-[12px] text-nv-muted">
              Set where you are registered to vote.
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-nv-muted" aria-hidden="true" />
        </CardContent>
      </Card>

      {/* ---------------- Activity ---------------- */}
      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="text-[15px] font-bold text-nv-ink">
          Your activity
        </h2>

        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
                Marked favourites
              </p>
              <p className="nums-tabular mt-1 text-[26px] font-extrabold leading-8 text-nv-ink">
                {favourites.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
                Platform votes counted
              </p>
              {votesCast === null ? (
                <Skeleton className="mt-2 h-8 w-16" />
              ) : (
                <p className="nums-tabular mt-1 text-[26px] font-extrabold leading-8 text-nv-ink">
                  {votesCast.toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ---------------- Favourites ---------------- */}
      <section aria-labelledby="favourites-heading" className="space-y-3">
        <h2 id="favourites-heading" className="text-[15px] font-bold text-nv-ink">
          Marked favourites
        </h2>
        {favourites.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <Bookmark className="h-7 w-7 text-nv-muted" aria-hidden="true" />
              <p className="text-[13px] text-nv-muted">
                Tap the bookmark on any candidate to save them here.
              </p>
            </CardContent>
          </Card>
        ) : (
          <ul className="space-y-2">
            {favourites.map((id) => (
              <li key={id}>
                <Link
                  href={`/candidates/${id}`}
                  className="flex items-center gap-3 rounded-nv-md bg-nv-surface p-3 shadow-nv-card"
                >
                  <span
                    aria-hidden="true"
                    className="nv-grad-profile grid h-10 w-10 shrink-0 place-items-center rounded-full text-[12px] font-bold text-nv-ink"
                  >
                    #{id}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] font-semibold text-nv-ink">
                    Candidate #{id}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-nv-muted" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------------- Opinions by you ---------------- */}
      <section aria-labelledby="opinions-heading" className="space-y-3">
        <h2 id="opinions-heading" className="text-[15px] font-bold text-nv-ink">
          Opinions by you
        </h2>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <MessageSquare className="h-7 w-7 text-nv-muted" aria-hidden="true" />
            <p className="text-[13px] text-nv-muted">
              You have not posted any opinions yet.
            </p>
          </CardContent>
        </Card>
      </section>

      {/* ---------------- Session ---------------- */}
      <section className="space-y-2 border-t border-nv-line pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {tenant.authority.name}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" className="w-auto px-4">
            <Link href="/privacy">Privacy</Link>
          </Button>
          <Button asChild variant="ghost" className="w-auto px-4">
            <Link href="/terms">Terms</Link>
          </Button>
        </div>
        <Button variant="subtle" onClick={handleLogout}>
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sign out
        </Button>
      </section>
    </div>
  );
}

function BannerStat({ term, value }: { term: string; value: string }) {
  return (
    <div className="rounded-lg bg-nv-ink/15 px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.4px] text-nv-ink/75">
        {term}
      </dt>
      <dd className="text-[13px] font-bold capitalize text-nv-ink">{value}</dd>
    </div>
  );
}