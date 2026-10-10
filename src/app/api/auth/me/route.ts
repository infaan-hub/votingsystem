import { json, makeRoute } from "@/src/lib/api";
import { serializeUserSummary } from "@/src/lib/serializers";

export const GET = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (_req, _params, state) => json(serializeUserSummary(state.user!)),
  },
});
