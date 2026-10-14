import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";

export const DELETE = makeRoute({
  permission: "authenticated",
  intParams: ["id"],
  handlers: {
    DELETE: async (_req, params, state) => {
      const user = requireStateUser(state);
      const id = Number(params.id);
      const existing = await prisma.notification.findUnique({ where: { id } });
      if (!existing || existing.recipientId !== user.id) throw notFoundModel("Notification");
      await prisma.notification.delete({ where: { id } });
      return json({ deleted: true });
    },
  },
});
