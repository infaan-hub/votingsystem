import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/src/lib/db";
import { buildPositionRanking, castVote } from "@/src/lib/services";
import { ValidationError } from "@/src/lib/validation";
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
      description: "Department and class leadership elections.",
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
      role: "student",
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
      role: "student",
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
      role: "student",
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
  const candidateRow = (await prisma.candidate.findUniqueOrThrow({
    where: { id: candidate.id },
    include: {
      user: { include: USER_INCLUDE },
      department: true,
      section: { include: { department: true } },
    },
  }))!;
  const otherCandidateRow = (await prisma.candidate.findUniqueOrThrow({
    where: { id: otherCandidate.id },
    include: {
      user: { include: USER_INCLUDE },
      department: true,
      section: { include: { department: true } },
    },
  }))!;
  const positionRow = (await prisma.position.findUniqueOrThrow({
    where: { id: position.id },
    include: { department: true, section: { include: { department: true } } },
  }))!;

  return {
    candidateUser,
    voterWithRelations,
    candidateRow,
    otherCandidateRow,
    positionRow,
  };
}

describe("VotingWorkflowTests", () => {
  beforeEach(resetDb);

  it("allows a user to vote only once per position", async () => {
    const { voterWithRelations, candidateRow, otherCandidateRow, positionRow } =
      await seedWorkflow();

    const vote = await castVote(voterWithRelations, candidateRow);
    expect(vote.positionId).toBe(positionRow.id);

    await expect(castVote(voterWithRelations, otherCandidateRow)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("orders candidate rankings by vote count", async () => {
    const { candidateUser, voterWithRelations, candidateRow, positionRow } =
      await seedWorkflow();

    const secondVoter = await prisma.user.create({
      data: {
        username: "student2",
        password: hashPassword("Pass1234!"),
        firstName: "Mariam",
        lastName: "Yusuf",
        role: "student",
        departmentId: candidateRow.departmentId,
        sectionId: candidateRow.sectionId,
      },
    });
    const secondVoterWithRelations = (await prisma.user.findUniqueOrThrow({
      where: { id: secondVoter.id },
      include: USER_INCLUDE,
    }))!;

    await castVote(voterWithRelations, candidateRow);
    await castVote(secondVoterWithRelations, candidateRow);

    const ranking = await buildPositionRanking(positionRow);
    expect(ranking[0].candidate_name).toBe(`${candidateUser.firstName} ${candidateUser.lastName}`);
    expect(ranking[0].vote_total).toBe(2);
    expect(ranking[0].is_winner).toBe(true);
  });
});
