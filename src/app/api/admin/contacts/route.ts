import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { CONTACT_STATUSES, serializeContact } from "@/src/app/api/contact/route";

export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async (req) => {
      const url = new URL(req.url);
      const statusParam = url.searchParams.get("status") ?? undefined;
      const status =
        statusParam && CONTACT_STATUSES.includes(statusParam as never)
          ? statusParam
          : undefined;
      const messages = await prisma.contactMessage.findMany({
        where: status ? { status } : undefined,
        orderBy: { createdAt: "desc" },
        take: 500,
      });
      return json(messages.map(serializeContact));
    },
  },
});
