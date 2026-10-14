import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";

export const PATCH = makeRoute({
  permission: "authenticated",
  intParams: ["id"],
  handlers: {
    PATCH: async (_req, params, state) => {
      const user = requireStateUser(state);
      const id = Number(params.id);
      const existing = await prisma.notification.findUnique({ where: { id } });
      // Recipient isolation: other users' rows 404 rather than leak existence.
      if (!existing || existing.recipientId !== user.id) throw notFoundModel("Notification");
      const updated = existing.readAt
        ? existing
        : await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
      return json({
        id: updated.id,
        is_read: updated.readAt !== null,
        read_at: updated.readAt?.toISOString() ?? null,
      });
    },
  },
});
