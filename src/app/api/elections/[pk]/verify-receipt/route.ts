import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { findPublishedElection } from "@/src/lib/elections";

export const GET = makeRoute({
  handlers: {
    GET: async (req, params) => {
      const election = await findPublishedElection(params.pk ?? "");
      if (!election) throw notFoundModel("Election");
      const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
      if (!code) {
        return json({ counted: false, reason: "missing_code" });
      }

      const submission = await prisma.voteSubmission.findFirst({
        where: { electionId: election.id, receiptCode: code },
        select: { id: true },
      });
      if (submission) return json({ counted: true });

      const legacy = await prisma.vote.findFirst({
        where: { electionId: election.id, receiptCode: code },
        select: { id: true },
      });
      return json({ counted: Boolean(legacy) });
    },
  },
});