import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { Collector, choiceField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { requireStateAdmin } from "@/src/lib/auth";
import { CONTACT_STATUSES, serializeContact } from "@/src/app/api/contact/route";

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
      const status = choiceField(c, payload, "status", CONTACT_STATUSES)!;
      c.throwIfAny();

      const updated = await prisma.contactMessage.update({
        where: { id: pk },
        data: { status },
      });

      await recordAudit({
        actorId: admin.id,
        action: `admin.contact.${status.toLowerCase()}`,
        entityType: "ContactMessage",
        entityId: pk,
        summary: `Contact message #${pk} marked ${status}`,
        ipAddress: clientIp(req),
      });

      return json(serializeContact(updated));
    },
  },
});
