import { json, makeRoute } from "@/src/lib/api";
import { ApiError, fieldErrors } from "@/src/lib/http";
import { Collector, emailField, strField } from "@/src/lib/fields";
import { modelUsernameField } from "@/src/lib/registration";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { readPayload } from "@/src/lib/request";
import { ValidationError, validationErrorBody, validateUser } from "@/src/lib/validation";
import { serializeUserSummary } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";
import { USER_INCLUDE } from "@/src/lib/auth";

export const POST = makeRoute({
  permission: "admin",
  handlers: {
    POST: async (req) => {
      const payload = await readPayload(req);

      const c = new Collector();
      const username = await modelUsernameField(c, payload);
      const email = emailField(c, payload, "email", { required: false, maxLength: 254 });
      const firstName = strField(c, payload, "first_name", { maxLength: 150 });
      const lastName = strField(c, payload, "last_name", { maxLength: 150 });
      const password = strField(c, payload, "password", { minLength: 8 });
      const confirmPassword = strField(c, payload, "confirm_password", { minLength: 8 });
      c.throwIfAny();

      if (password !== confirmPassword) {
        throw fieldErrors({ confirm_password: "Passwords do not match." });
      }

      try {
        await validateUser(
          {
            username,
            email,
            role: "voter",
            googleId: null,
            departmentId: null,
            sectionId: null,
            sectionDepartmentId: null,
          },
          async (field, value) => {
            if (field === "username") {
              const row = await prisma.user.findUnique({
                where: { username: value },
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
        const created = await prisma.user.create({
          data: {
            username,
            email,
            password: hashPassword(password),
            role: "voter",
            firstName,
            lastName,
            isSuperuser: false,
            isStaff: false,
            isActive: true,
          },
          include: USER_INCLUDE,
        });
        return json({ user: serializeUserSummary(created) }, 201);
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          // IntegrityError normalization produces bare string values.
          throw new ApiError(400, { username: "This username is already in use." });
        }
        throw error;
      }
    },
  },
});
