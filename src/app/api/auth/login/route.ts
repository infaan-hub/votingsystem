import { json, makeRoute } from "@/src/lib/api";
import { badRequest, serviceUnavailable } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { verifyPassword } from "@/src/lib/password";
import { readPayload } from "@/src/lib/request";
import { serializeUserSummary } from "@/src/lib/serializers";
import { getOrCreateToken } from "@/src/lib/tokens";

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60_000;

function rateLimit(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

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
      const ip = req.headers.get("x-forwarded-for") || "unknown";
      if (!rateLimit(ip)) {
        throw serviceUnavailable("Too many login attempts. Please try again later.");
      }

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