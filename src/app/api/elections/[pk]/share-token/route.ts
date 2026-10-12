import { json, makeRoute } from "@/src/lib/api";
import { fieldErrors } from "@/src/lib/http";
import { Collector, intField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateOfficer } from "@/src/lib/auth";
import { requireManagedElection } from "@/src/lib/officer";
import { generateShareToken } from "@/src/lib/eligibility";
import { recordAudit, clientIp } from "@/src/lib/audit";
import { formatDateTime } from "@/src/lib/time";

export const POST = makeRoute({
  permission: "officer",
  intParams: ["pk"],
  handlers: {
    POST: async (req, params, state) => {
      const officer = requireStateOfficer(state);
      const election = await requireManagedElection(Number(params.pk), officer);
      const payload = await readPayload(req);

      const c = new Collector();
      const rawDays = payload.expires_in_days;
      let days = 30;
      if (rawDays !== undefined && rawDays !== null && rawDays !== "") {
        const parsed = intField(c, payload, "expires_in_days", { required: false });
        if (parsed !== undefined) days = parsed;
      }
      c.throwIfAny();
      if (days < 1 || days > 365) {
        throw fieldErrors({ expires_in_days: "Enter a number of days between 1 and 365." });
      }

      const token = generateShareToken();
      const expiry = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const updated = await prisma.election.update({
        where: { id: election.id },
        data: { shareToken: token, shareTokenExpiry: expiry },
      });

      await recordAudit({
        actorId: officer.id,
        action: "officer.share_token.regenerate",
        entityType: "Election",
        entityId: election.id,
        summary: `Share token regenerated for "${updated.title}"`,
        detail: { expires_in_days: days },
        ipAddress: clientIp(req),
      });

      return json({
        share_token: token,
        invite_path: `/elections/${updated.slug}?invite=${token}`,
        expires_at: formatDateTime(expiry, updated.timezone || "UTC"),
      });
    },
  },
});
