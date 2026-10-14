import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";

export const POST = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (_req, _params, state) => {
      const user = requireStateUser(state);
      const result = await prisma.notification.updateMany({
        where: { recipientId: user.id, readAt: null },
        data: { readAt: new Date() },
      });
      return json({ updated: result.count });
    },
  },
});
