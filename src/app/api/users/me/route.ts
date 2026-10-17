import { json, makeRoute } from "@/src/lib/api";
import { ApiError, fieldErrors } from "@/src/lib/http";
import { Collector, emailField, isValidPhone, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { hashPassword, verifyPassword } from "@/src/lib/password";
import { readPayload } from "@/src/lib/request";
import { requireStateUser, USER_INCLUDE } from "@/src/lib/auth";
import { emailTakenIexact } from "@/src/lib/queries";
import { serializeUserSummary } from "@/src/lib/serializers";
import {
  ValidationError,
  validationErrorBody,
  validateUser,
} from "@/src/lib/validation";

/**
 * PATCH: the signed-in user edits their own profile — first and last name,
 * email, and the WhatsApp phone number that election officers use as the
 * sending identity when sharing election links.
 *
 * Privileged fields are refused here by design: a role (or account status) is
 * assigned by an administrator through `/api/admin/users/[user_id]/`, so a
 * signed-in account can never promote — or demote — itself.
 */

const NAME_MAX_LENGTH = 150;

/** Field -> message for anything a profile edit must never change. */
const PRIVILEGED_FIELDS: Record<string, string> = {
  role: "You cannot change your own role. An administrator can update it for you.",
  is_active: "Account status can only be changed by an administrator.",
  is_staff: "This field can only be changed by an administrator.",
  is_superuser: "This field can only be changed by an administrator.",
};

export const PATCH = makeRoute({
  permission: "authenticated",
  handlers: {
    PATCH: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = await readPayload(req);
      const has = (key: string) => Object.prototype.hasOwnProperty.call(payload, key);

      for (const [field, message] of Object.entries(PRIVILEGED_FIELDS)) {
        if (has(field)) throw fieldErrors({ [field]: message });
      }

      const c = new Collector();
      const firstName = has("first_name")
        ? strField(c, payload, "first_name", {
            required: false,
            allowBlank: true,
            maxLength: NAME_MAX_LENGTH,
          })
        : undefined;
      const lastName = has("last_name")
        ? strField(c, payload, "last_name", {
            required: false,
            allowBlank: true,
            maxLength: NAME_MAX_LENGTH,
          })
        : undefined;
      const email = has("email")
        ? emailField(c, payload, "email", { required: false })
        : undefined;
      const phoneNumber = has("phone_number")
        ? strField(c, payload, "phone_number", {
            required: false,
            allowBlank: true,
            maxLength: 25,
          })
        : undefined;
      const currentPassword = has("current_password")
        ? strField(c, payload, "current_password", { required: false })
        : undefined;
      const newPassword = has("password")
        ? strField(c, payload, "password", {
            required: false,
            minLength: 8,
            maxLength: 128,
          })
        : undefined;
      const confirmPassword = has("confirm_password")
        ? strField(c, payload, "confirm_password", { required: false })
        : undefined;
      c.throwIfAny();

      if (phoneNumber !== undefined) {
        const trimmed = phoneNumber.trim();
        if (trimmed && !isValidPhone(trimmed)) {
          throw fieldErrors({
            phone_number: "Enter a valid phone number (digits, optionally starting with +).",
          });
        }
      }
      if (email !== undefined && email && (await emailTakenIexact(email, user.id))) {
        throw fieldErrors({ email: "This email is already in use." });
      }

      // Changing the address on the account, or its password, is a
      // take-over-grade action: prove possession of the current password
      // first. A password already on file proves nothing about a new one, so
      // it must also differ from the current one.
      const emailChanging =
        email !== undefined && email.toLowerCase() !== (user.email || "").toLowerCase();
      if (emailChanging || newPassword !== undefined) {
        if (!currentPassword || !verifyPassword(currentPassword, user.password)) {
          throw fieldErrors({
            current_password: emailChanging
              ? "Enter your current password to change your email address."
              : "That password is incorrect.",
          });
        }
      }
      let passwordHash: string | undefined;
      if (newPassword !== undefined) {
        if (newPassword !== (confirmPassword ?? "")) {
          throw fieldErrors({ confirm_password: "Passwords do not match." });
        }
        if (verifyPassword(newPassword, user.password)) {
          throw fieldErrors({
            password: "Choose a password you have not used for this account.",
          });
        }
        passwordHash = hashPassword(newPassword);
      }

      // The same account rules creation uses, checked against the merged
      // values — the fields a profile edit cannot touch keep their current
      // values, so only the submitted ones can ever fail.
      try {
        await validateUser({
          id: user.id,
          username: user.username,
          email: email ?? user.email,
          role: user.role,
          departmentId: user.departmentId,
          sectionId: user.sectionId,
          sectionDepartmentId: user.section?.departmentId ?? null,
          googleId: user.googleId,
        });
      } catch (error) {
        if (error instanceof ValidationError) {
          throw new ApiError(400, validationErrorBody(error));
        }
        throw error;
      }

      const updates: Record<string, unknown> = {};
      if (firstName !== undefined) updates.firstName = firstName;
      if (lastName !== undefined) updates.lastName = lastName;
      if (email !== undefined) updates.email = email.toLowerCase();
      if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber.trim();
      if (passwordHash) updates.password = passwordHash;

      const updated =
        Object.keys(updates).length === 0
          ? user
          : await prisma.user.update({
              where: { id: user.id },
              data: updates,
              include: USER_INCLUDE,
            });
      return json(serializeUserSummary(updated));
    },
  },
});
