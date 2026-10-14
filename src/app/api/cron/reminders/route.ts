import { json, makeRoute } from "@/src/lib/api";
import { runElectionReminders } from "@/src/lib/notifications/events";

/**
 * Authenticated scheduled-job endpoint invoked by the platform scheduler
 * (Vercel Cron, see `crons` in vercel.json).
 *
 * Deployment requirements (documented, not assumed):
 *  - `CRON_SECRET` must be set in the deployment environment. Vercel sends it
 *    as `Authorization: Bearer <CRON_SECRET>` on cron invocations.
 *  - Without a configured secret the endpoint refuses (503) so a
 *    misconfigured deployment can never fire unauthenticated fan-outs.
 *
 * Reminder honesty: the run re-reads persisted election state, deduplicates
 * per election per schedule revision, and records the actual notification
 * createdAt — it never claims a reminder fired "on schedule".
 */
export const GET = makeRoute({
  handlers: {
    GET: async (req) => {
      const secret = process.env.CRON_SECRET;
      if (!secret || !secret.trim()) {
        return json(
          { detail: "CRON_SECRET is not configured; scheduled reminders are disabled." },
          503,
        );
      }
      const authorization = req.headers.get("authorization") ?? "";
      if (authorization !== `Bearer ${secret}`) {
        return json({ detail: "Not authorized." }, 401);
      }
      const summary = await runElectionReminders();
      return json(summary);
    },
  },
});
