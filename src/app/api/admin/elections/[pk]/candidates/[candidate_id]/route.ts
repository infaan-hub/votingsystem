import { json, makeRoute, noContent } from "@/src/lib/api";
import { ApiError, fieldErrors, notFoundModel } from "@/src/lib/http";
import {
  Collector,
  boolField,
  emailField,
  fileField,
  strField,
  validateImageFile,
} from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import { positionIdByNameIexact, usernameTakenIexact, emailTakenIexact } from "@/src/lib/queries";
import {
  ValidationError,
  validationErrorBody,
  validateCandidate,
  validatePosition,
  validateUser,
} from "@/src/lib/validation";
import { serializeCandidate } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import type {
  Candidate,
  Department,
  Position,
  Section,
  User,
} from "@/src/generated/prisma/client";

const CANDIDATE_INCLUDE = {
  user: { include: { department: true, section: { include: { department: true } } } },
  department: true,
  section: { include: { department: true } },
  party: true,
} as const;

type CandidateRow = Candidate & {
  user: User & {
    department: Department | null;
    section: (Section & { department: Department | null }) | null;
  };
  department: Department | null;
  section: (Section & { department: Department | null }) | null;
  party: { id: number; name: string; code: string; color: string } | null;
};

function rethrowValidationError(error: unknown): never {
  if (error instanceof ValidationError) {
    throw new ApiError(400, validationErrorBody(error));
  }
  throw error;
}

const route = makeRoute({
  permission: "admin",
  intParams: ["pk", "candidate_id"],
  handlers: {
    PATCH: async (req, params) => {
      const pk = Number(params.pk);
      const candidateId = Number(params.candidate_id);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) throw notFoundModel("Election");
      const candidate = (await prisma.candidate.findUnique({
        where: { id: candidateId },
        include: CANDIDATE_INCLUDE,
      })) as CandidateRow | null;
      if (!candidate || candidate.electionId !== election.id) {
        throw notFoundModel("Candidate");
      }
      const payload: Payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);

      const c = new Collector();
      const username = has("username")
        ? strField(c, payload, "username", { required: false })
        : undefined;
      const email = has("email")
        ? emailField(c, payload, "email", { required: false })
        : undefined;
      const firstName = has("first_name")
        ? strField(c, payload, "first_name", { required: false })
        : undefined;
      const lastName = has("last_name")
        ? strField(c, payload, "last_name", { required: false })
        : undefined;
      const positionName = has("position_name")
        ? strField(c, payload, "position_name", { required: false })
        : undefined;
      const slogan = has("slogan")
        ? strField(c, payload, "slogan", { required: false, allowBlank: true })
        : undefined;
      const manifesto = has("manifesto")
        ? strField(c, payload, "manifesto", { required: false, allowBlank: true })
        : undefined;
      const photo = has("photo")
        ? fileField(c, payload, "photo", { required: false, allowNull: true })
        : undefined;
      let photoBytes: Uint8Array | null | undefined;
      let photoContentType = "";
      let photoFilename = "";
      if (photo instanceof File) {
        const bytes = await validateImageFile(c, "photo", photo);
        if (bytes) {
          photoBytes = bytes;
          photoContentType = photo.type || "";
          photoFilename = photo.name || "";
        }
      }
      const approved = has("approved")
        ? boolField(c, payload, "approved", { required: false })
        : undefined;
      c.throwIfAny();

      // validate() — sequential custom checks.
      if (username !== undefined) {
        if (!username) throw fieldErrors({ username: "Username is required." });
        if (await usernameTakenIexact(username, candidate.userId)) {
          throw fieldErrors({ username: "This username is already in use." });
        }
      }
      if (email !== undefined && email) {
        if (await emailTakenIexact(email, candidate.userId)) {
          throw fieldErrors({ email: "This email is already in use." });
        }
      }

      let resolvedPosition: Position | null = null;
      let mustCreatePosition = false;
      if (positionName !== undefined) {
        const cleanName = positionName.trim();
        if (!cleanName) throw fieldErrors({ position_name: "Position is required." });
        const existingId = await positionIdByNameIexact(election.id, cleanName);
        if (existingId !== null) {
          resolvedPosition = await prisma.position.findUniqueOrThrow({
            where: { id: existingId },
          });
        } else {
          mustCreatePosition = true;
          try {
            validatePosition({ name: cleanName, departmentId: null, sectionId: null });
          } catch (error) {
            rethrowValidationError(error);
          }
        }
      }

      // update() — user fields first.
      const userUpdates: Record<string, unknown> = {};
      if (username !== undefined) userUpdates.username = username;
      if (email !== undefined) userUpdates.email = email.toLowerCase();
      if (firstName !== undefined) userUpdates.firstName = firstName;
      if (lastName !== undefined) userUpdates.lastName = lastName;
      if (Object.keys(userUpdates).length) {
        const mergedUser = { ...candidate.user, ...userUpdates };
        try {
          await validateUser(
            {
              id: candidate.userId,
              username: mergedUser.username,
              email: mergedUser.email,
              role: mergedUser.role,
              departmentId: mergedUser.departmentId,
              sectionId: mergedUser.sectionId,
              sectionDepartmentId: candidate.user.section?.departmentId ?? null,
              googleId: mergedUser.googleId,
            },
            async (field, value, excludeId) => {
              if (field === "username") {
                const row = await prisma.user.findFirst({
                  where: {
                    username: value,
                    ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
                  },
                  select: { id: true },
                });
                return row !== null;
              }
              if (field === "google_id" && value) {
                const row = await prisma.user.findFirst({
                  where: {
                    googleId: value,
                    ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
                  },
                  select: { id: true },
                });
                return row !== null;
              }
              return false;
            },
          );
        } catch (error) {
          rethrowValidationError(error);
        }
        try {
          await prisma.user.update({
            where: { id: candidate.userId },
            data: userUpdates,
          });
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw new ApiError(400, { username: "This username is already in use." });
          }
          throw error;
        }
      }

      if (mustCreatePosition) {
        try {
          resolvedPosition = await prisma.position.create({
            data: {
              electionId: election.id,
              name: positionName!.trim(),
              description: "",
              voterGroup: "all",
              maxWinners: 1,
            },
          });
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw new ApiError(400, {
              position_name:
                "A position with this name already exists for the selected election scope.",
            });
          }
          throw error;
        }
      }

      const candidateUpdates: Record<string, unknown> = {};
      if (slogan !== undefined) candidateUpdates.slogan = slogan;
      if (manifesto !== undefined) candidateUpdates.manifesto = manifesto;
      if (approved !== undefined) candidateUpdates.approved = approved;
      if (resolvedPosition) {
        candidateUpdates.positionId = resolvedPosition.id;
        candidateUpdates.departmentId = resolvedPosition.departmentId;
        candidateUpdates.sectionId = resolvedPosition.sectionId;
      }
      if (photo !== undefined) {
        if (photo === null) {
          candidateUpdates.photo = null;
          candidateUpdates.photoBytes = null;
          candidateUpdates.photoContentType = "";
          candidateUpdates.photoFilename = "";
        } else if (photo instanceof File && photoBytes) {
          candidateUpdates.photo = null;
          candidateUpdates.photoBytes = Buffer.from(photoBytes);
          candidateUpdates.photoContentType = photoContentType;
          candidateUpdates.photoFilename = photoFilename;
        }
      }

      const positionForValidation =
        resolvedPosition ??
        (await prisma.position.findUnique({ where: { id: candidate.positionId } }))!;
      try {
        validateCandidate({
          electionId: election.id,
          positionElectionId: positionForValidation.electionId,
          departmentId:
            (candidateUpdates.departmentId as number | null) ?? candidate.departmentId,
          sectionId: (candidateUpdates.sectionId as number | null) ?? candidate.sectionId,
          sectionDepartmentId: null,
          userDepartmentId: (candidateUpdates.departmentId as number | null) ?? candidate.departmentId,
          userSectionId: (candidateUpdates.sectionId as number | null) ?? candidate.sectionId,
          positionDepartmentId: positionForValidation.departmentId,
          positionSectionId: positionForValidation.sectionId,
          slogan: (candidateUpdates.slogan as string | undefined) ?? candidate.slogan,
          manifesto: (candidateUpdates.manifesto as string | undefined) ?? candidate.manifesto,
        });
      } catch (error) {
        rethrowValidationError(error);
      }

      let updated: CandidateRow;
      try {
        updated = (await prisma.candidate.update({
          where: { id: candidate.id },
          data: candidateUpdates,
          include: CANDIDATE_INCLUDE,
        })) as CandidateRow;
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new ApiError(400, {
            detail: "This user is already registered as a candidate for that position.",
          });
        }
        throw error;
      }
      return json(serializeCandidate(updated));
    },
    DELETE: async (_req, params) => {
      const pk = Number(params.pk);
      const candidateId = Number(params.candidate_id);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) throw notFoundModel("Election");
      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
      });
      if (!candidate || candidate.electionId !== election.id) {
        throw notFoundModel("Candidate");
      }
      const userId = candidate.userId;
      await prisma.candidate.delete({ where: { id: candidate.id } });
      await prisma.user.delete({ where: { id: userId } });
      return noContent();
    },
  },
});

export const PATCH = route;
export const DELETE = route;
