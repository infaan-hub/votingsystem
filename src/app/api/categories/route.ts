import { json, makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { serializeCategory } from "@/src/lib/serializers";

export const GET = makeRoute({
  handlers: {
    GET: async () => {
      const categories = await prisma.electionCategory.findMany({
        where: { isActive: true },
        include: { _count: { select: { elections: true } } },
        orderBy: { name: "asc" },
      });
      return json(categories.map((category) => serializeCategory(category)));
    },
  },
});