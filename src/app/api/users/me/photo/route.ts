import { json, makeRoute } from "@/src/lib/api";
import { Collector, fileField, validateImageFile } from "@/src/lib/fields";
import { requireStateUser, USER_INCLUDE } from "@/src/lib/auth";
import { clientIp, recordAudit } from "@/src/lib/audit";
import { MAX_IMAGE_BYTES } from "@/src/lib/media";
import { readPayload } from "@/src/lib/request";
import { serializeUserSummary } from "@/src/lib/serializers";
import { prisma } from "@/src/lib/db";

/**
 * The signed-in user's own profile picture: PUT uploads (multipart form field
 * "photo"), DELETE removes it. Every account may set one; the bytes follow
 * the same storage pattern as Candidate.photo.
 */
export const PUT = makeRoute({
  permission: "authenticated",
  handlers: {
    PUT: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = await readPayload(req);

      const c = new Collector();
      const photo = fileField(c, payload, "photo", { required: true });
      let bytes: Uint8Array | null = null;
      let contentType = "";
      let filename = "";
      if (photo instanceof File) {
        bytes = await validateImageFile(c, "photo", photo);
        if (bytes && bytes.length > MAX_IMAGE_BYTES) {
          c.field(
            "photo",
            `Image is too large. The limit is ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB.`,
          );
          bytes = null;
        }
        if (bytes) {
          contentType = photo.type || "image/jpeg";
          filename = photo.name || "";
        }
      }
      c.throwIfAny();

      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          photoBytes: bytes ? Buffer.from(bytes) : null,
          photoContentType: contentType,
          photoFilename: filename,
          photoVersion: { increment: 1 },
        },
        include: USER_INCLUDE,
      });
      await recordAudit({
        actorId: user.id,
        action: "user.photo.upload",
        entityType: "User",
        entityId: user.id,
        summary: "Profile photo updated",
        ipAddress: clientIp(req),
      });
      return json(serializeUserSummary(updated));
    },
  },
});

export const DELETE = makeRoute({
  permission: "authenticated",
  handlers: {
    DELETE: async (req, _params, state) => {
      const user = requireStateUser(state);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          photoBytes: null,
          photoContentType: "",
          photoFilename: "",
        },
      });
      await recordAudit({
        actorId: user.id,
        action: "user.photo.delete",
        entityType: "User",
        entityId: user.id,
        summary: "Profile photo removed",
        ipAddress: clientIp(req),
      });
      return json({ photo_url: null });
    },
  },
});
