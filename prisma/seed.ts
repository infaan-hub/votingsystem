import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

const DAY = 86400000;

async function upsertDepartment(name: string, code: string, description: string) {
  return prisma.department.upsert({
    where: { code },
    update: {},
    create: { name, code, description },
  });
}

async function upsertSection(departmentId: number, name: string, code: string, description: string) {
  const existing = await prisma.section.findFirst({ where: { departmentId, code } });
  if (existing) return existing;
  return prisma.section.create({ data: { departmentId, name, code, description } });
}

async function upsertUser(
  username: string,
  data: {
    password?: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isStaff?: boolean;
    isSuperuser?: boolean;
    departmentId?: number | null;
    sectionId?: number | null;
    registrationNumber?: string;
    staffId?: string;
  },
) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  const password = data.password ? hashPassword(data.password) : "!";
  return prisma.user.create({
    data: {
      username,
      password,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      isStaff: data.isStaff ?? false,
      isSuperuser: data.isSuperuser ?? false,
      departmentId: data.departmentId ?? null,
      sectionId: data.sectionId ?? null,
      registrationNumber: data.registrationNumber ?? "",
      staffId: data.staffId ?? "",
    },
  });
}

async function main() {
  const cs = await upsertDepartment("Computer Science", "CS", "School of computing and software engineering.");
  const business = await upsertDepartment("Business Administration", "BUS", "Business and entrepreneurship studies.");
  const staff = await upsertDepartment("Administration", "ADM", "Administrative and support staff.");

  const csYearTwo = await upsertSection(cs.id, "Year 2 A", "Y2A", "Second year class A.");

  const now = Date.now();
  const electionTitle = "University Leadership Election 2026";
  let election = await prisma.election.findFirst({ where: { title: electionTitle } });
  if (!election) {
    election = await prisma.election.create({
      data: {
        title: electionTitle,
        description:
          "Digital voting for students and staff with real-time campaign, turnout, and ranking visibility.",
        campaignStartAt: new Date(now - 5 * DAY),
        campaignEndAt: new Date(now + 2 * DAY),
        votingStartAt: new Date(now - 3600000),
        votingEndAt: new Date(now + DAY),
        allowLiveResults: true,
        announceWinnersAutomatically: true,
        isPublished: true,
      },
    });
  }

  const existingClassLeader = await prisma.position.findFirst({
    where: { electionId: election.id, name: "Class Leader" },
  });
  const classLeader =
    existingClassLeader ??
    (await prisma.position.create({
      data: {
        electionId: election.id,
        name: "Class Leader",
        description: "Leader for the Year 2 A Computer Science section.",
        departmentId: cs.id,
        sectionId: csYearTwo.id,
        voterGroup: "student",
        maxWinners: 1,
      },
    }));

  const existingStaffRep = await prisma.position.findFirst({
    where: { electionId: election.id, name: "Workers Representative" },
  });
  const staffRepresentative =
    existingStaffRep ??
    (await prisma.position.create({
      data: {
        electionId: election.id,
        name: "Workers Representative",
        description: "Representative seat for workers and other university staff.",
        departmentId: staff.id,
        voterGroup: "staff_and_officer",
        maxWinners: 1,
      },
    }));

  await upsertUser("admin", {
    password: "Admin123!",
    firstName: "System",
    lastName: "Admin",
    email: "admin@campus.local",
    role: "admin",
    isStaff: true,
    isSuperuser: true,
  });

  const studentA = await upsertUser("student_a", {
    password: "Pass1234!",
    firstName: "Asha",
    lastName: "Kassim",
    email: "student_a@campus.local",
    role: "student",
    departmentId: cs.id,
    sectionId: csYearTwo.id,
    registrationNumber: "CS2026/001",
  });
  const studentB = await upsertUser("student_b", {
    password: "Pass1234!",
    firstName: "Bakari",
    lastName: "Juma",
    email: "student_b@campus.local",
    role: "student",
    departmentId: cs.id,
    sectionId: csYearTwo.id,
    registrationNumber: "CS2026/002",
  });
  const staffA = await upsertUser("staff_a", {
    password: "Pass1234!",
    firstName: "David",
    lastName: "Mrema",
    email: "staff_a@campus.local",
    role: "staff",
    departmentId: staff.id,
    staffId: "STF/011",
  });
  const staffB = await upsertUser("staff_b", {
    password: "Pass1234!",
    firstName: "Rehema",
    lastName: "Selemani",
    email: "staff_b@campus.local",
    role: "staff",
    departmentId: staff.id,
    staffId: "STF/012",
  });
  void business;

  async function upsertCandidate(
    positionId: number,
    userId: number,
    departmentId: number,
    sectionId: number | null,
    slogan: string,
    manifesto: string,
  ) {
    const existing = await prisma.candidate.findFirst({ where: { electionId: election!.id, positionId, userId } });
    if (existing) return existing;
    return prisma.candidate.create({
      data: {
        electionId: election!.id,
        positionId,
        userId,
        departmentId,
        sectionId,
        slogan,
        manifesto,
        approved: true,
      },
    });
  }

  const candA = await upsertCandidate(
    classLeader.id,
    studentA.id,
    cs.id,
    csYearTwo.id,
    "Build a stronger class voice",
    "Open feedback channels, study groups, and transparent representation.",
  );
  const candB = await upsertCandidate(
    classLeader.id,
    studentB.id,
    cs.id,
    csYearTwo.id,
    "Action that students can feel",
    "Better communication with lecturers and improved event planning.",
  );
  const candStaffA = await upsertCandidate(
    staffRepresentative.id,
    staffA.id,
    staff.id,
    null,
    "Respect every worker",
    "Stronger staff welfare communication and fair representation.",
  );
  const candStaffB = await upsertCandidate(
    staffRepresentative.id,
    staffB.id,
    staff.id,
    null,
    "Support staff, improve service",
    "Practical support channels for staff and facility teams.",
  );

  const existingAnnouncement = await prisma.announcement.findFirst({
    where: { electionId: election.id, title: "Voting is now open" },
  });
  if (!existingAnnouncement) {
    await prisma.announcement.create({
      data: {
        electionId: election.id,
        title: "Voting is now open",
        message:
          "Students and staff can now review campaigns, cast votes, and monitor live turnout in real time.",
        announcementType: "notice",
        isPinned: true,
      },
    });
  }

  async function ensureVote(voterId: number, candidateId: number, positionId: number) {
    const existing = await prisma.vote.findFirst({
      where: { voterId, electionId: election!.id, positionId },
    });
    if (existing) return;
    await prisma.vote.create({
      data: { voterId, candidateId, electionId: election!.id, positionId },
    });
  }

  await ensureVote(studentB.id, candA.id, classLeader.id);
  await ensureVote(studentA.id, candB.id, classLeader.id);
  await ensureVote(staffB.id, candStaffA.id, staffRepresentative.id);
  void candStaffB;

  console.log("Demo election data seeded successfully.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
