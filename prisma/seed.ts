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
  // Ensure the migration-seeded default categories exist so the seeded
  // election can be assigned to a real category.
  const educationCategory = await prisma.electionCategory.upsert({
    where: { slug: "education" },
    update: {},
    create: {
      name: "Education",
      slug: "education",
      description: "University and school elections.",
      icon: "graduation-cap",
      isSystem: true,
    },
  });

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
        slug: "university-leadership-election-2026",
        description:
          "Digital voting for students and staff with real-time campaign, turnout, and ranking visibility.",
        categoryId: educationCategory.id,
        status: "OPEN",
        eligibilityPolicy: "legacy_academic",
        resultVisibility: "live",
        timezone: "UTC",
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
    role: "voter",
    departmentId: cs.id,
    sectionId: csYearTwo.id,
    registrationNumber: "CS2026/001",
  });
  const studentB = await upsertUser("student_b", {
    password: "Pass1234!",
    firstName: "Bakari",
    lastName: "Juma",
    email: "student_b@campus.local",
    role: "voter",
    departmentId: cs.id,
    sectionId: csYearTwo.id,
    registrationNumber: "CS2026/002",
  });
  const staffA = await upsertUser("staff_a", {
    password: "Pass1234!",
    firstName: "David",
    lastName: "Mrema",
    email: "staff_a@campus.local",
    role: "voter",
    departmentId: staff.id,
    staffId: "STF/011",
  });
  const staffB = await upsertUser("staff_b", {
    password: "Pass1234!",
    firstName: "Rehema",
    lastName: "Selemani",
    email: "staff_b@campus.local",
    role: "voter",
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

  await seedCorporateElection(now);
  await seedPartiesRatingsAndOpinions();

  console.log("Demo election data seeded successfully.");
}

/**
 * Demonstrates the general-purpose platform: a corporate election that uses a
 * custom category, an organization, an organization-membership eligibility
 * policy, a yes/no referendum (ballot options rather than candidates), and a
 * written policy instead of a traditional title/description — none of which
 * involve any education-specific field.
 */
async function seedCorporateElection(now: number) {
  const corporateSlug = "northwind-works-council-2026";

  const org = await prisma.organization.upsert({
    where: { slug: "northwind" },
    update: {},
    create: {
      name: "Northwind Industrial",
      slug: "northwind",
      description: "Manufacturing company with a worker works council.",
      orgType: "company",
    },
  });

  const existing = await prisma.election.findUnique({ where: { slug: corporateSlug } });
  let election = existing;
  if (!election) {
    const category = await prisma.electionCategory.upsert({
      where: { slug: "corporate" },
      update: {},
      create: {
        name: "Corporate",
        slug: "corporate",
        description: "Corporate and employee representative elections.",
        icon: "building-2",
        isSystem: true,
      },
    });

    election = await prisma.election.create({
      data: {
        title: "Northwind Works Council Election 2026",
        slug: corporateSlug,
        description:
          "Elect two district employee representatives and settle the flexible-working referendum.",
        instructions:
          "You may choose up to two representatives and answer the referendum question. Both are required.",
        categoryId: category.id,
        organizationId: org.id,
        status: "OPEN",
        eligibilityPolicy: "org_members",
        resultVisibility: "hidden",
        timezone: "Europe/London",
        campaignStartAt: new Date(now - 4 * DAY),
        campaignEndAt: new Date(now + 1 * DAY),
        votingStartAt: new Date(now - 3600000),
        votingEndAt: new Date(now + 2 * DAY),
        isPublished: true,
      },
    });
  }

  const existingRepPosition = await prisma.position.findFirst({
    where: { electionId: election.id, name: "Works Council Representative" },
  });
  const repPosition = existingRepPosition
    ?? (await prisma.position.create({
      data: {
        electionId: election.id,
        name: "Works Council Representative",
        description: "Two representatives for the shop-floor district.",
        ballotType: "candidate",
        maxSelections: 2,
        maxWinners: 2,
        order: 1,
      },
    }));

  const existingReferendum = await prisma.position.findFirst({
    where: { electionId: election.id, name: "Flexible working hours" },
  });
  const referendum = existingReferendum
    ?? (await prisma.position.create({
      data: {
        electionId: election.id,
        name: "Flexible working hours",
        description: "Should the company trial flexible working hours for six months?",
        ballotType: "yes_no",
        maxSelections: 1,
        order: 2,
      },
    }));

  // Yes / No ballot options prove a non-candidate ballot works end to end.
  for (const [order, label, description] of [
    [1, "Yes", "Trial flexible working hours for six months."],
    [2, "No", "Keep the current fixed schedule."],
  ] as const) {
    const found = await prisma.ballotOption.findFirst({
      where: { positionId: referendum.id, label },
    });
    if (!found) {
      await prisma.ballotOption.create({
        data: { positionId: referendum.id, label, description, order },
      });
    }
  }

  // These four employees belong to the organization. Election-level
  // eligibility policies (including org membership) are not yet enforced at
  // vote time; only per-position department/section rules are.
  const membersByUsername = ["kezia", "marcus", "priya", "tomas"];
  const members = [];
  for (const username of membersByUsername) {
    members.push(
      await upsertUser(username, {
        password: "Works2026!",
        firstName: username[0].toUpperCase() + username.slice(1),
        lastName: "Ford",
        email: `${username}@northwind.example`,
        role: "voter",
        registrationNumber: "",
        staffId: `NW-${username.toUpperCase()}`,
      }),
    );
  }

  // Two approved candidates draw from the same member pool, mirroring how a
  // works council nominates sitting employees.
  const repCandidates = [
    {
      username: "kezia",
      firstName: "Kezia",
      slogan: "Safer, quieter production lines",
      manifesto: "Fund hearing protection and redesign the loud-press layout.",
    },
    {
      username: "marcus",
      firstName: "Marcus",
      slogan: "Transparent overtime rules",
      manifesto: "Publish overtime allocations 30 days in advance every month.",
    },
    {
      username: "priya",
      firstName: "Priya",
      slogan: "Skills and apprenticeships",
      manifesto: "Expand paid apprenticeships and internal promotion routes.",
    },
  ];
  const createdCandidates = [];
  for (const [index, rep] of repCandidates.entries()) {
    const candidateUser = await upsertUser(`${rep.username}c`, {
      password: "Works2026!",
      firstName: rep.firstName,
      lastName: "Ford",
      email: `${rep.username}c@northwind.example`,
      role: "voter",
      registrationNumber: "",
      staffId: `NW-${rep.username.toUpperCase()}C`,
    });
    const alreadyCandidate = await prisma.candidate.findFirst({
      where: { positionId: repPosition.id, userId: candidateUser.id },
    });
    createdCandidates.push(
      alreadyCandidate ??
        (await prisma.candidate.create({
          data: {
            userId: candidateUser.id,
            electionId: election.id,
            positionId: repPosition.id,
            approved: true,
            featuredOrder: index,
            slogan: rep.slogan,
            manifesto: rep.manifesto,
          },
        })),
    );
  }

  // A few recorded ballots so published-result rendering has real data.
  const ballots = [
    [members[1].id, createdCandidates[0].id],
    [members[2].id, createdCandidates[0].id],
    [members[3].id, createdCandidates[1].id],
  ];
  for (const [voterId, candidateId] of ballots) {
    if (voterId === undefined || candidateId === undefined) continue;
    const existingVote = await prisma.vote.findFirst({
      where: { voterId, electionId: election.id, positionId: repPosition.id },
    });
    if (!existingVote) {
      await prisma.vote.create({
        data: { voterId, candidateId, electionId: election.id, positionId: repPosition.id },
      });
    }
  }

  console.log("Corporate (non-education) demo election seeded with ballot options.");
}

/**
 * Region-agnostic ballot groups, rating dimensions, and public opinions.
 *
 * Party names are deliberately invented and generic — nothing on the ballot is
 * tied to a country, and the tenant renames the concept via `config/tenant.ts`.
 */
async function seedPartiesRatingsAndOpinions() {
  const parties = [
    { name: "Progress Alliance", slug: "progress-alliance", code: "PA", color: "#1F4FD8" },
    { name: "Civic Union", slug: "civic-union", code: "CU", color: "#18C48F" },
    { name: "Reform Bloc", slug: "reform-bloc", code: "RB", color: "#F5A524" },
  ];

  for (const party of parties) {
    await prisma.party.upsert({
      where: { slug: party.slug },
      update: {},
      create: party,
    });
  }

  // Attach the first two parties to approved candidates so badges and the
  // group filters have something to show.
  const approved = await prisma.candidate.findMany({
    where: { approved: true, partyId: null },
    orderBy: { createdAt: "asc" },
    take: 6,
  });
  for (const [index, candidate] of approved.entries()) {
    const party = parties[index % parties.length];
    if (!party) continue;
    await prisma.candidate.update({
      where: { id: candidate.id },
      data: { partyId: (await prisma.party.findUnique({ where: { slug: party.slug } }))!.id },
    });
  }

  // Rating dimensions per position, scoped so a referendum stays unrated.
  const positions = await prisma.position.findMany({
    where: { ballotType: "candidate" },
    take: 3,
    include: { candidates: { where: { approved: true }, take: 2 } },
  });

  for (const position of positions) {
    const dimensions = ["Vision", "Track record", "Communication"];
    for (const [order, name] of dimensions.entries()) {
      await prisma.ratingCategory.upsert({
        where: { positionId_name: { positionId: position.id, name } },
        update: { order },
        create: { positionId: position.id, name, order },
      });
    }

    if (position.candidates.length === 0) continue;

    const categories = await prisma.ratingCategory.findMany({
      where: { positionId: position.id },
      orderBy: { order: "asc" },
    });

    // A handful of deterministic ratings so the bars render real averages.
    const scores = [4, 5, 3, 4, 5];
    for (const candidate of position.candidates) {
      for (const [categoryIndex, category] of categories.entries()) {
        const scalar = scores[(categoryIndex + 1) % scores.length];
        const score = typeof scalar === "number" ? scalar : 4;
        const existing = await prisma.candidateRating.findFirst({
          where: {
            candidateId: candidate.id,
            categoryId: category.id,
            voterId: candidate.userId,
          },
        });
        if (existing) {
          await prisma.candidateRating.update({
            where: { id: existing.id },
            data: { score },
          });
        } else {
          await prisma.candidateRating.create({
            data: {
              candidateId: candidate.id,
              categoryId: category.id,
              voterId: candidate.userId,
              score,
            },
          });
        }
      }
    }

    // One public opinion per candidate so the tab is not empty.
    for (const candidate of position.candidates) {
      const existingOpinion = await prisma.opinion.findFirst({
        where: { candidateId: candidate.id },
      });
      if (existingOpinion) continue;
      // Opinions need a voter; reuse the candidate's own account for the demo
      // rather than inventing a new identity.
      await prisma.opinion.create({
        data: {
          candidateId: candidate.id,
          voterId: candidate.userId,
          body: "Clear plan and responsive to questions from members.",
          up: 12,
          down: 1,
        },
      });
    }
  }

  console.log("Parties, rating categories, and opinions seeded.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
