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
      // A signed-out browser stops being the holder of any pending sign-in
      // code: leaving the challenge live would let a shoulder-surfed id be
      // spent after logout.
      if (state.user) {
        await prisma.otpChallenge
          .updateMany({
            where: { userId: state.user.id, consumedAt: null },
            data: { consumedAt: new Date() },
          })
          .catch(() => undefined);
      }
      return noContent();
    },
  },
});
