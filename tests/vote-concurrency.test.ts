import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { USER_INCLUDE } from "@/src/lib/auth";
import { castVote } from "@/src/lib/services";
import { ValidationError } from "@/src/lib/validation";
import { resetDb } from "./helpers";

const HOUR = 60 * 60 * 1000;

describe("ConcurrentVoteTests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function seedRace() {
    const now = Date.now();
    const election = await prisma.election.create({
      data: {
        title: "Race Election",
        slug: "race-election",
        campaignStartAt: new Date(now - HOUR),
        campaignEndAt: new Date(now + HOUR),
        votingStartAt: new Date(now - HOUR),
        votingEndAt: new Date(now + HOUR),
        allowLiveResults: true,
      },
    });
    const position = await prisma.position.create({
      data: { electionId: election.id, name: "President", voterGroup: "all", maxWinners: 1 },
    });
    const candUsers = await Promise.all(
      ["cand_one", "cand_two"].map((username, index) =>
        prisma.user.create({
          data: { username, password: hashPassword("Pass1234!"), role: "voter" },
        }).then((user) =>
          prisma.candidate.create({
            data: {
              userId: user.id,
              electionId: election.id,
              positionId: position.id,
              approved: true,
              featuredOrder: index,
            },
          }),
        ),
      ),
    );
    const voter = await prisma.user.create({
      data: { username: "racer", password: hashPassword("Pass1234!"), role: "voter" },
    });
    const voterWithRelations = (await prisma.user.findUniqueOrThrow({
      where: { id: voter.id },
      include: USER_INCLUDE,
    }))!;
    return { election, position, candidates: candUsers, voterWithRelations };
  }

  it("persists exactly one vote when the same voter submits two concurrently", async () => {
    const { candidates, voterWithRelations } = await seedRace();
    const [a, b] = candidates;

    const results = await Promise.allSettled([
      castVote(voterWithRelations, a),
      castVote(voterWithRelations, b),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Exactly one wins; the loser fails with the normalized duplicate error.
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const failure = rejected[0] as PromiseRejectedResult;
    expect(failure.reason).toBeInstanceOf(ValidationError);
    expect(JSON.stringify(failure.reason.errorDict)).toContain("already voted");

    const stored = await prisma.vote.findMany({ where: { voterId: voterWithRelations.id } });
    expect(stored).toHaveLength(1);
  });
});
