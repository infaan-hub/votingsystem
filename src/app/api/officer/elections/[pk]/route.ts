import { json, makeRoute, noContent } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { serializeElectionAdmin, uniqueElectionSlug } from "@/src/lib/elections";
import { electionImagePath, serializePosition } from "@/src/lib/serializers";
import { secondsUntil } from "@/src/lib/time";
import { fieldErrors } from "@/src/lib/http";
import { Collector, strField, dateTimeField, choiceField, intField } from "@/src/lib/fields";
import { readPayload, type Payload } from "@/src/lib/request";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import {
  PUBLIC_ACTIVE_STATUSES,
  electionRecipientIds,
  notifyElectionRemoved,
  notifyElectionRescheduled,
} from "@/src/lib/notifications/events";

const VOTER_ID_METHODS = [
  "account",
  "email",
  "phone",
  "membership",
  "employee",
  "student_id",
  "custom",
] as const;
const CAPACITY_MODES = ["open", "restricted"] as const;

/** Statuses whose schedule and rules officers may still change. */
const EDITABLE_STATUSES = new Set(["DRAFT", "PUBLISHED", "NOMINATIONS", "READY"]);
/** Statuses officers may delete — only while no ballots have been cast. */
const DELETABLE_STATUSES = new Set(["DRAFT", "PUBLISHED", "NOMINATIONS", "READY", "ARCHIVED"]);

const route = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);

      const [positions, positionCounts, candidateCounts, voteCounts, campaignCounts, voterCounts] =
        await Promise.all([
          prisma.position.findMany({
            where: { electionId: election.id },
            include: { department: true, section: { include: { department: true } } },
            orderBy: { order: "asc" },
          }),
          prisma.position.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
          prisma.candidate.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
          prisma.vote.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
          prisma.campaign.groupBy({
            by: ["electionId"],
            where: { electionId: election.id, status: "PUBLISHED" },
            _count: { _all: true },
          }),
          prisma.electionVoter.groupBy({
            by: ["electionId"],
            where: { electionId: election.id },
            _count: { _all: true },
          }),
        ]);

      const countOf = (rows: { _count: { _all: number } }[]) => rows[0]?._count._all ?? 0;

      return json({
        election: {
          ...serializeElectionAdmin(election),
          image_url: electionImagePath(election) || null,
        },
        positions: await Promise.all(positions.map((position) => serializePosition(position))),
        counts: {
          positions: countOf(positionCounts),
          candidates: countOf(candidateCounts),
          votes: countOf(voteCounts),
          published_campaigns: countOf(campaignCounts),
          eligible_voters: countOf(voterCounts),
        },
        campaign: {
          seconds_until_start: secondsUntil(election.campaignStartAt),
          seconds_until_end: secondsUntil(election.campaignEndAt),
        },
        voting: {
          seconds_until_start: secondsUntil(election.votingStartAt),
          seconds_until_end: secondsUntil(election.votingEndAt),
        },
      });
    },
    PATCH: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const pk = Number(params.pk);
      const existing = await requireManagedElection(pk, officer);

      // Elections are born OPEN (officers publish without admin approval), so
      // OPEN stays editable until the first ballot is cast — after that the
      // schedule and rules are frozen like any live election.
      const openEditable =
        existing.status === "OPEN" &&
        (await prisma.vote.count({ where: { electionId: pk } })) === 0;
      if (!EDITABLE_STATUSES.has(existing.status) && !openEditable) {
        throw fieldErrors({
          status:
            "This election can no longer be edited because voting has started or it is closed. " +
            "Ask an administrator if something must still change.",
        });
      }

      const payload: Payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
      const c = new Collector();
      const title = has("title")
        ? strField(c, payload, "title", { required: false, maxLength: 200 })
        : undefined;
      const description = has("description")
        ? strField(c, payload, "description", {
            required: false,
            allowBlank: true,
            maxLength: 2000,
          })
        : undefined;
      const votingStart = has("voting_start_at")
        ? dateTimeField(c, payload, "voting_start_at", { required: false })
        : undefined;
      const votingEnd = has("voting_end_at")
        ? dateTimeField(c, payload, "voting_end_at", { required: false })
        : undefined;
      const rulesText = has("rules_text")
        ? strField(c, payload, "rules_text", {
            required: false,
            allowBlank: true,
            maxLength: 4000,
          })
        : undefined;
      const voterIdMethod = has("voter_id_method")
        ? choiceField(c, payload, "voter_id_method", VOTER_ID_METHODS, { required: false })
        : undefined;
      const voterIdLabel = has("voter_id_label")
        ? strField(c, payload, "voter_id_label", {
            required: false,
            allowBlank: true,
            maxLength: 120,
          })
        : undefined;
      const capacityMode = has("capacity_mode")
        ? choiceField(c, payload, "capacity_mode", CAPACITY_MODES, { required: false })
        : undefined;
      const maxVoters = has("max_voters")
        ? intField(c, payload, "max_voters", { required: false })
        : undefined;
      const timezone = has("timezone")
        ? strField(c, payload, "timezone", { required: false, maxLength: 60 })
        : undefined;
      // Category is optional; null/"" clears it so the election leaves the
      // explore tiles until another category is chosen.
      const rawCategory = has("category_id") ? payload.category_id : undefined;
      let categoryId: number | null | undefined;
      if (rawCategory !== undefined) {
        if (rawCategory === null || String(rawCategory).trim() === "") {
          categoryId = null;
        } else {
          const parsed = Number(rawCategory);
          if (!Number.isInteger(parsed) || parsed < 1) {
            c.field("category_id", "Select a valid category.");
          } else {
            categoryId = parsed;
          }
        }
      }
      c.throwIfAny();

      if (typeof categoryId === "number") {
        const category = await prisma.electionCategory.findFirst({
          where: { id: categoryId, isActive: true },
          select: { id: true },
        });
        if (!category) {
          throw fieldErrors({ category_id: "This category is not available." });
        }
      }

      if (title !== undefined && !title) {
        throw fieldErrors({ title: "This field may not be blank." });
      }

      const finalMethod = voterIdMethod ?? existing.voterIdMethod;
      const finalLabel = voterIdLabel ?? existing.voterIdLabel;
      if (finalMethod === "custom" && !finalLabel.trim()) {
        throw fieldErrors({ voter_id_label: "A label is required for a custom identifier." });
      }

      const finalMode = capacityMode ?? existing.capacityMode;
      const finalMax =
        maxVoters !== undefined ? maxVoters : existing.maxVoters;
      if (finalMode !== "open" && finalMax !== undefined && finalMax !== null && finalMax < 1) {
        throw fieldErrors({ max_voters: "Maximum voters must be at least 1." });
      }

      const finalVS = votingStart ?? existing.votingStartAt;
      const finalVE = votingEnd ?? existing.votingEndAt;
      if (finalVE <= finalVS) {
        throw fieldErrors({ voting_end_at: "Voting end must be after voting start." });
      }

      const updates: Record<string, unknown> = {};
      if (title !== undefined) {
        updates.title = title;
        updates.slug = await uniqueElectionSlug(title, pk);
      }
      if (description !== undefined) updates.description = description;
      if (rulesText !== undefined) updates.rulesText = rulesText;
      if (votingStart !== undefined) updates.votingStartAt = votingStart;
      if (votingEnd !== undefined) updates.votingEndAt = votingEnd;
      // Keep the campaign window coherent with a moved voting start, matching
      // the create flow (campaign runs up to the voting open moment).
      if (votingStart !== undefined && votingStart.getTime() !== existing.votingStartAt.getTime()) {
        const campaignDays = Math.max(
          1,
          Math.round(
            (existing.campaignEndAt.getTime() - existing.campaignStartAt.getTime()) / 86400000,
          ),
        );
        updates.campaignEndAt = votingStart;
        updates.campaignStartAt = new Date(votingStart.getTime() - campaignDays * 86400000);
      }
      if (voterIdMethod !== undefined) updates.voterIdMethod = voterIdMethod;
      if (voterIdLabel !== undefined) {
        updates.voterIdLabel = finalMethod === "custom" ? finalLabel.trim() : "";
      }
      if (capacityMode !== undefined) {
        updates.capacityMode = capacityMode;
        updates.eligibilityPolicy = capacityMode === "open" ? "open" : "registered";
      }
      if (maxVoters !== undefined || capacityMode !== undefined) {
        updates.maxVoters = finalMode === "open" ? null : (finalMax ?? null);
      }
      if (timezone !== undefined) updates.timezone = timezone || "UTC";
      if (categoryId !== undefined) updates.categoryId = categoryId;

      if (!Object.keys(updates).length) {
        return json(serializeElectionAdmin(existing));
      }

      let updated;
      try {
        updated = await prisma.election.update({
          where: { id: pk },
          data: updates,
          include: { category: true, organization: true },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw fieldErrors({ title: "An election with this title already exists." });
        }
        throw error;
      }

      await recordAudit({
        actorId: officer.id,
        action: "officer.election.update",
        entityType: "Election",
        entityId: pk,
        summary: `Election "${updated.title}" updated`,
        detail: { changed: Object.keys(updates), status: updated.status },
        ipAddress: clientIp(req),
      });

      // Same helper as the admin schedule route: only real, published
      // schedule changes ping voters, with a key per schedule revision.
      await notifyElectionRescheduled(
        { votingStartAt: existing.votingStartAt, votingEndAt: existing.votingEndAt },
        updated,
      );

      return json(serializeElectionAdmin(updated));
    },
    DELETE: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const pk = Number(params.pk);
      const existing = await requireManagedElection(pk, officer);

      const votes = await prisma.vote.count({ where: { electionId: pk } });
      // OPEN elections (officers publish directly, with no draft stage) may be
      // removed while still empty — the same grace pre-open elections get.
      const deletable =
        DELETABLE_STATUSES.has(existing.status) || (existing.status === "OPEN" && votes === 0);
      if (!deletable) {
        throw fieldErrors({
          status:
            "Only draft, unpublished, archived, or not-yet-open elections can be deleted. " +
            "Close this election and ask an administrator to archive it instead.",
        });
      }

      if (votes > 0) {
        throw fieldErrors({
          status:
            `This election already has ${votes} recorded ballot${votes === 1 ? "" : "s"} and ` +
            "cannot be deleted by its operator. Ask an administrator to archive or delete it instead.",
        });
      }

      // Resolve recipients while positions/voter lists still exist — the
      // delete cascades them away. Only previously public elections produce
      // a cancellation notice; drafts and already-archived rows stay silent
      // (archiving notified separately), so one election never double-pings.
      const previousStatus = existing.status;
      const removedRecipients = PUBLIC_ACTIVE_STATUSES.has(previousStatus)
        ? await electionRecipientIds(existing)
        : [];

      await prisma.election.delete({ where: { id: pk } });

      await recordAudit({
        actorId: officer.id,
        action: "officer.election.delete",
        entityType: "Election",
        entityId: pk,
        summary: `Election "${existing.title}" deleted`,
        detail: { status: existing.status, slug: existing.slug },
        ipAddress: clientIp(req),
      });

      if (removedRecipients.length) {
        await notifyElectionRemoved(existing, removedRecipients);
      }

      return noContent();
    },
  },
});

export const GET = route;
export const PATCH = route;
export const DELETE = route;
