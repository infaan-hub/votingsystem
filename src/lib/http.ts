export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Record<string, string>;

  constructor(
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
    message?: string,
  ) {
    super(message ?? JSON.stringify(body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.headers = headers;
  }
}

export function notFound(): ApiError {
  return new ApiError(404, { detail: "Not found." });
}

/** Not-found message: `No <Object> matches the given query.` */
export function notFoundModel(objectName: string): ApiError {
  return new ApiError(404, {
    detail: `No ${objectName} matches the given query.`,
  });
}

export function unauthenticated(
  detail = "Authentication credentials were not provided.",
): ApiError {
  return new ApiError(401, { detail });
}

export function invalidToken(): ApiError {
  return new ApiError(401, { detail: "Invalid token." });
}

export function forbidden(detail = "You do not have permission to perform this action."): ApiError {
  return new ApiError(403, { detail });
}

export function badRequest(body: unknown): ApiError {
  return new ApiError(400, body);
}

export function serviceUnavailable(detail: string): ApiError {
  return new ApiError(503, { detail });
}

/**
 * Mirrors `serializers.ValidationError` raised from a serializer's `validate()`
 * with a plain string: `{"non_field_errors": ["msg"]}`.
 */
export function tooManyRequests(detail: string): ApiError {
  return new ApiError(429, { detail });
}

export function nonFieldError(detail: string): ApiError {
  return new ApiError(400, { non_field_errors: [detail] });
}

/**
 * Converts `{field: message | string[]}` into the wire shape where every
 * field value is a list of messages.
 */
export function fieldErrors(
  fields: Record<string, string | string[]>,
): ApiError {
  const body: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fields)) {
    body[key] = Array.isArray(value) ? value : [value];
  }
  return new ApiError(400, body);
}

/**
 * Default not-found HTML page, returned when the URL resolver cannot match
 * a segment (e.g. a non-integer pk) — this happens before any handler
 * logic, so it never carries JSON or an `Allow` header.
 */
export function htmlNotFound(): ApiError {
  const body =
    '\n<!doctype html>\n<html lang="en">\n<head>\n  <title>Not Found</title>\n</head>\n<body>\n  <h1>Not Found</h1><p>The requested resource was not found on this server.</p>\n</body>\n</html>\n';
  return new ApiError(
    404,
    body,
    { "Content-Type": "text/html; charset=utf-8" },
  );
}
