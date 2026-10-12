import { json, makeRoute } from "@/src/lib/api";
import { readPayload } from "@/src/lib/request";
import { respondWithToken, runRegistration } from "@/src/lib/registration";

/**
 * Administrator accounts are provisioned from the admin console
 * (`/admin/add-election-officer`), never by the public. Gating this route
 * behind an authenticated administrator closes the self-service privilege
 * escalation path while keeping the original contract for existing callers.
 */
export const POST = makeRoute({
  permission: "admin",
  handlers: {
    POST: async (req) => {
      const payload = await readPayload(req);
      const { userId } = await runRegistration(payload, "admin");
      const { token, user } = await respondWithToken(userId);
      return json({ token, user }, 201);
    },
  },
});
