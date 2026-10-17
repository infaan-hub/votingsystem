import { ApiError, fieldErrors } from "@/src/lib/http";

export type Payload = Record<string, unknown>;

/**
 * Parses a request body: JSON bodies become objects and
 * multipart/urlencoded bodies become an object where later values win for a
 * given key (QueryDict semantics) and file parts stay as File instances.
 */
export async function readPayload(req: Request): Promise<Payload> {
  const contentType = (req.headers.get("content-type") || "").toLowerCase();

  if (!contentType) {
    return {};
  }

  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const payload: Payload = {};
      for (const [key, value] of form.entries()) {
        payload[key] = value;
      }
      return payload;
    } catch {
      return {};
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    try {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const payload: Payload = {};
      for (const [key, value] of params.entries()) {
        payload[key] = value;
      }
      return payload;
    } catch {
      return {};
    }
  }

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    let raw: string;
    try {
      raw = await req.text();
    } catch {
      raw = "";
    }
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unexpected end of JSON input.";
      throw new ApiError(400, { detail: `JSON parse error - ${message}` });
    }
    // A JSON `null` body fails validation before any
    // serializer logic, surfacing as a top-level list error.
    if (data === null) {
      throw new ApiError(400, ["This field may not be null."]);
    }
    if (data !== undefined && typeof data === "object" && !Array.isArray(data)) {
      return data as Payload;
    }
    throw new ApiError(400, {
      non_field_errors: [
        `Invalid data. Expected a dictionary, but got ${pythonTypeName(data)}.`,
      ],
    });
  }

  // 415 `Unsupported media type "<media_type>" in request.`
  throw new ApiError(415, {
    detail: `Unsupported media type "${contentType.split(";")[0].trim()}" in request.`,
  });
}

function pythonTypeName(value: unknown): string {
  if (Array.isArray(value)) return "list";
  if (typeof value === "string") return "str";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  return "NoneType";
}

export function hasKey(payload: Payload, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(payload, key);
}

export function stringValue(payload: Payload, key: string): string {
  const value = payload[key];
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

export function optionalString(payload: Payload, key: string): string | undefined {
  if (!hasKey(payload, key)) return undefined;
  const raw = payload[key];
  if (raw === null) {
    throw fieldErrors({ [key]: "This field may not be null." });
  }
  if (typeof raw === "object") {
    throw fieldErrors({ [key]: "Not a valid string." });
  }
  return stringValue(payload, key);
}
