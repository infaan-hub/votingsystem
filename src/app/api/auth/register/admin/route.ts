import { json, makeRoute } from "@/src/lib/api";
import { readPayload } from "@/src/lib/request";
import { respondWithToken, runRegistration } from "@/src/lib/registration";

export const POST = makeRoute({
  handlers: {
    POST: async (req) => {
      const payload = await readPayload(req);
      const { userId } = await runRegistration(payload, "admin");
      const { token, user } = await respondWithToken(userId);
      return json({ token, user }, 201);
    },
  },
});
