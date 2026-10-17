import { makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { legacyMediaRedirect } from "@/src/lib/media";
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
            "Cache-Control": "public, max-age=300",
          },
        });
      }
      const redirect = legacyMediaRedirect(candidate.photo);
      if (redirect) return redirect;
      throw new ApiError(404, { detail: "Not found." });
    },
  },
});
