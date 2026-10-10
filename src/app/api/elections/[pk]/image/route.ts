import { makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findFirst({
        where: { id: pk, isPublished: true },
      });
      if (!election) throw notFoundModel("Election");
      if (election.imageBytes && election.imageBytes.length) {
        const bytes = election.imageBytes;
        return new Response(Buffer.from(bytes), {
          headers: {
            "Content-Type": election.imageContentType || "image/jpeg",
          },
        });
      }
      if (election.image) {
        throw new ApiError(302, {
          detail: "Election image is stored outside database media.",
        });
      }
      throw new ApiError(404, { detail: "Not found." });
    },
  },
});
