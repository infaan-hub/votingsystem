import { randomBytes } from "node:crypto";

import { json, makeRoute } from "@/src/lib/api";
import { ApiError } from "@/src/lib/http";
import { Collector, strField, fileField, validateImageFile } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { positionIdByNameIexact } from "@/src/lib/queries";
import { unusablePassword } from "@/src/lib/password";
import { readPayload } from "@/src/lib/request";
import {
  ValidationError,
  validationErrorBody,
  validateCandidate,
  validatePosition,
  validateUser,
} from "@/src/lib/validation";
import { slugify } from "@/src/lib/slug";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import type { Position, User } from "@/src/generated/prisma/client";

function rethrowValidationError(error: unknown): never {
  if (error instanceof ValidationError) {
    throw new ApiError(400, validationErrorBody(error));
  }
  throw error;
}

export const POST = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);
      const payload = await readPayload(req);

      const c = new Collector();
      const positionName = strField(c, payload, "position_name", { maxLength: 120 });
      const fullName = strField(c, payload, "full_name", { maxLength: 160 });
      const description = strField(c, payload, "description", {
        required: false,
        allowBlank: true,
        maxLength: 4000,
      });
      const photo = fileField(c, payload, "photo", { required: true, allowNull: true });
      const image2 = fileField(c, payload, "image2", { required: false, allowNull: true });
      const image3 = fileField(c, payload, "image3", { required: false, allowNull: true });

      let photoBytes: Uint8Array | null = null;
      let photoContentType = "";
      let photoFilename = "";
      if (photo instanceof File) {
        photoBytes = await validateImageFile(c, "photo", photo);
        if (photoBytes) {
          photoContentType = photo.type || "image/jpeg";
          photoFilename = photo.name || "";
        }
      }
      const extraFiles: { slot: number; file: File }[] = [];
      const extraBytes: { slot: number; bytes: Uint8Array; contentType: string; filename: string }[] = [];
      for (const [slot, part] of [
        [1, image2],
        [2, image3],
      ] as const) {
        if (part instanceof File) {
          const bytes = await validateImageFile(c, `image${slot + 1}`, part);
          if (bytes) {
            extraFiles.push({ slot, file: part });
            extraBytes.push({
              slot,
              bytes,
              contentType: part.type || "image/jpeg",
              filename: part.name || "",
            });
          }
        }
      }
      c.throwIfAny();

      const cleanPositionName = positionName.trim();
      const cleanFullName = fullName.trim();
      const cleanDescription = description.trim();
      if (!cleanPositionName) {
        throw new ApiError(400, { position_name: "Position is required." });
      }
      if (!cleanFullName) {
        throw new ApiError(400, { full_name: "Candidate name is required." });
      }
      if (extraFiles.length > 2) {
        throw new ApiError(400, { detail: "A candidate may have at most two extra images." });
      }

      const nameParts = cleanFullName.split(/\s+/).filter(Boolean);
      const firstName = nameParts[0];
      const lastName = nameParts.slice(1).join(" ") || nameParts[0];

      const positionId = await positionIdByNameIexact(election.id, cleanPositionName);

      let createdId: number;
      try {
        createdId = await prisma.$transaction(async (tx) => {
          let position: Position;
          if (positionId !== null) {
            position = await tx.position.findUniqueOrThrow({ where: { id: positionId } });
          } else {
            try {
              validatePosition({ name: cleanPositionName, departmentId: null, sectionId: null });
            } catch (error) {
              rethrowValidationError(error);
            }
            position = await tx.position.create({
              data: {
                electionId: election.id,
                name: cleanPositionName,
                description: "",
                voterGroup: "all",
                maxWinners: 1,
              },
            });
          }

          const base = slugify(cleanFullName).slice(0, 28) || "cand";
          const username = `${base}-${randomBytes(3).toString("hex")}`;
          try {
            await validateUser({
              username,
              email: "",
              role: "voter",
              departmentId: position.departmentId,
              sectionId: position.sectionId,
              sectionDepartmentId: null,
              googleId: null,
            });
          } catch (error) {
            rethrowValidationError(error);
          }

          const user: User = await tx.user.create({
            data: {
              username,
              password: unusablePassword(),
              role: "voter",
              firstName,
              lastName,
              departmentId: position.departmentId,
              sectionId: position.sectionId,
              isSuperuser: false,
              isStaff: false,
              isActive: true,
            },
          });

          try {
            validateCandidate({
              electionId: election.id,
              positionElectionId: election.id,
              departmentId: position.departmentId,
              sectionId: position.sectionId,
              sectionDepartmentId: null,
              userDepartmentId: position.departmentId,
              userSectionId: position.sectionId,
              positionDepartmentId: position.departmentId,
              positionSectionId: position.sectionId,
              slogan: "",
              manifesto: cleanDescription,
            });
          } catch (error) {
            rethrowValidationError(error);
          }

          let candidateId: number;
          try {
            const candidate = await tx.candidate.create({
              data: {
                electionId: election.id,
                positionId: position.id,
                userId: user.id,
                departmentId: position.departmentId,
                sectionId: position.sectionId,
                manifesto: cleanDescription,
                approved: true,
                photoBytes: photoBytes ? Buffer.from(photoBytes) : null,
                photoContentType,
                photoFilename,
              },
            });
            candidateId = candidate.id;
          } catch (error) {
            if (isUniqueConstraintViolation(error)) {
              throw new ApiError(400, {
                detail: "This user is already registered as a candidate for that position.",
              });
            }
            throw error;
          }

          for (const extra of extraBytes) {
            await tx.candidateImage.create({
              data: {
                candidateId,
                slot: extra.slot,
                imageBytes: Buffer.from(extra.bytes),
                imageContentType: extra.contentType,
                imageFilename: extra.filename,
              },
            });
          }
          return candidateId;
        }, { timeout: 60000, maxWait: 60000 });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isUniqueConstraintViolation(error)) {
          throw new ApiError(400, {
            position_name:
              "A position with this name already exists for the selected election scope.",
          });
        }
        throw error;
      }

      const candidate = await prisma.candidate.findUniqueOrThrow({
        where: { id: createdId },
        include: { user: true, position: true },
      });
      return json(
        {
          id: candidate.id,
          position_id: candidate.position.id,
          position_name: candidate.position.name,
          full_name: cleanFullName,
          description: candidate.manifesto,
          has_photo: Boolean(candidate.photoBytes?.length),
          extra_images: extraBytes.length,
        },
        201,
      );
    },
  },
});
