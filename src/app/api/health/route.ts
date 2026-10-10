import { json, makeRoute } from "@/src/lib/api";

export const GET = makeRoute({
  handlers: {
    GET: async () => json({ status: "ok" }),
  },
});
