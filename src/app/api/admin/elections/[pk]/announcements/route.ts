import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { Collector, boolField, choiceField, dateTimeField, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { serializeAnnouncement } from "@/src/lib/serializers";
import { notify } from "@/src/lib/notifications/notify";
import { eligibleUserIdsForPosition } from "@/src/lib/services";

const ANNOUNCEMENT_TYPES = ["notice", "campaign", "result"] as const;

export const POST = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) throw notFoundModel("Election");
      const payload = await readPayload(req);

      const c = new Collector();
      const title = strField(c, payload, "title", { maxLength: 180 });
      const message = strField(c, payload, "message");
      const announcementType = choiceField(c, payload, "announcement_type", ANNOUNCEMENT_TYPES, {
        defaultValue: "notice",
      })!;
      const publishAt = dateTimeField(c, payload, "publish_at", {
        required: false,
        allowNull: true,
      });
      const isPinned = boolField(c, payload, "is_pinned", { defaultValue: false })!;
      c.throwIfAny();

      const announcement = await prisma.announcement.create({
        data: {
          electionId: election.id,
          title,
          message,
          announcementType,
          publishAt: publishAt ?? null,
          isPinned,
        },
      });

      // Push + in-app notification to every voter eligible for this election
      // (union of position eligibility). Idempotent on the announcement id.
      try {
        const positions = await prisma.position.findMany({
          where: { electionId: election.id },
          include: { department: true, section: { include: { department: true } } },
        });
        const eligible = new Set<number>();
        for (const position of positions) {
          for (const id of await eligibleUserIdsForPosition(position)) eligible.add(id);
        }
        if (eligible.size) {
          await notify({
            recipientIds: [...eligible],
            title: `Announcement: ${title}`,
            body: message.slice(0, 200),
            targetUrl: `/elections/${election.slug}`,
            tag: `announcement-${announcement.id}`,
            category: "announcement",
            idempotencyKey: `announcement-${announcement.id}`,
            data: { electionId: election.id, announcementId: announcement.id },
          });
        }
      } catch {
        // Notification delivery must never fail the announcement itself.
      }

      return json(serializeAnnouncement(announcement, new Date(), election.timezone), 201);
    },
  },
});
