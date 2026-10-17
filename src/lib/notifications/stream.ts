import type { NotificationRow } from "@/src/lib/notifications/types";

export const NOTIFICATION_STREAM_PATH = "/api/notifications/stream";

/**
 * Splits an incremental SSE buffer into complete `data:` payloads. Comment
 * lines (heartbeats) are dropped; `rest` is the unterminated tail that the
 * next chunk continues.
 */
export function splitSseBuffer(buffer: string): { events: string[]; rest: string } {
  const parts = buffer.split(/\r?\n\r?\n/);
  const rest = parts.pop() ?? "";
  const events: string[] = [];
  for (const part of parts) {
    const data = part
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).replace(/^ /, ""))
      .join("\n");
    if (data) events.push(data);
  }
  return { events, rest };
}

/** No frame for this long means the stream is stalled, not just quiet. */
export const STREAM_IDLE_TIMEOUT_MS = 45_000;

/**
 * Consumes the authenticated notification stream (an SSE response read through
 * `fetch`, because EventSource cannot send the Authorization header) and calls
 * `onNotification` for each event.
 *
 * Resolves when the stream closes or `signal` aborts — the caller decides
 * whether to reconnect — and rejects only when the request itself fails
 * (network error or a non-OK response), which is the signal to fall back to
 * polling. A stream that stops producing frames (hung proxy, stalled
 * serverless function) resolves after {@link STREAM_IDLE_TIMEOUT_MS} so the
 * caller reconnects instead of waiting forever on a dead connection.
 */
export async function consumeNotificationStream(
  token: string,
  handlers: {
    onNotification: (row: NotificationRow) => void;
    /** Called once the response headers arrived and the stream is live. */
    onOpen?: () => void;
  },
  signal: AbortSignal,
  options: { idleTimeoutMs?: number } = {},
): Promise<void> {
  const idleTimeoutMs = options.idleTimeoutMs ?? STREAM_IDLE_TIMEOUT_MS;
  // Local controller chained to the caller's signal: the watchdog has to be
  // able to cancel a pending read, which only aborting the fetch can do.
  const local = new AbortController();
  const onAbort = () => local.abort();
  if (signal.aborted) local.abort();
  else signal.addEventListener("abort", onAbort);

  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const resetIdle = () => {
    if (idleTimeoutMs <= 0) return;
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => local.abort(), idleTimeoutMs);
  };

  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  // Resolves the moment the caller aborts (or the watchdog fires). The body
  // read itself cannot be trusted to reject on abort in every runtime, so the
  // loop races it explicitly instead of waiting on a dead connection.
  let signalAbortListener: (() => void) | null = null;
  const aborted = new Promise<"aborted">((resolve) => {
    signalAbortListener = () => resolve("aborted");
    if (local.signal.aborted) signalAbortListener();
    else local.signal.addEventListener("abort", signalAbortListener, { once: true });
  });

  try {
    const response = await fetch(NOTIFICATION_STREAM_PATH, {
      headers: { Authorization: `Token ${token}` },
      cache: "no-store",
      signal: local.signal,
    });
    if (!response.ok || !response.body) {
      throw new Error(`Notification stream unavailable (${response.status}).`);
    }
    handlers.onOpen?.();
    resetIdle();

    reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!local.signal.aborted) {
      const outcome = await Promise.race([
        reader
          .read()
          .then((chunk) => ({ chunk }) as { chunk: ReadableStreamReadResult<Uint8Array> })
          .catch(() => ({ broken: true }) as { broken: true }),
        aborted,
      ]);
      if (outcome === "aborted" || "broken" in outcome) break;
      const chunk = outcome.chunk;
      if (chunk.done) break;
      resetIdle();
      buffer += decoder.decode(chunk.value, { stream: true });
      const { events, rest } = splitSseBuffer(buffer);
      buffer = rest;
      for (const event of events) {
        try {
          handlers.onNotification(JSON.parse(event) as NotificationRow);
        } catch {
          // A malformed frame is skipped; the next event is independent.
        }
      }
    }
  } finally {
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    signal.removeEventListener("abort", onAbort);
    if (signalAbortListener) local.signal.removeEventListener("abort", signalAbortListener);
    try {
      await reader?.cancel();
    } catch {
      // Already closed.
    }
  }
}
