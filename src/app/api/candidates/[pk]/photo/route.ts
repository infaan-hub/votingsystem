import { makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk"],
  handlers: {
    GET: async (_req, params) => {
      const pk = Number(params.pk);
      const candidate = await prisma.candidate.findFirst({
        where: { id: pk, approved: true, election: { isPublished: true } },
      });
      if (!candidate) throw notFoundModel("Candidate");
      if (candidate.photoBytes && candidate.photoBytes.length) {
        return new Response(Buffer.from(candidate.photoBytes), {
          headers: {
            "Content-Type": candidate.photoContentType || "image/jpeg",
          },
        });
      }
      if (candidate.photo) {
        throw new ApiError(302, {
          detail: "Candidate photo is stored outside database media.",
        });
      }
      throw new ApiError(404, { detail: "Not found." });
    },
  },
});
