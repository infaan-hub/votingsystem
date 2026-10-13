import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { identifierDigest } from "@/src/lib/eligibility";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { displayName } from "@/src/lib/serializers";
import { formatDateTime } from "@/src/lib/time";

const MAX_VOTER_ENTRIES = 500;

const route = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);
      const voters = await prisma.electionVoter.findMany({
        where: { electionId: election.id },
        orderBy: { createdAt: "asc" },
      });
      const userIds = voters
        .map((voter) => voter.userId)
        .filter((userId): userId is number => userId !== null);
      const users = userIds.length
        ? await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, username: true, firstName: true, lastName: true },
          })
        : [];
      const userById = new Map(users.map((user) => [user.id, user]));
      return json(
        voters.map((voter) => {
          const user = voter.userId !== null ? (userById.get(voter.userId) ?? null) : null;
          return {
            id: voter.id,
            unique_key: voter.uniqueKey,
            label: voter.label,
            user: user
              ? {
                  id: user.id,
                  username: user.username,
                  full_name: displayName(user),
                }
              : null,
            created_at: formatDateTime(voter.createdAt),
          };
        }),
      );
    },
    POST: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);
      const payload = await readPayload(req);

      const c = new Collector();
      const label = strField(c, payload, "label", {
        required: false,
        allowBlank: true,
        maxLength: 200,
      });
      c.throwIfAny();

      const rawUserIds = payload.user_ids;
      const rawIdentifiers = payload.identifiers;
      const rawAccounts = payload.accounts;
      if (rawUserIds !== undefined && rawUserIds !== null && !Array.isArray(rawUserIds)) {
        throw fieldErrors({ user_ids: "Expected a list of user ids." });
      }
      if (rawIdentifiers !== undefined && rawIdentifiers !== null && !Array.isArray(rawIdentifiers)) {
        throw fieldErrors({ identifiers: "Expected a list of identifiers." });
      }
      if (rawAccounts !== undefined && rawAccounts !== null && !Array.isArray(rawAccounts)) {
        throw fieldErrors({ accounts: "Expected a list of emails or usernames." });
      }

      const userIds: number[] = [];
      for (const entry of ((rawUserIds as unknown[] | null) ?? [])) {
        const value =
          typeof entry === "number"
            ? entry
            : typeof entry === "string" && /^\d+$/.test(entry.trim())
              ? Number(entry.trim())
              : NaN;
        if (!Number.isInteger(value) || value <= 0) {
          throw fieldErrors({ user_ids: "Every user id must be a positive integer." });
        }
        userIds.push(value);
      }

      const identifiers: string[] = [];
      for (const entry of ((rawIdentifiers as unknown[] | null) ?? [])) {
        if (typeof entry !== "string" && typeof entry !== "number") {
          throw fieldErrors({ identifiers: "Every identifier must be a string." });
        }
        const value = String(entry).trim();
        if (value) identifiers.push(value);
      }

      // Emails or usernames resolved to active accounts (`u:<id>` rows) — the
      // form officers actually have at hand, instead of numeric user ids.
      const accountEntries: string[] = [];
      for (const entry of ((rawAccounts as unknown[] | null) ?? [])) {
        if (typeof entry !== "string" && typeof entry !== "number") {
          throw fieldErrors({ accounts: "Every entry must be an email or username." });
        }
        const value = String(entry).trim();
        if (value) accountEntries.push(value);
      }

      const attempted = userIds.length + identifiers.length + accountEntries.length;
      if (attempted === 0) {
        throw fieldErrors({ detail: "Provide at least one user id, email/username, or identifier." });
      }
      if (attempted > MAX_VOTER_ENTRIES) {
        throw fieldErrors({
          detail: `A maximum of ${MAX_VOTER_ENTRIES} voters may be added per request.`,
        });
      }

      const unmatched: string[] = [];
      if (accountEntries.length) {
        const normalized = [...new Set(accountEntries.map((entry) => entry.trim().toLowerCase()))];
        const users = await prisma.user.findMany({
          where: {
            isActive: true,
            OR: normalized.flatMap((entry) => [
              { username: { equals: entry, mode: "insensitive" as const } },
              { email: { equals: entry, mode: "insensitive" as const } },
            ]),
          },
          select: { id: true, username: true, email: true },
        });
        const byKey = new Map<string, number>();
        for (const user of users) {
          byKey.set(user.username.toLowerCase(), user.id);
          byKey.set(user.email.toLowerCase(), user.id);
        }
        for (const entry of normalized) {
          const userId = byKey.get(entry);
          // Duplicates (e.g. the same person as email and username) collapse
          // through the unique key, so they come back as `skipped`.
          if (userId === undefined) unmatched.push(entry);
          else userIds.push(userId);
        }
      }

      const data = [
        ...userIds.map((userId) => ({
          electionId: election.id,
          uniqueKey: `u:${userId}`,
          userId,
          label: label ?? "",
        })),
        ...identifiers.map((identifier) => ({
          electionId: election.id,
          uniqueKey: `h:${identifierDigest(election.id, identifier)}`,
          userId: null,
          label: label ?? "",
        })),
      ];

      const result = await prisma.electionVoter.createMany({ data, skipDuplicates: true });
      const total = await prisma.electionVoter.count({ where: { electionId: election.id } });
      const skipped = data.length - result.count;

      await recordAudit({
        actorId: officer.id,
        action: "officer.voter.add",
        entityType: "Election",
        entityId: election.id,
        summary: `Added ${result.count} eligible voter(s) to "${election.title}"`,
        detail: { added: result.count, skipped, total, unmatched: unmatched.length },
        ipAddress: clientIp(req),
      });

      return json({ added: result.count, skipped, total, unmatched });
    },
  },
});

export const GET = route;
export const POST = route;
