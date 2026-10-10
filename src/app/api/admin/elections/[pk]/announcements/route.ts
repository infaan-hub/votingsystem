import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { Collector, boolField, choiceField, dateTimeField, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { serializeAnnouncement } from "@/src/lib/serializers";

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
      return json(serializeAnnouncement(announcement), 201);
    },
  },
});
