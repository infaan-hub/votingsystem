import { makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";

export const GET = makeRoute({
  intParams: ["pk", "slot"],
  handlers: {
    GET: async (_req, params) => {
      const image = await prisma.campaignImage.findUnique({
        where: {
          campaignId_slot: {
            campaignId: Number(params.pk),
            slot: Number(params.slot),
          },
        },
      });
      if (!image || !image.imageBytes.length) {
        throw notFoundModel("Campaign image");
      }
      const filename = (image.imageFilename || `campaign-${image.campaignId}-${image.slot}.jpg`).replace(
        /"/g,
        "",
      );
      return new Response(Buffer.from(image.imageBytes), {
        headers: {
          "Content-Type": image.imageContentType || "image/jpeg",
          "Content-Disposition": `inline; filename="${filename}"`,
        },
      });
    },
  },
});
