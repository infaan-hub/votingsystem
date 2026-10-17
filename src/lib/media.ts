/**
 * Server-side media inspection for campaign uploads.
 *
 * Durations are read from the container metadata (ISO-BMFF `mvhd` for
 * MP4/MOV, Matroska `Info/Duration` for WebM/MKV) rather than trusting any
 * value the browser reports. A file whose duration cannot be determined is
 * rejected — the 30-second limit must fail closed, not open.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_VIDEO_BYTES = 30 * 1024 * 1024; // 30 MB
export const MAX_VIDEO_SECONDS = 30;

/**
 * Serves a stored video buffer with HTTP byte-range support.
 *
 * iOS Safari refuses to play any video that does not answer Range requests
 * with 206 Partial Content, and Android Chrome commonly fails the same way —
 * a plain 200 with the whole body is not enough.
 */
export function serveVideoBuffer(
  bytes: Uint8Array,
  contentType: string,
  filename: string,
  req: Request,
): Response {
  const safeName = (filename || "video.mp4").replace(/"/g, "");
  const size = bytes.byteLength;
  const baseHeaders: Record<string, string> = {
    "Content-Type": contentType || "video/mp4",
    "Content-Disposition": `inline; filename="${safeName}"`,
    "Accept-Ranges": "bytes",
  };

  const rangeHeader = req.headers.get("range");
  const match = rangeHeader ? /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim()) : null;

  if (!match || (!match[1] && !match[2])) {
    return new Response(Buffer.from(bytes), {
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  }

  const start = match[1] ? Number(match[1]) : 0;
  let end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    return new Response(null, {
      status: 416,
      headers: { "Content-Range": `bytes */${size}` },
    });
  }
  end = Math.min(end, size - 1);
  const chunk = bytes.subarray(start, end + 1);
  return new Response(Buffer.from(chunk), {
    status: 206,
    headers: {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(chunk.byteLength),
    },
  });
}

const TEXT = new TextDecoder("latin1");

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return TEXT.decode(bytes.subarray(offset, offset + length));
}

/** Reads a big-endian unsigned integer of 1–8 bytes. */
function readUint(bytes: Uint8Array, offset: number, length: number): number {
  let value = 0;
  for (let index = 0; index < length; index += 1) {
    value = value * 256 + (bytes[offset + index] ?? 0);
  }
  return value;
}

function looksLikeMp4(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const brand = ascii(bytes, 4, 4);
  return (
    brand === "ftyp" ||
    brand === "moov" ||
    brand === "free" ||
    brand === "skip" ||
    brand === "wide" ||
    brand === "mdat"
  );
}

function looksLikeMatroska(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

function looksLikeRiff(bytes: Uint8Array): boolean {
  return (
    bytes.length > 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    (ascii(bytes, 8, 4) === "AVI " || ascii(bytes, 8, 4) === "WEBP")
  );
}

function findMp4DurationMs(bytes: Uint8Array): number | null {
  let cursor = 0;
  const end = bytes.length;

  const walk = (start: number, stop: number, depth: number): number | null => {
    if (depth > 6) return null;
    let offset = start;
    while (offset + 8 <= stop) {
      let size = readUint(bytes, offset, 4);
      const type = ascii(bytes, offset + 4, 4);
      let headerSize = 8;
      if (size === 1) {
        if (offset + 16 > stop) return null;
        // 64-bit largesize; values above 2^53 are unusable but still finite.
        size = readUint(bytes, offset + 8, 8);
        headerSize = 16;
      } else if (size === 0) {
        size = stop - offset;
      }
      if (size < headerSize || offset + size > stop) return null;

      const payloadStart = offset + headerSize;
      const payloadEnd = offset + size;

      if (type === "moov" || type === "trak" || type === "mdia" || type === "minf" || type === "stbl") {
        const nested = walk(payloadStart, payloadEnd, depth + 1);
        if (nested !== null) return nested;
      } else if (type === "mvhd") {
        const version = bytes[payloadStart] ?? 0;
        if (version === 1) {
          if (payloadStart + 32 > payloadEnd) return null;
          const timescale = readUint(bytes, payloadStart + 20, 4);
          const duration = readUint(bytes, payloadStart + 24, 8);
          if (timescale > 0) return (duration / timescale) * 1000;
        } else {
          if (payloadStart + 24 > payloadEnd) return null;
          const timescale = readUint(bytes, payloadStart + 12, 4);
          const duration = readUint(bytes, payloadStart + 16, 4);
          if (timescale > 0) return (duration / timescale) * 1000;
        }
        return null;
      }

      offset = payloadEnd;
    }
    return null;
  };

  cursor = 0;
  return walk(cursor, end, 0);
}

/** Decodes an EBML variable-length integer. */
function readEbmlVint(
  bytes: Uint8Array,
  offset: number,
  stripMarker: boolean,
): { value: number; length: number } | null {
  if (offset >= bytes.length) return null;
  const first = bytes[offset]!;
  if (first === 0) return null;
  let length = 1;
  let mask = 0x80;
  while (length <= 8 && (first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  if (length > 8 || offset + length > bytes.length) return null;
  let value = stripMarker ? first & (mask - 1) : first;
  for (let index = 1; index < length; index += 1) {
    value = value * 256 + bytes[offset + index]!;
  }
  return { value, length };
}

function readEbmlFloat(bytes: Uint8Array, offset: number, length: number): number | null {
  if (length !== 4 && length !== 8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset + offset, length);
  return length === 4 ? view.getFloat32(0, false) : view.getFloat64(0, false);
}

function findMatroskaDurationMs(bytes: Uint8Array): number | null {
  let offset = 0;

  const skipElement = (): boolean => {
    const id = readEbmlVint(bytes, offset, false);
    if (!id) return false;
    const size = readEbmlVint(bytes, offset + id.length, true);
    if (!size) return false;
    offset += id.length + size.length + size.value;
    return offset <= bytes.length;
  };

  // EBML header
  if (!skipElement()) return null;

  // Segment
  const segmentId = readEbmlVint(bytes, offset, false);
  if (!segmentId) return null;
  const segmentSize = readEbmlVint(bytes, offset + segmentId.length, true);
  if (!segmentSize) return null;
  let cursor = offset + segmentId.length + segmentSize.length;
  // Unknown-size segment: run to the end of the buffer.
  const segmentEnd =
    segmentSize.value === 0x01ffffffffffffff || cursor + segmentSize.value > bytes.length
      ? bytes.length
      : cursor + segmentSize.value;

  const INFO_ID = 0x1549a966;
  let timecodeScale = 1_000_000; // 1 ms, Matroska default
  let durationUnits: number | null = null;

  while (cursor + 2 < segmentEnd) {
    const id = readEbmlVint(bytes, cursor, false);
    if (!id) return null;
    const size = readEbmlVint(bytes, cursor + id.length, true);
    if (!size) return null;
    const payloadStart = cursor + id.length + size.length;
    const payloadEnd = payloadStart + size.value;
    if (payloadEnd > segmentEnd) return null;

    if (id.value === INFO_ID) {
      let inner = payloadStart;
      while (inner + 2 < payloadEnd) {
        const innerId = readEbmlVint(bytes, inner, false);
        if (!innerId) break;
        const innerSize = readEbmlVint(bytes, inner + innerId.length, true);
        if (!innerSize) break;
        const innerPayload = inner + innerId.length + innerSize.length;
        if (innerId.value === 0x2ad7b1) {
          timecodeScale = readUint(bytes, innerPayload, innerSize.value) || timecodeScale;
        } else if (innerId.value === 0x4489) {
          durationUnits = readEbmlFloat(bytes, innerPayload, innerSize.value);
        }
        inner = innerPayload + innerSize.value;
      }
      break;
    }

    cursor = payloadEnd;
  }

  if (durationUnits === null) return null;
  return (durationUnits * timecodeScale) / 1_000_000;
}

export type VideoProbe = {
  durationMs: number | null;
  container: "mp4" | "matroska" | "riff" | "unknown";
};

/** Reads the real duration of a video buffer, or null when undeterminable. */
export function probeVideo(bytes: Uint8Array): VideoProbe {
  if (looksLikeMp4(bytes)) {
    return { durationMs: findMp4DurationMs(bytes), container: "mp4" };
  }
  if (looksLikeMatroska(bytes)) {
    return { durationMs: findMatroskaDurationMs(bytes), container: "matroska" };
  }
  if (looksLikeRiff(bytes)) {
    // AVI duration lives in the `avih` LIST; not supported for 30s caps.
    return { durationMs: null, container: "riff" };
  }
  return { durationMs: null, container: "unknown" };
}

const VIDEO_MIME_RE = /^(video\/(mp4|webm|quicktime|x-m4v))$/i;
const VIDEO_EXT_RE = /\.(mp4|m4v|mov|webm|mkv)$/i;

export function looksLikeVideo(file: File, bytes: Uint8Array): boolean {
  if (VIDEO_MIME_RE.test(file.type)) return true;
  if (VIDEO_EXT_RE.test(file.name || "")) return true;
  return looksLikeMp4(bytes) || looksLikeMatroska(bytes);
}

export type VideoValidation =
  | { ok: true; durationMs: number; container: VideoProbe["container"] }
  | { ok: false; message: string };

/**
 * Full server-side gate for an uploaded campaign video: real bytes, size
 * limit, container sniff, then a hard 30-second duration ceiling.
 */
export function validateCampaignVideo(file: File | null | undefined): Promise<VideoValidation> {
  return (async () => {
    if (!file || typeof file === "string") return { ok: false, message: "No video file received." };
    if (file.size === 0) return { ok: false, message: "The video file is empty." };
    if (file.size > MAX_VIDEO_BYTES) {
      return {
        ok: false,
        message: `Video is too large. The limit is ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB.`,
      };
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!looksLikeVideo(file, bytes)) {
      return { ok: false, message: "Unsupported video format. Use MP4, MOV or WebM." };
    }

    const probe = probeVideo(bytes);
    if (probe.durationMs === null || !Number.isFinite(probe.durationMs)) {
      return {
        ok: false,
        message:
          "The video duration could not be read from its metadata. Re-encode it as MP4 and upload again.",
      };
    }
    if (probe.durationMs > MAX_VIDEO_SECONDS * 1000) {
      const seconds = (probe.durationMs / 1000).toFixed(1);
      return {
        ok: false,
        message: `Campaign videos must be ${MAX_VIDEO_SECONDS} seconds or shorter — this one is ${seconds}s.`,
      };
    }
    return { ok: true, durationMs: probe.durationMs, container: probe.container };
  })();
}
