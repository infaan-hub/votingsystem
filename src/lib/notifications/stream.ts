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

/**
 * Consumes the authenticated notification stream (an SSE response read through
 * `fetch`, because EventSource cannot send the Authorization header) and calls
 * `onNotification` for each event.
 *
 * Resolves when the stream closes or `signal` aborts — the caller decides
 * whether to reconnect — and rejects only when the request itself fails
 * (network error or a non-OK response), which is the signal to fall back to
 * polling.
 */
export async function consumeNotificationStream(
  token: string,
  handlers: {
    onNotification: (row: NotificationRow) => void;
    /** Called once the response headers arrived and the stream is live. */
    onOpen?: () => void;
  },
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(NOTIFICATION_STREAM_PATH, {
    headers: { Authorization: `Token ${token}` },
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Notification stream unavailable (${response.status}).`);
  }
  handlers.onOpen?.();

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (!signal.aborted) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        // Aborted or dropped mid-flight: treat as a closed stream.
        break;
      }
      if (chunk.done) break;
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
    try {
      await reader.cancel();
    } catch {
      // Already closed.
    }
  }
}
