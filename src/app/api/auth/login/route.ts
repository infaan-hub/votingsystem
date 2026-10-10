import { json, makeRoute } from "@/src/lib/api";
import { badRequest } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { verifyPassword } from "@/src/lib/password";
import { readPayload } from "@/src/lib/request";
import { serializeUserSummary } from "@/src/lib/serializers";
import { getOrCreateToken } from "@/src/lib/tokens";

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value !== undefined && value !== null && typeof value !== "object") {
    return String(value);
  }
  return "";
}

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const payload = await readPayload(req);
      const username = asString(payload.username);
      const password = asString(payload.password);

      const user = await prisma.user.findUnique({
        where: { username },
        include: {
          department: true,
          section: { include: { department: true } },
        },
      });

      if (!user || !user.isActive || !verifyPassword(password, user.password)) {
        throw badRequest({ detail: "Invalid username or password." });
      }

      const token = await getOrCreateToken(user.id);
      return json({ token: token.key, user: serializeUserSummary(user) });
    },
  },
});
