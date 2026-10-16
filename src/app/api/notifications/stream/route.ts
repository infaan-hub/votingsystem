import { makeRoute } from "@/src/lib/api";
import { prisma } from "@/src/lib/db";
import { requireStateUser } from "@/src/lib/auth";
import { serializeNotification } from "@/src/lib/notifications/serialize";

/**
 * GET /api/notifications/stream — real-time push of new notifications to the
 * signed-in user's open tab, as Server-Sent Events.
 *
 * This is the "instant" half of the notification story: Web Push reaches
 * closed apps through the browser vendor, while this stream lets a visible tab
 * show an in-app banner the moment the row lands — no polling delay. The
 * server owns the cursor (`id > lastSent`) and starts from the user's current
 * newest id, so a connection never replays history.
 *
 * Serverless hosts cap how long a response may stay open; when the runtime
 * ends the stream the client simply reconnects, and it falls back to polling
 * while the stream is down.
 */

/** How often the server looks for new rows. */
const TICK_MS = 1_500;
/** Rows sent per tick; a larger backlog is picked up by the next tick. */
const BATCH_LIMIT = 20;
/** Comment heartbeat cadence (every N ticks) so idle connections stay alive. */
const HEARTBEAT_TICKS = 10;

const route = makeRoute({
  permission: "authenticated",
  handlers: {
    GET: async (req, _params, state) => {
      const user = requireStateUser(state);

      const newest = await prisma.notification.aggregate({
        where: { recipientId: user.id },
        _max: { id: true },
      });
      let lastId = newest._max.id ?? 0;

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
          let ticks = 0;
          const send = (text: string) => controller.enqueue(encoder.encode(text));
          try {
            // Reconnect hint for SSE clients; harmless to a fetch-based reader.
            send("retry: 3000\n\n");
            while (!cancelled) {
              const rows = await prisma.notification.findMany({
                where: { recipientId: user.id, id: { gt: lastId } },
                orderBy: { id: "asc" },
                take: BATCH_LIMIT,
              });
              if (cancelled) break;
              for (const row of rows) {
                lastId = row.id;
                send(`data: ${JSON.stringify(serializeNotification(row))}\n\n`);
              }
              ticks += 1;
              if (ticks % HEARTBEAT_TICKS === 0) send(": keep-alive\n\n");
              await new Promise((resolve) => {
                timer = setTimeout(resolve, TICK_MS);
              });
            }
          } catch {
            // Client went away or the runtime tore the event loop down.
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
          // no-transform stops intermediaries (and Next's own pipeline) from
          // buffering the body until the connection closes.
          "Cache-Control": "no-cache, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    },
  },
});

export { route as GET };
