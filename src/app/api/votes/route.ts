import { json, makeRoute } from "@/src/lib/api";
import { ApiError, notFoundModel } from "@/src/lib/http";
import { Collector, intField } from "@/src/lib/fields";
import { prisma } from "@/src/lib/db";
import { readPayload } from "@/src/lib/request";
import { requireStateUser } from "@/src/lib/auth";
import { ValidationError } from "@/src/lib/validation";
import { castVote } from "@/src/lib/services";
import { serializeVote } from "@/src/lib/serializers";

function normalizeVoteError(detail: string): string {
  if (detail.toLowerCase().includes("already exists")) {
    return "You have already voted for this position in this election.";
  }
  return detail;
}

export const POST = makeRoute({
  permission: "authenticated",
  handlers: {
    POST: async (req, _params, state) => {
      const user = requireStateUser(state);
      const payload = await readPayload(req);
      const c = new Collector();
      const candidateId = intField(c, payload, "candidate_id")!;
      c.throwIfAny();

      const candidate = await prisma.candidate.findUnique({
        where: { id: candidateId },
      });
      if (!candidate) throw notFoundModel("Candidate");

      let voteId: number;
      try {
        const vote = await castVote(user, candidate);
        voteId = vote.id;
      } catch (error) {
        if (error instanceof ValidationError) {
          if (error.errorDict && Object.keys(error.errorDict).length) {
            let detail: unknown = error.errorDict;
            const all = error.errorDict.__all__;
            if (all && all.length) {
              detail = { detail: normalizeVoteError(all[0]) };
            }
            throw new ApiError(400, detail);
          }
          throw new ApiError(400, {
            detail: error.messages.length
              ? normalizeVoteError(error.messages[0])
              : "Vote could not be recorded.",
          });
        }
        throw error;
      }

      const vote = await prisma.vote.findUniqueOrThrow({
        where: { id: voteId },
        include: {
          candidate: {
            include: {
              user: { include: { department: true, section: { include: { department: true } } } },
              department: true,
              section: { include: { department: true } },
              party: true,
            },
          },
          ballotOption: true,
          position: true,
          election: true,
        },
      });
      return json(serializeVote(vote), 201);
    },
  },
});
