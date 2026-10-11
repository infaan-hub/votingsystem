import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, ThumbsDown, ThumbsUp } from "lucide-react";

import { prisma } from "@/src/lib/db";
import { candidatePhotoPath } from "@/src/lib/page-helpers";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent } from "@/src/components/ui/card";
import { Tabs } from "@/src/components/ui/tabs";
import { FavouriteShareButton } from "@/src/components/favourite-share-button";
import { ResultsBars, type ResultDatum } from "@/src/components/results-bars";
import { t } from "@/config/tenant";

export const dynamic = "force-dynamic";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const candidateId = Number(id);
  if (!Number.isInteger(candidateId) || candidateId <= 0) notFound();

  const candidate = await prisma.candidate.findFirst({
    where: { id: candidateId, approved: true },
    include: {
      user: { include: { department: true, section: true } },
      position: true,
      election: true,
      department: true,
      section: true,
      _count: { select: { votes: true } },
    },
  });
  if (!candidate) notFound();

  // Rating categories come from the position itself; with no rating records yet
  // the panel renders an honest empty state rather than invented numbers.
  const ratingCategories = candidate.position
    ? await prisma.ratingCategory.findMany({
        where: { positionId: candidate.position.id },
        orderBy: { order: "asc" },
      })
    : [];

  const ratings = await prisma.candidateRating.findMany({
    where: { candidateId: candidate.id },
    select: { score: true, categoryId: true },
  });

  const ratingData: ResultDatum[] = ratingCategories.map((category) => {
    const scores = ratings
      .filter((rating) => rating.categoryId === category.id)
      .map((rating) => rating.score);
    const average = scores.length
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;
    return {
      id: category.id,
      label: category.name,
      // Bar width is the share of the 5-point maximum, so all bars are
      // comparable across categories.
      votes: Number(((average / 5) * 100).toFixed(1)),
    };
  });

  const overall = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating.score, 0) / ratings.length
    : 0;

  const opinions = await prisma.opinion.findMany({
    where: { candidateId: candidate.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { voter: true },
  });

  const photo = candidatePhotoPath(candidate);
  const initials = initialsFor(
    `${candidate.user.firstName} ${candidate.user.lastName}`.trim() ||
      candidate.user.username,
  );

  return (
    <div className="space-y-5">
      {/* ---------------- Hero ---------------- */}
      <section className="nv-grad-candidate relative -mx-4 -mt-4 overflow-hidden px-4 pb-8 pt-3 lg:mx-0 lg:rounded-nv-lg">
        <span
          aria-hidden="true"
          className="absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/12"
        />

        <div className="relative flex items-center justify-between">
          <Link
            href="/"
            aria-label="Go back"
            className="grid h-11 w-11 place-items-center rounded-full bg-white/20 text-white"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>
          <FavouriteShareButton name={displayFullName(candidate.user)} />
        </div>

        <div className="relative mt-4 flex items-end gap-4">
          <span className="grid h-28 w-24 shrink-0 place-items-center overflow-hidden rounded-nv-md bg-white/20">
            {photo ? (
              <img
                src={photo}
                alt=""
                width={96}
                height={112}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold text-white/85">{initials}</span>
            )}
          </span>
          <div className="min-w-0 pb-1">
            <h1 className="text-[24px] font-extrabold leading-7 tracking-tight text-white">
              {displayFullName(candidate.user)}
            </h1>
            <p className="mt-1 text-[13px] text-white/85">{candidate.position.name}</p>
            {candidate.department ? (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold text-white">
                <MapPin className="h-3 w-3" aria-hidden="true" />
                {t.constituency}: {candidate.department.name}
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* ---------------- Tabs ---------------- */}
      <Tabs
        items={[
          { id: "posts", label: "Posts", content: <PostsTab candidate={candidate} /> },
          {
            id: "info",
            label: "Info",
            content: <InfoTab candidate={candidate} initials={initials} />,
          },
          {
            id: "opinions",
            label: "People's Opinion",
            content: <OpinionsTab opinions={opinions} />,
          },
        ]}
      />

      {/* ---------------- Rating ---------------- */}
      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-bold text-nv-ink">Voter rating</h2>
              <p className="text-[12px] text-nv-muted">
                Based on {ratings.length} rating{ratings.length === 1 ? "" : "s"}
              </p>
            </div>
            <p className="nums-tabular text-[28px] font-extrabold leading-8 text-nv-ink">
              {overall.toFixed(1)}
              <span className="text-[14px] font-bold text-nv-muted"> / 5</span>
            </p>
          </div>

          {ratingData.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-nv-muted">
              No rating categories are configured for this position yet.
            </p>
          ) : (
            <ResultsBars data={ratingData} />
          )}

          <Button asChild>
            <Link href={`/vote/${candidate.election.slug}`}>Rate now</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function PostsTab({ candidate }: { candidate: PostsCandidate }) {
  return (
    <div className="mt-4 space-y-3">
      {candidate.slogan ? (
        <Card>
          <CardContent className="p-4">
            <p className="text-[15px] font-bold text-nv-ink">“{candidate.slogan}”</p>
          </CardContent>
        </Card>
      ) : null}

      {candidate.manifesto ? (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.4px] text-nv-muted">
              Manifesto
            </h3>
            <p className="mt-2 whitespace-pre-line text-[14px] leading-6 text-nv-text">
              {candidate.manifesto}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {!candidate.slogan && !candidate.manifesto ? (
        <p className="py-8 text-center text-[13px] text-nv-muted">
          This candidate has not published any posts yet.
        </p>
      ) : null}
    </div>
  );
}

function InfoTab({
  candidate,
  initials,
}: {
  candidate: InfoCandidate;
  initials: string;
}) {
  return (
    <div className="mt-4 space-y-3">
      <Card>
        <CardContent className="flex items-center gap-3.5 p-4">
          <span
            aria-hidden="true"
            className="nv-grad-profile grid h-14 w-14 shrink-0 place-items-center rounded-full text-lg font-bold text-white"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-nv-ink">
              {displayFullName(candidate.user)}
            </p>
            <p className="text-[13px] text-nv-muted">@{candidate.user.username}</p>
          </div>
        </CardContent>
      </Card>

      <dl className="grid gap-3 sm:grid-cols-2">
        <InfoRow term="Position" value={candidate.position.name} />
        <InfoRow term="Election" value={candidate.election.title} />
        <InfoRow
          term={t.constituency}
          value={candidate.department?.name ?? candidate.section?.name ?? "—"}
        />
        <InfoRow
          term={t.region}
          value={candidate.section?.name ?? "—"}
        />
        <InfoRow
          term="Votes received"
          value={String(candidate._count.votes)}
          tabular
        />
      </dl>
    </div>
  );
}

function OpinionsTab({ opinions }: { opinions: OpinionRow[] }) {
  if (opinions.length === 0) {
    return (
      <p className="py-10 text-center text-[13px] text-nv-muted">
        No public opinions have been posted about this candidate yet.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {opinions.map((opinion) => (
        <li
          key={opinion.id}
          className="rounded-nv-md bg-white p-3.5 shadow-nv-card dark:bg-[#171930]"
        >
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="nv-grad-profile grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white"
            >
              {initialsFor(opinion.voter.username)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-nv-ink">
                {opinion.voter.username}
              </p>
            </div>
            <div className="nums-tabular flex items-center gap-2 text-[12px] text-nv-muted">
              <span className="inline-flex items-center gap-1">
                <ThumbsUp className="h-3.5 w-3.5 text-nv-success" aria-hidden="true" />
                {opinion.up}
              </span>
              <span className="inline-flex items-center gap-1">
                <ThumbsDown className="h-3.5 w-3.5 text-nv-danger" aria-hidden="true" />
                {opinion.down}
              </span>
            </div>
          </div>
          <p className="mt-2 text-[13px] leading-5 text-nv-text">{opinion.body}</p>
        </li>
      ))}
    </ul>
  );
}

function InfoRow({
  term,
  value,
  tabular = false,
}: {
  term: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="rounded-lg border border-nv-line p-3">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.4px] text-nv-muted">
        {term}
      </dt>
      <dd
        className={`mt-0.5 text-[14px] font-semibold text-nv-ink${tabular ? " nums-tabular" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function initialsFor(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function displayFullName(user: {
  firstName: string;
  lastName: string;
  username: string;
}): string {
  const full = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return full || user.username;
}

type PostsCandidate = {
  slogan: string;
  manifesto: string;
};

type InfoCandidate = {
  user: { firstName: string; lastName: string; username: string };
  position: { name: string };
  election: { title: string };
  department: { name: string } | null;
  section: { name: string } | null;
  _count: { votes: number };
};

type OpinionRow = {
  id: number;
  body: string;
  up: number;
  down: number;
  voter: { username: string };
};