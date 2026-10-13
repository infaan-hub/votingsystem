import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

/**
 * Public profile picture for any user. Photos are not sensitive (candidate
 * photos are public the same way) and the sidebar, bottom nav and profile
 * page all point here via `serializeUserSummary().photo_url`.
 */
export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const user = await prisma.user.findUnique({ where: { id: pk } });
      if (!user || !user.photoBytes || !user.photoBytes.length) {
        throw notFoundModel("Photo");
      }
      return new Response(Buffer.from(user.photoBytes), {
        headers: {
          "Content-Type": user.photoContentType || "image/jpeg",
          "Cache-Control": "public, max-age=300",
        },
      });
    },
  },
});
