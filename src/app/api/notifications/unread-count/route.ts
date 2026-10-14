import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";

export const GET = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (_req, _params, state) => {
      const user = requireStateUser(state);
      const unread = await prisma.notification.count({
        where: { recipientId: user.id, readAt: null },
      });
      return json({ unread });
    },
  },
});
