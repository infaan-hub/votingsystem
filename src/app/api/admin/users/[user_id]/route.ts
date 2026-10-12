import { json, makeRoute, noContent } from "@/src/lib/api";
import { ApiError, fieldErrors, notFoundModel } from "@/src/lib/http";
import { Collector, choiceField, emailField, strField, boolField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload, type Payload } from "@/src/lib/request";
import {
  ValidationError,
  validationErrorBody,
  validateUser,
} from "@/src/lib/validation";
import { serializeUserSummary } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { emailTakenIexact, usernameTakenIexact } from "@/src/lib/queries";
import { USER_INCLUDE } from "@/src/lib/auth";

const MANAGE_ROLES = ["student", "staff", "officer", "admin"] as const;

async function findTargetUser(userId: number) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: { not: "admin" } },
    include: USER_INCLUDE,
  });
  if (!user) throw notFoundModel("CustomUser");
  return user;
}

const route = makeRoute({
  permission: "admin",
  intParams: ["user_id"],
  handlers: {
    PATCH: async (req, params) => {
      const userId = Number(params.user_id);
      const target = await findTargetUser(userId);
      const payload: Payload = await readPayload(req);

      const c = new Collector();
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);
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
      const role = has("role")
        ? choiceField(c, payload, "role", MANAGE_ROLES, { required: false })
        : undefined;
      const isActive = has("is_active")
        ? boolField(c, payload, "is_active", { required: false })
        : undefined;
      c.throwIfAny();

      // validate() — sequential custom checks.
      if (username !== undefined) {
        if (!username) throw fieldErrors({ username: "Username is required." });
        if (await usernameTakenIexact(username, target.id)) {
          throw fieldErrors({ username: "This username is already in use." });
        }
      }
      if (email !== undefined && email) {
        if (await emailTakenIexact(email, target.id)) {
          throw fieldErrors({ email: "This email is already in use." });
        }
      }
      if (role === "admin") {
        throw fieldErrors({ role: "This endpoint cannot promote users to admin." });
      }

      const updates: Record<string, unknown> = {};
      if (username !== undefined) updates.username = username;
      if (email !== undefined) updates.email = email.toLowerCase();
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (role !== undefined) updates.role = role;
      if (isActive !== undefined) updates.isActive = isActive;

      const merged = { ...target, ...updates };
      try {
        await validateUser(
          {
            id: target.id,
            username: merged.username,
            email: merged.email,
            role: merged.role,
            departmentId: merged.departmentId,
            sectionId: merged.sectionId,
            sectionDepartmentId: target.section?.departmentId ?? null,
            googleId: merged.googleId,
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
        if (error instanceof ValidationError) {
          throw new ApiError(400, validationErrorBody(error));
        }
        throw error;
      }

      try {
        const updated = await prisma.user.update({
          where: { id: target.id },
          data: updates,
          include: USER_INCLUDE,
        });
        return json({ user: serializeUserSummary(updated) });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw new ApiError(400, { username: "This username is already in use." });
        }
        throw error;
      }
    },
    DELETE: async (_req, params) => {
      const userId = Number(params.user_id);
      const target = await findTargetUser(userId);
      await prisma.user.delete({ where: { id: target.id } });
      return noContent();
    },
  },
});

export const PATCH = route;
export const DELETE = route;
