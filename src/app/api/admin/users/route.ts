import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { serializeUserSummary } from "@/src/lib/serializers";

export const GET = makeRoute({
  permission: "admin",
  handlers: {
    GET: async () => {
      const users = await prisma.user.findMany({
        where: { role: { not: "admin" } },
        include: { department: true, section: { include: { department: true } } },
        orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { username: "asc" }],
      });
      return json({ users: users.map((user) => serializeUserSummary(user)) });
    },
  },
});
