import { json, makeRoute } from "@/src/lib/api";
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
import { hashPassword } from "@/src/lib/password";
import { readPayload } from "@/src/lib/request";
import {
  emailTakenIexact,
  positionIdByNameIexact,
  usernameTakenIexact,
} from "@/src/lib/queries";
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

export const POST = makeRoute({
  permission: "admin",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params) => {
      const pk = Number(params.pk);
      const election = await prisma.election.findUnique({ where: { id: pk } });
      if (!election) throw notFoundModel("Election");
      const payload = await readPayload(req);

      const c = new Collector();
      const positionName = strField(c, payload, "position_name", {
        required: false,
        allowBlank: true,
      });
      const username = strField(c, payload, "username");
      const email = emailField(c, payload, "email", { required: false });
      const firstName = strField(c, payload, "first_name");
      const lastName = strField(c, payload, "last_name");
      const password = strField(c, payload, "password", { minLength: 8 });
      const confirmPassword = strField(c, payload, "confirm_password", { minLength: 8 });
      const slogan = strField(c, payload, "slogan", { required: false, allowBlank: true });
      const manifesto = strField(c, payload, "manifesto", { required: false, allowBlank: true });
      const photo = fileField(c, payload, "photo", { required: false, allowNull: true });
      const approved = boolField(c, payload, "approved", { defaultValue: true })!;
      let photoBytes: Uint8Array | null = null;
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
      c.throwIfAny();

      // validate() — sequential checks, first failure wins.
      if (password !== confirmPassword) {
        throw fieldErrors({ confirm_password: "Passwords do not match." });
      }
      const cleanUsername = username.trim();
      const cleanFirstName = firstName.trim();
      const cleanLastName = lastName.trim();
      const cleanEmail = email.trim().toLowerCase();
      const cleanSlogan = slogan.trim();
      const cleanManifesto = manifesto.trim();
      const cleanPositionName = positionName.trim();
      if (!cleanUsername) throw fieldErrors({ username: "Username is required." });
      if (!cleanFirstName) throw fieldErrors({ first_name: "First name is required." });
      if (!cleanLastName) throw fieldErrors({ last_name: "Last name is required." });
      if (await usernameTakenIexact(cleanUsername)) {
        throw fieldErrors({ username: "This username is already in use." });
      }
      if (cleanEmail && (await emailTakenIexact(cleanEmail))) {
        throw fieldErrors({ email: "This email is already in use." });
      }
      if (!cleanPositionName) throw fieldErrors({ position_name: "Position is required." });

      const positionId = await positionIdByNameIexact(election.id, cleanPositionName);
      let positionIsNew = false;
      if (positionId === null) {
        positionIsNew = true;
        try {
          validatePosition({ name: cleanPositionName, departmentId: null, sectionId: null });
        } catch (error) {
          rethrowValidationError(error);
        }
      }

      let createdId: number;
      const hashedPassword = hashPassword(password);
      try {
        createdId = await prisma.$transaction(async (tx) => {
          let position: Position;
          if (positionId !== null) {
            position = await tx.position.findUniqueOrThrow({ where: { id: positionId } });
          } else {
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

          const role = "voter";

          try {
            await validateUser({
              username: cleanUsername,
              email: cleanEmail,
              role,
              departmentId: position.departmentId,
              sectionId: position.sectionId,
              sectionDepartmentId: null,
              googleId: null,
            });
          } catch (error) {
            rethrowValidationError(error);
          }

          const user = await tx.user.create({
            data: {
              username: cleanUsername,
              email: cleanEmail,
                password: hashedPassword,
              role,
              firstName: cleanFirstName,
              lastName: cleanLastName,
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
              slogan: cleanSlogan,
              manifesto: cleanManifesto,
            });
          } catch (error) {
            rethrowValidationError(error);
          }

          try {
            const candidate = await tx.candidate.create({
              data: {
                electionId: election.id,
                positionId: position.id,
                userId: user.id,
                departmentId: position.departmentId,
                sectionId: position.sectionId,
                slogan: cleanSlogan,
                manifesto: cleanManifesto,
                approved,
                photoBytes: photoBytes ? Buffer.from(photoBytes) : null,
                photoContentType,
                photoFilename,
              },
            });
            return candidate.id;
          } catch (error) {
            if (isUniqueConstraintViolation(error)) {
              throw new ApiError(400, {
                detail: "This user is already registered as a candidate for that position.",
              });
            }
            throw error;
          }
        }, { timeout: 60000, maxWait: 60000 });
      } catch (error) {
        if (error instanceof ApiError) throw error;
        if (isUniqueConstraintViolation(error)) {
          if (positionIsNew) {
            throw new ApiError(400, {
              position_name:
                "A position with this name already exists for the selected election scope.",
            });
          }
          throw new ApiError(400, { username: "This username is already in use." });
        }
        throw error;
      }

      const candidate = (await prisma.candidate.findUniqueOrThrow({
        where: { id: createdId },
        include: CANDIDATE_INCLUDE,
      })) as CandidateRow;
      return json(serializeCandidate(candidate), 201);
    },
  },
});
