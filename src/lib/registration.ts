import { ApiError, fieldErrors } from "@/src/lib/http";
import { Collector, emailField, strField } from "@/src/lib/fields";
import { hashPassword } from "@/src/lib/password";
import type { Payload } from "@/src/lib/request";
import { prisma } from "@/src/lib/db";
import { ValidationError, validateUser } from "@/src/lib/validation";
import { getOrCreateToken } from "@/src/lib/tokens";
import { USER_INCLUDE } from "@/src/lib/auth";
import { serializeUserSummary } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";

export type RegistrationRole = "admin" | "student";

const USERNAME_CHARSET_RE = /^[\w.@+-]+$/u;

/**
 * `username` field, validated in this order: unicode username rules →
 * uniqueness (exact match) → max length.
 */
export async function modelUsernameField(c: Collector, payload: Payload): Promise<string> {
  const username = strField(c, payload, "username", { required: true });
  if (!username || c.has("username")) return username;

  if (!USERNAME_CHARSET_RE.test(username)) {
    c.field(
      "username",
      "Enter a valid username. This value may contain only letters, numbers, and @/./+/-/_ characters.",
    );
    return username;
  }
  const existing = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (existing) {
    c.field("username", "A user with that username already exists.");
    return username;
  }
  if (username.length > 150) {
    c.field("username", "Ensure this field has no more than 150 characters.");
  }
  return username;
}

/**
 * Shared admin/voter registration: field validation (all errors aggregated
 * at once), then the sequential cross-field rules, then the database write.
 */
export async function runRegistration(
  payload: Payload,
  role: RegistrationRole,
): Promise<{ userId: number }> {
  const isVoter = role === "student";
  const c = new Collector();

  const username = await modelUsernameField(c, payload);
  const email = emailField(c, payload, "email", { required: false, maxLength: 254 });
  const password = strField(c, payload, "password", { minLength: 8 });
  const confirmPassword = strField(c, payload, "confirm_password", { minLength: 8 });

  let fullName = "";
  if (!isVoter) {
    fullName = strField(c, payload, "full_name", { required: false, allowBlank: true });
  }

  let firstName = "";
  let lastName = "";
  if (isVoter) {
    firstName = strField(c, payload, "first_name", {
      required: false,
      allowBlank: true,
      maxLength: 150,
    });
    lastName = strField(c, payload, "last_name", {
      required: false,
      allowBlank: true,
      maxLength: 150,
    });
  }

  let staffId = "";
  if (!isVoter) {
    staffId = strField(c, payload, "staff_id", {
      required: false,
      allowBlank: true,
      maxLength: 60,
    });
  }

  // Field-level errors throw before any cross-field rule runs.
  c.throwIfAny();

  // Cross-field rules — sequential, first failing rule wins.
  if (password !== confirmPassword) {
    throw fieldErrors({ confirm_password: "Passwords do not match." });
  }
  if (fullName && !firstName && !lastName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    firstName = parts[0] ?? "";
    lastName = parts.slice(1).join(" ");
  }
  if (!isVoter && !staffId) {
    throw fieldErrors({ staff_id: "Staff ID is required." });
  }
  if (isVoter && !firstName) {
    throw fieldErrors({ first_name: "First name is required." });
  }
  if (isVoter && !lastName) {
    throw fieldErrors({ last_name: "Last name is required." });
  }

  // Model-level validation, then save.
  try {
    await validateUser(
      {
        username,
        email,
        role,
        staffId,
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
        if (field === "google_id" && value) {
          const row = await prisma.user.findFirst({
            where: { googleId: value },
            select: { id: true },
          });
          return row !== null;
        }
        return false;
      },
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ApiError(400, error.errorDict ?? { detail: error.messages });
    }
    throw error;
  }

  try {
    const created = await prisma.user.create({
      data: {
        username,
        email,
        password: hashPassword(password),
        role,
        firstName,
        lastName,
        staffId,
        registrationNumber: "",
        isSuperuser: false,
        isStaff: false,
        isActive: true,
      },
    });
    return { userId: created.id };
  } catch (error) {
    if (isUniqueConstraintViolation(error)) {
      throw fieldErrors({ username: "A user with that username already exists." });
    }
    throw error;
  }
}

export async function respondWithToken(userId: number) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: USER_INCLUDE,
  });
  const token = await getOrCreateToken(userId);
  return { token: token.key, user: serializeUserSummary(user) };
}
