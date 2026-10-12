import { json, makeRoute } from "@/src/lib/api";
import { Collector, fileField, validateImageFile } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { readPayload } from "@/src/lib/request";

export const POST = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);
      const payload = await readPayload(req);

      const c = new Collector();
      const image = fileField(c, payload, "image", { required: true, allowNull: true });
      let bytes: Uint8Array | null = null;
      let contentType = "";
      let filename = "";
      if (image instanceof File) {
        bytes = await validateImageFile(c, "image", image);
        if (bytes) {
          contentType = image.type || "image/jpeg";
          filename = image.name || "";
        }
      }
      c.throwIfAny();

      const updated = await prisma.election.update({
        where: { id: election.id },
        data: {
          imageBytes: bytes ? Buffer.from(bytes) : null,
          imageContentType: contentType,
          imageFilename: filename,
        },
      });
      return json({ id: updated.id, has_image: Boolean(updated.imageBytes?.length) });
    },
  },
});
