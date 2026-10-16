import { json, makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { Collector, choiceField, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { requireStateAdmin } from "@/src/lib/auth";
import { CONTACT_STATUSES } from "@/src/app/api/contact/route";
import { notifyContactReplied } from "@/src/lib/notifications/events";
import { CONTACT_INCLUDE, serializeAdminContact } from "../route";

const MAX_REPLY = 4000;

export const PATCH = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    PATCH: async (req, params, state) => {
      const admin = requireStateAdmin(state);
      const pk = Number(params.pk);
      const existing = await prisma.contactMessage.findUnique({ where: { id: pk } });
      if (!existing) throw notFoundModel("ContactMessage");

      const payload = await readPayload(req);
      const c = new Collector();
      const status = choiceField(c, payload, "status", CONTACT_STATUSES, { required: false });
      const reply = strField(c, payload, "reply", {
        required: false,
        allowBlank: false,
        maxLength: MAX_REPLY,
      });
      c.throwIfAny();
      if (!status && !reply) {
        throw new ApiError(400, { detail: "Provide a status, a reply, or both." });
      }

      const data: {
        status?: string;
        reply?: string;
        repliedAt?: Date;
        repliedById?: number;
      } = {};
      if (status) data.status = status;
      if (reply) {
        data.reply = reply;
        data.repliedAt = new Date();
        data.repliedById = admin.id;
        // A reply resolves the message unless the admin says otherwise.
        if (!status) data.status = "RESOLVED";
      }

      const updated = await prisma.contactMessage.update({
        where: { id: pk },
        data,
        include: CONTACT_INCLUDE,
      });

      if (status) {
        await recordAudit({
          actorId: admin.id,
          action: `admin.contact.${status.toLowerCase()}`,
          entityType: "ContactMessage",
          entityId: pk,
          summary: `Contact message #${pk} marked ${status}`,
          ipAddress: clientIp(req),
        });
      }

      if (reply) {
        await recordAudit({
          actorId: admin.id,
          action: "admin.contact.reply",
          entityType: "ContactMessage",
          entityId: pk,
          summary: `Replied to contact message #${pk}`,
          ipAddress: clientIp(req),
        });
        // Delivers the reply to the sender's account when the message was
        // submitted while signed in; anonymous senders have no inbox.
        await notifyContactReplied(pk);
      }

      return json(serializeAdminContact(updated));
    },
  },
});
