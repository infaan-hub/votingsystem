import { json, makeRoute } from "@/src/lib/api";
import { badRequest, fieldErrors, forbidden, nonFieldError, serviceUnavailable } from "@/src/lib/http";
import { USER_INCLUDE } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import {
  GoogleNetworkError,
  GoogleVerificationError,
  verifyGoogleIdentity,
  type GooglePayload,
} from "@/src/lib/google";
import { unusablePassword } from "@/src/lib/password";
import { optionalString, readPayload, type Payload } from "@/src/lib/request";
import { userIdByEmailIexact } from "@/src/lib/queries";
import { getOrCreateToken } from "@/src/lib/tokens";
import { serializeUserSummary } from "@/src/lib/serializers";
import { isUniqueConstraintViolation } from "@/src/lib/services";

const GOOGLE_ROLES = ["admin", "voter", "candidate"] as const;

function usernameFromEmail(email: string): string {
  return email.split("@")[0] || "google-user";
}

async function uniqueUsername(base: string): Promise<string> {
  let candidate = base;
  let suffix = 1;
  for (;;) {
    const existing = await prisma.user.findUnique({
      where: { username: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
    candidate = `${base}${suffix}`;
    suffix += 1;
  }
}

function readGoogleFields(payload: Payload) {
  const credential = optionalString(payload, "credential") ?? "";
  const code = optionalString(payload, "code") ?? "";

  if (Object.prototype.hasOwnProperty.call(payload, "role") && payload.role !== null) {
    const role = String(payload.role);
    if (!GOOGLE_ROLES.includes(role as (typeof GOOGLE_ROLES)[number])) {
      throw fieldErrors({ role: `"${role}" is not a valid choice.` });
    }
  }

  if (!credential && !code) {
    // GoogleAuthSerializer.validate() raising a plain string.
    throw nonFieldError("Google sign-in data is required.");
  }

  return {
    credential,
    code,
    role: (payload.role as string | null | undefined) || null,
  };
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0] ?? "",
    lastName: parts.slice(1).join(" "),
  };
}

async function loadUser(userId: number) {
  return prisma.user.findUniqueOrThrow({ where: { id: userId }, include: USER_INCLUDE });
}

async function respondToken(userId: number) {
  const [user, token] = await Promise.all([loadUser(userId), getOrCreateToken(userId)]);
  return json({ token: token.key, user: serializeUserSummary(user) });
}

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const payload = await readPayload(req);
      const { credential, code, role: requestedRole } = readGoogleFields(payload);

      const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
      const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";

      if (!clientId) {
        throw serviceUnavailable("Google sign-in is not configured on the server.");
      }
      if (code && !clientSecret) {
        throw serviceUnavailable("Google sign-in secret is not configured on the server.");
      }

      let idinfo: GooglePayload;
      try {
        idinfo = await verifyGoogleIdentity({ credential, code, clientId, clientSecret });
      } catch (error) {
        if (error instanceof GoogleVerificationError) {
          throw badRequest({ detail: "Google sign-in could not be verified." });
        }
        if (error instanceof GoogleNetworkError) {
          throw serviceUnavailable(
            "Google sign-in is temporarily unavailable. Please try again.",
          );
        }
        console.error("Google sign-in failed unexpectedly.", error);
        throw serviceUnavailable("Google sign-in could not be completed right now.");
      }

      if (!idinfo.email_verified) {
        throw badRequest({ detail: "Google account email is not verified." });
      }

      const email = (idinfo.email || "").trim().toLowerCase();
      const googleId = idinfo.sub || "";
      const fullName = (idinfo.name || "").trim();
      const requested = requestedRole || "voter";

      if (!email || !googleId) {
        throw badRequest({ detail: "Google sign-in did not return a valid account." });
      }

      const matchedId = await userIdByEmailIexact(email);
      const existing = matchedId !== null ? await loadUser(matchedId) : null;

      if (!existing && (requested === "admin" || requested === "candidate")) {
        throw badRequest({
          detail: "This Google account is not linked to an existing admin or candidate record.",
        });
      }

      if (existing) {
        if (existing.googleId && existing.googleId !== googleId) {
          throw badRequest({
            detail: "This email is already linked to a different Google account.",
          });
        }
        if (requested === "admin" && existing.role !== "admin") {
          throw forbidden("This Google account does not have admin access.");
        }
        if (requested === "voter" && existing.role === "admin") {
          throw forbidden("Admin accounts must use the admin portal.");
        }
        if (requested === "candidate" && existing.role === "admin") {
          throw forbidden("Admin accounts must use the admin portal.");
        }

        const { firstName, lastName } = splitFullName(fullName);
        try {
          await prisma.user.update({
            where: { id: existing.id },
            data: {
              googleId,
              authProvider: "google",
              ...(existing.firstName === "" && firstName ? { firstName } : {}),
              ...(existing.firstName === "" && firstName ? { lastName } : {}),
            },
          });
        } catch (error) {
          if (isUniqueConstraintViolation(error)) {
            throw badRequest({
              detail: "This account is already linked to a Google identity.",
            });
          }
          throw error;
        }
        return respondToken(existing.id);
      }

      const { firstName, lastName } = splitFullName(fullName);
      let created;
      try {
        created = await prisma.user.create({
          data: {
            username: await uniqueUsername(usernameFromEmail(email)),
            email,
            password: unusablePassword(),
            firstName,
            lastName,
            role: "voter",
            googleId,
            authProvider: "google",
            isSuperuser: false,
            isStaff: false,
            isActive: true,
          },
        });
      } catch (error) {
        if (isUniqueConstraintViolation(error)) {
          throw badRequest({
            detail: "This account is already linked to a Google identity.",
          });
        }
        throw error;
      }

      return respondToken(created.id);
    },
  },
});
