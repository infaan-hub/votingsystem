import { beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/src/lib/db";
import { hashPassword } from "@/src/lib/password";
import { splitSseBuffer } from "@/src/lib/notifications/stream";
import { call, createTokenFor, jsonRequest, resetDb } from "./helpers";

import { GET as streamGET } from "@/src/app/api/notifications/stream/route";

async function makeUser(username: string) {
  const user = await prisma.user.create({
    data: { username, password: hashPassword("Pass1234!"), role: "voter" },
  });
  return { user, token: await createTokenFor(user.id) };
}

/** Reads from the stream until `predicate` matches, or the deadline passes. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs = 8_000,
): Promise<string> {
  const decoder = new TextDecoder();
  let seen = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), remaining);
    });
    const chunk = await Promise.race([reader.read(), timeout]);
    if (timer !== undefined) clearTimeout(timer);
    if (!chunk || chunk.done) break;
    seen += decoder.decode(chunk.value, { stream: true });
    if (predicate(seen)) return seen;
  }
  return seen;
}

function dataPayload(text: string): Record<string, unknown> {
  const line = text.split("\n").find((entry) => entry.startsWith("data: "));
  if (!line) throw new Error("No SSE data line found in the stream output.");
  return JSON.parse(line.slice("data: ".length)) as Record<string, unknown>;
}

describe("NotificationStreamTests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("requires authentication", async () => {
    const response = await call(streamGET, jsonRequest("/api/notifications/stream"));
    expect(response.status).toBe(401);
  });

  it("only streams notifications created after the connection opens", async () => {
    const { user, token } = await makeUser("stream_user");
    // History must never replay: a browser that just connected is up to date.
    await prisma.notification.create({
      data: {
        recipientId: user.id,
        title: "Old alert",
        body: "before connect",
        category: "system",
        targetUrl: "/dashboard",
        tag: "old",
      },
    });

    const response = await call(
      streamGET,
      jsonRequest("/api/notifications/stream", { token }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    const reader = response.body!.getReader();

    const opening = await readUntil(reader, (text) => text.includes("\n\n"));
    expect(opening).toContain("retry:");
    expect(opening).not.toContain("Old alert");

    await prisma.notification.create({
      data: {
        recipientId: user.id,
        title: "Live alert",
        body: "after connect",
        category: "election",
        targetUrl: "/elections/test",
        tag: "live",
      },
    });

    const delivered = await readUntil(reader, (text) => text.includes("Live alert"));
    const payload = dataPayload(delivered);
    expect(payload).toMatchObject({
      title: "Live alert",
      body: "after connect",
      category: "election",
      target_url: "/elections/test",
      tag: "live",
      is_read: false,
      read_at: null,
    });
    expect(typeof payload.id).toBe("number");

    await reader.cancel();
  });

  it("never leaks another member's notifications", async () => {
    const { user: mine, token } = await makeUser("stream_mine");
    const { user: theirs } = await makeUser("stream_theirs");

    const response = await call(
      streamGET,
      jsonRequest("/api/notifications/stream", { token }),
    );
    const reader = response.body!.getReader();
    await readUntil(reader, (text) => text.includes("retry:"));

    await prisma.notification.create({
      data: {
        recipientId: theirs.id,
        title: "Not mine",
        body: "private",
        category: "system",
        targetUrl: "/dashboard",
        tag: "theirs",
      },
    });
    await prisma.notification.create({
      data: {
        recipientId: mine.id,
        title: "Mine",
        body: "visible",
        category: "system",
        targetUrl: "/dashboard",
        tag: "mine",
      },
    });

    const delivered = await readUntil(reader, (text) => text.includes("Mine"));
    expect(delivered).toContain("Mine");
    expect(delivered).not.toContain("Not mine");

    await reader.cancel();
  });
});

describe("splitSseBuffer", () => {
  it("parses complete data frames and keeps the partial tail", () => {
    const first = splitSseBuffer("retry: 3000\n\ndata: {\"id\":1}\n\ndata: {\"id\":");
    expect(first.events).toEqual(['{"id":1}']);
    expect(first.rest).toBe('data: {"id":');
  });

  it("handles CRLF frames, comments, and multi-line data", () => {
    const { events } = splitSseBuffer(
      ": keep-alive\r\n\r\ndata: line one\r\ndata: line two\r\n\r\n",
    );
    expect(events).toEqual(["line one\nline two"]);
  });

  it("returns nothing for an incomplete buffer", () => {
    expect(splitSseBuffer("data: {\"id\":2}").events).toEqual([]);
    expect(splitSseBuffer("").events).toEqual([]);
  });
});
