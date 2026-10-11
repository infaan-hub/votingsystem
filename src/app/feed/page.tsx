import Link from "next/link";
import { Newspaper, Radio } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { LiveSplit, type LiveSplitEntry } from "@/src/components/live-split";
import { ShareButton } from "@/src/components/share-button";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Tabs } from "@/src/components/ui/tabs";
import { displayName } from "@/src/lib/page-helpers";
import tenant from "@/config/tenant";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const election = await prisma.election.findFirst({
    where: { isPublished: true },
    orderBy: { votingStartAt: "desc" },
    include: {
      positions: {
        orderBy: { order: "asc" },
        include: {
          candidates: {
            where: { approved: true },
            include: {
              user: { include: { department: true } },
              _count: { select: { votes: true } },
            },
          },
        },
      },
      announcements: {
        where: { OR: [{ publishAt: null }, { publishAt: { lte: new Date() } }] },
        orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        take: 8,
      },
    },
  });

  // Head-to-head pairs per question, so a multi-candidate race still renders a
  // focused split rather than an unreadable N-way chart.
  const splits: Array<{ question: string; entries: LiveSplitEntry[] }> = election
    ? election.positions
        .map((position) => {
          const ranked = [...position.candidates].sort(
            (a, b) => b._count.votes - a._count.votes,
          );
          return {
            question: position.name,
            entries: ranked.slice(0, 2).map((candidate) => ({
              id: String(candidate.id),
              name: displayName(candidate.user),
              votes: candidate._count.votes,
            })),
          };
        })
        .filter((split) => split.entries.length === 2)
    : [];

  const announcements = election?.announcements ?? [];
  const live = tenant.features.liveResults;

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-extrabold leading-8 tracking-tight text-nv-ink">
            Live feed
          </h1>
          <p className="mt-1 text-[13px] text-nv-muted">
            {election ? election.title : "No active election"}
          </p>
        </div>
        {live ? (
          <Badge className="shrink-0 gap-1.5 border-transparent bg-nv-success text-[#06281d]">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 rounded-full bg-[#06281d]"
            />
            Live
          </Badge>
        ) : null}
      </header>

      {!election ? (
        <Card>
          <CardContent className="py-14 text-center text-[13px] text-nv-muted">
            There is no election to follow right now.
          </CardContent>
        </Card>
      ) : splits.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center text-[13px] text-nv-muted">
            Head-to-head counts appear once at least two candidates are approved
            for a question.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {splits.map((split) => (
            <section key={split.question}>
              <h2 className="mb-2 text-[13px] font-bold uppercase tracking-[0.4px] text-nv-muted">
                {split.question}
              </h2>
              <LiveSplit entries={split.entries} />
            </section>
          ))}
        </div>
      )}

      <Tabs
        items={[
          {
            id: "news",
            label: "News",
            content: (
              <div className="mt-4 space-y-3">
                {announcements.length === 0 ? (
                  <p className="py-8 text-center text-[13px] text-nv-muted">
                    No announcements have been published.
                  </p>
                ) : (
                  announcements.map((announcement) => (
                    <article
                      key={announcement.id}
                      className="rounded-nv-md bg-white p-3.5 shadow-nv-card dark:bg-[#171930]"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="nv-grad-profile grid h-11 w-11 shrink-0 place-items-center rounded-lg text-white"
                        >
                          <Newspaper className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="text-[14px] font-bold text-nv-ink">
                            {announcement.title}
                          </h3>
                          <p className="mt-1 line-clamp-3 text-[13px] leading-5 text-nv-muted">
                            {announcement.message}
                          </p>
                          {announcement.isPinned ? (
                            <span className="mt-1.5 inline-block text-[10px] font-bold uppercase tracking-wide text-nv-primary">
                              Pinned
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            ),
          },
          {
            id: "social",
            label: "Social",
            content: (
              <div className="mt-4 space-y-3">
                <p className="py-8 text-center text-[13px] text-nv-muted">
                  Social posts appear here once the tenant enables them.
                </p>
              </div>
            ),
          },
        ]}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        <Button asChild>
          <Link href={`/vote/${election?.slug ?? ""}`}>
            <Radio className="h-4 w-4" aria-hidden="true" />
            Cast your vote
          </Link>
        </Button>
        <ShareButton title={election?.title ?? "Live results"} />
      </div>
    </div>
  );
}