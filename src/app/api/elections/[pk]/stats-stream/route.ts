import { prisma } from "@/src/lib/db";
import { htmlNotFound } from "@/src/lib/http";
import { resultsVisible, serializeStatsEvent } from "@/src/lib/services";
import type { Election } from "@/src/generated/prisma/client";

/**
 * Plain function view (`election_stats_stream`): no auth parsing, no
 * Allow header, every HTTP method, HTML 404 for missing elections, empty-body
 * 403 when results are hidden, otherwise an infinite SSE stream.
 */

function streamResponse(election: Election, req: Request): Response {
  const encoder = new TextEncoder();
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const abort = () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
  };
  req.signal.addEventListener("abort", abort);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (!cancelled) {
          controller.enqueue(encoder.encode("retry: 5000\n"));
          const data = await serializeStatsEvent(election);
          if (cancelled) break;
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          await new Promise((resolve) => {
            timer = setTimeout(resolve, 5000);
          });
        }
      } catch {
        // Client went away or the event loop was torn down.
      } finally {
        req.signal.removeEventListener("abort", abort);
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
    cancel() {
      abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}

async function handle(req: Request, context: { params: Promise<Record<string, string>> }) {
  let params: Record<string, string> = {};
  try {
    params = await context.params;
  } catch {
    params = {};
  }
  const raw = params.pk;
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw htmlNotFound();
  }
  const pk = Number(raw);
  const election = await prisma.election.findFirst({
    where: { id: pk, isPublished: true },
  });
  if (!election) throw htmlNotFound();
  if (!resultsVisible(election, null)) {
    return new Response(null, {
      status: 403,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
  return streamResponse(election, req);
}

function wrap(
  fn: (req: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>,
) {
  return async (req: Request, context: { params: Promise<Record<string, string>> }) => {
    try {
      return await fn(req, context);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "status" in error &&
        "body" in error &&
        "headers" in error
      ) {
        const apiError = error as { status: number; body: unknown; headers: Record<string, string> };
        if (apiError.headers["Content-Type"]?.includes("text/html")) {
          return new Response(String(apiError.body), {
            status: apiError.status,
            headers: apiError.headers,
          });
        }
        return new Response(JSON.stringify(apiError.body), {
          status: apiError.status,
          headers: { "Content-Type": "application/json", ...apiError.headers },
        });
      }
      console.error("stats-stream failed:", error);
      return new Response(JSON.stringify({ detail: "A server error occurred." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  };
}

export const GET = wrap(handle);
export const POST = wrap(handle);
export const PUT = wrap(handle);
export const PATCH = wrap(handle);
export const DELETE = wrap(handle);
export const OPTIONS = wrap(handle);
