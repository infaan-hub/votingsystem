import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { buildPositionRanking } from "@/src/lib/services";
import { normalizeBallotSelections, submitBallot } from "@/src/lib/vote-submit";
import { hashPassword } from "@/src/lib/password";
import { USER_INCLUDE } from "@/src/lib/auth";
import { resetDb } from "./helpers";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

async function seedWorkflow() {
  const department = await prisma.department.create({
    data: { name: "Computer Science", code: "CS", description: "" },
  });
  const section = await prisma.section.create({
    data: { departmentId: department.id, name: "Year 2", code: "Y2", description: "" },
  });
  const now = Date.now();
  const election = await prisma.election.create({
    data: {
      title: "Campus Leaders 2026",
      slug: "campus-leaders-2026",
      description: "Department and class leadership elections.",
      status: "OPEN",
      isPublished: true,
      campaignStartAt: new Date(now - 2 * DAY),
      campaignEndAt: new Date(now + DAY),
      votingStartAt: new Date(now - HOUR),
      votingEndAt: new Date(now + 3 * HOUR),
      allowLiveResults: true,
    },
  });
  const position = await prisma.position.create({
    data: {
      electionId: election.id,
      name: "Class Representative",
      departmentId: department.id,
      sectionId: section.id,
      voterGroup: "student",
      maxWinners: 1,
    },
  });
  const candidateUser = await prisma.user.create({
    data: {
      username: "candidate1",
      password: hashPassword("Pass1234!"),
      firstName: "Amina",
      lastName: "Ali",
      role: "voter",
      departmentId: department.id,
      sectionId: section.id,
    },
  });
  const voter = await prisma.user.create({
    data: {
      username: "student1",
      password: hashPassword("Pass1234!"),
      firstName: "Ibrahim",
      lastName: "Said",
      role: "voter",
      departmentId: department.id,
      sectionId: section.id,
    },
  });
  const otherCandidateUser = await prisma.user.create({
    data: {
      username: "candidate2",
      password: hashPassword("Pass1234!"),
      firstName: "Halima",
      lastName: "Omari",
      role: "voter",
      departmentId: department.id,
      sectionId: section.id,
    },
  });
  const candidate = await prisma.candidate.create({
    data: {
      userId: candidateUser.id,
      electionId: election.id,
      positionId: position.id,
      departmentId: department.id,
      sectionId: section.id,
      slogan: "Lead with transparency",
      approved: true,
    },
  });
  const otherCandidate = await prisma.candidate.create({
    data: {
      userId: otherCandidateUser.id,
      electionId: election.id,
      positionId: position.id,
      departmentId: department.id,
      sectionId: section.id,
      slogan: "Students first",
      approved: true,
    },
  });

  const voterWithRelations = (await prisma.user.findUniqueOrThrow({
    where: { id: voter.id },
    include: USER_INCLUDE,
  }))!;
  const positionRow = (await prisma.position.findUniqueOrThrow({
    where: { id: position.id },
    include: { department: true, section: { include: { department: true } } },
  }))!;

  return {
    election,
    candidateUser,
    voterWithRelations,
    candidate,
    otherCandidate,
    positionRow,
  };
}

describe("VotingWorkflowTests", () => {
  beforeEach(resetDb);

  it("allows a user to vote only once per position", async () => {
    const { election, voterWithRelations, candidate, otherCandidate, positionRow } =
      await seedWorkflow();

    const entries = await normalizeBallotSelections(election, voterWithRelations, [
      { position_id: positionRow.id, candidate_ids: [candidate.id] },
    ]);
    const result = await submitBallot({
      user: voterWithRelations,
      election,
      entries,
    });
    expect(result.replayed).toBe(false);
    expect(result.receiptCode).toHaveLength(24);

    // The same question cannot be answered twice — a submission for the other
    // option in that question is rejected.
    const retryEntries = await normalizeBallotSelections(election, voterWithRelations, [
      { position_id: positionRow.id, candidate_ids: [otherCandidate.id] },
    ]);
    await expect(
      submitBallot({ user: voterWithRelations, election, entries: retryEntries }),
    ).rejects.toMatchObject({ status: 400 });

    const stored = await prisma.vote.findMany({ where: { voterId: voterWithRelations.id } });
    expect(stored).toHaveLength(1);
    expect(await prisma.voteSubmission.count()).toBe(1);
  });

  it("orders candidate rankings by vote count", async () => {
    const { election, candidateUser, voterWithRelations, candidate, positionRow } =
      await seedWorkflow();

    const secondVoter = await prisma.user.create({
      data: {
        username: "student2",
        password: hashPassword("Pass1234!"),
        firstName: "Mariam",
        lastName: "Yusuf",
        role: "voter",
        departmentId: candidate.departmentId,
        sectionId: candidate.sectionId,
      },
    });
    const secondVoterWithRelations = (await prisma.user.findUniqueOrThrow({
      where: { id: secondVoter.id },
      include: USER_INCLUDE,
    }))!;

    const entries = await normalizeBallotSelections(election, voterWithRelations, [
      { position_id: positionRow.id, candidate_ids: [candidate.id] },
    ]);
    await submitBallot({ user: voterWithRelations, election, entries });
    const secondEntries = await normalizeBallotSelections(election, secondVoterWithRelations, [
      { position_id: positionRow.id, candidate_ids: [candidate.id] },
    ]);
    await submitBallot({ user: secondVoterWithRelations, election, entries: secondEntries });

    const ranking = await buildPositionRanking(positionRow);
    expect(ranking[0].candidate_name).toBe(`${candidateUser.firstName} ${candidateUser.lastName}`);
    expect(ranking[0].vote_total).toBe(2);
    expect(ranking[0].is_winner).toBe(true);
  });
});
