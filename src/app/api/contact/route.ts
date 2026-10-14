import { json, makeRoute } from "@/src/lib/api";
import { Collector, strField, emailField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { formatDateTime } from "@/src/lib/time";
import { notifyContactReceived } from "@/src/lib/notifications/events";

export const CONTACT_STATUSES = ["NEW", "OPEN", "RESOLVED"] as const;

export function serializeContact(message: {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: message.id,
    name: message.name,
    email: message.email,
    subject: message.subject,
    message: message.message,
    status: message.status,
    created_at: formatDateTime(message.createdAt),
    updated_at: formatDateTime(message.updatedAt),
  };
}

/**
 * Public contact form. Anyone may submit; only administrators can list or
 * change status. There is no reply-to hook here â€” the platform stores the
 * message for the support inbox.
 */
export const POST = makeRoute({
  handlers: {
    POST: async (req, _params, state) => {
      const payload = await readPayload(req);
      const c = new Collector();
      const name = strField(c, payload, "name", { maxLength: 120 });
      const email = emailField(c, payload, "email");
      const subject = strField(c, payload, "subject", { maxLength: 200 });
      const message = strField(c, payload, "message", { minLength: 10, maxLength: 4000 });
      c.throwIfAny();

      const created = await prisma.contactMessage.create({
        data: {
          userId: state.user?.id ?? null,
          name,
          email,
          subject,
          message,
          status: "NEW",
        },
      });

      await recordAudit({
        actorId: state.user?.id ?? null,
        action: "contact.create",
        entityType: "ContactMessage",
        entityId: created.id,
        summary: `Contact message: ${created.subject}`,
        ipAddress: clientIp(req),
      });

      // Fan-out to active administrators only; recipients are resolved from
      // the database, and the payload carries no sender details or message
      // text. Never fails the public submission itself.
      await notifyContactReceived(created.id);

      return json(serializeContact(created), 201);
    },
  },
});
