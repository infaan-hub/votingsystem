import { json, makeRoute } from "@/src/lib/api";
import { ApiError, fieldErrors } from "@/src/lib/http";
import { Collector, strField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { readPayload, type Payload } from "@/src/lib/request";
import { userIdByEmailIexact, userIdByUsernameIexact } from "@/src/lib/queries";

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const payload: Payload = await readPayload(req);

      const c = new Collector();
      const identity = strField(c, payload, "identity");
      const newPassword = strField(c, payload, "new_password", { minLength: 8 });
      const confirmPassword = strField(c, payload, "confirm_password", { minLength: 8 });
      c.throwIfAny();

      if (newPassword !== confirmPassword) {
        throw fieldErrors({ confirm_password: "Passwords do not match." });
      }

      const trimmed = identity.trim();
      const byUsername = await userIdByUsernameIexact(trimmed);
      const userId = byUsername ?? (await userIdByEmailIexact(trimmed));

      if (userId === null) {
        throw new ApiError(404, {
          detail: "No account was found with that username or email.",
        });
      }

      const user = await prisma.user.findUnique({ where: { id: userId } });

      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashPassword(newPassword),
          ...(user?.authProvider === "google" ? { authProvider: "local" } : {}),
        },
      });

      return json({ detail: "Password updated successfully." });
    },
  },
});
