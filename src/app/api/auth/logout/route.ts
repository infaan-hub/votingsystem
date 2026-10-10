import { makeRoute, noContent } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";

export const POST = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (_req, _params, state) => {
      if (state.tokenKey) {
        await prisma.token
          .delete({ where: { key: state.tokenKey } })
          .catch(() => undefined);
      }
      return noContent();
    },
  },
});
