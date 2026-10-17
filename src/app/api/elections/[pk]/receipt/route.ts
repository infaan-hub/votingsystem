import { json, makeRoute } from "@/src/lib/api";
import { notFoundModel } from "@/src/lib/http";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";
import { findPublishedElection } from "@/src/lib/elections";
import { displayName } from "@/src/lib/serializers";

type ReceiptEntry = {
  receipt_code: string;
  position: string;
  cast_at: Date;
  choices: string[];
};

/**
 * GET /api/elections/[pk]/receipt — the signed-in voter's OWN receipts in one
 * election. Only their rows are ever read or returned; a receipt code is not
 * derived from ballot content, so it cannot be used to infer a choice.
 */
export const GET = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (_req, params, state) => {
      const user = requireStateUser(state);
      const election = await findPublishedElection(params.pk ?? "");
      if (!election) throw notFoundModel("Election");

      const submissions = await prisma.voteSubmission.findMany({
        where: { voterId: user.id, electionId: election.id },
        include: {
          position: { select: { name: true } },
          votes: {
            include: { candidate: { include: { user: true } }, ballotOption: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      const receipts: ReceiptEntry[] = submissions.map((submission) => ({
        receipt_code: submission.receiptCode,
        position: submission.position.name,
        cast_at: submission.createdAt,
        choices: submission.votes
          .map((vote) =>
            vote.candidate
              ? displayName(vote.candidate.user)
              : (vote.ballotOption?.label ?? vote.writeInText.trim()),
          )
          .filter((choice) => choice.length > 0),
      }));

      // Votes cast before submissions existed still carry a receipt code on
      // their vote rows; grouped by question + code they form the same shape.
      if (receipts.length === 0) {
        const legacyVotes = await prisma.vote.findMany({
          where: { voterId: user.id, electionId: election.id },
          include: {
            position: { select: { name: true } },
            candidate: { include: { user: true } },
            ballotOption: true,
          },
          orderBy: { createdAt: "desc" },
        });
        const grouped = new Map<string, ReceiptEntry>();
        for (const vote of legacyVotes) {
          const key = `${vote.positionId}:${vote.receiptCode}`;
          const choice = vote.candidate
            ? displayName(vote.candidate.user)
            : (vote.ballotOption?.label ?? vote.writeInText.trim());
          const entry = grouped.get(key);
          if (entry) {
            if (choice) entry.choices.push(choice);
          } else {
            grouped.set(key, {
              receipt_code: vote.receiptCode,
              position: vote.position.name,
              cast_at: vote.createdAt,
              choices: choice ? [choice] : [],
            });
          }
        }
        receipts.push(...grouped.values());
      }

      return json({
        election: { id: election.id, slug: election.slug, title: election.title },
        receipts,
      });
    },
  },
});
