/**
 * Fallback IANA timezone for display and for interpreting naive datetimes.
 * Elections carry their own `timezone`; this only applies when no zone is
 * supplied (categories, votes without an election, legacy admin input).
 */
export const DEFAULT_TIME_ZONE = "Africa/Nairobi";

// ISO datetime regex: date required, time optional (T or space separator),
// fraction up to 12 digits (6 stored), tzinfo Z|±HH|±HHMM|±HH:MM.
const DATETIME_RE =
  /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,12}))?)?(Z|z|[+-]\d{2}(?::?\d{2})?)?)?$/;

/**
 * Parses an ISO datetime. Naive strings (no zone suffix) are interpreted as
 * UTC; aware strings keep their instant. Anything the regex rejects yields
 * null. The admin UI always submits `toISOString()`, so naive input only
 * arrives from legacy/external callers.
 */
export function parseDateTime(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = DATETIME_RE.exec(trimmed);
  if (!match) {
    return null;
  }

  const [, y, mo, d, h, mi, s, frac, tz] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = h === undefined ? 0 : Number(h);
  const minute = mi === undefined ? 0 : Number(mi);
  const second = s === undefined ? 0 : Number(s);
  const ms = frac === undefined ? 0 : Number((frac + "000").slice(0, 3));

  if (hour > 23 || minute > 59 || second > 59) return null;

  let offsetMinutes = 0;
  if (tz !== undefined && tz !== "Z" && tz !== "z") {
    const sign = tz[0] === "-" ? -1 : 1;
    const digits = tz.slice(1).replace(":", "");
    const offHours = Number(digits.slice(0, 2));
    const offMinutes = digits.length > 2 ? Number(digits.slice(2, 4)) : 0;
    if (offHours > 14 || offMinutes > 59) return null;
    offsetMinutes = sign * (offHours * 60 + offMinutes);
  }

  // Build the UTC instant, then round-trip to reject impossible dates
  // (e.g. 2026-02-30) exactly like Python's datetime constructor does.
  const utcGuess =
    Date.UTC(year, month - 1, day, hour, minute, second, ms) -
    offsetMinutes * 60_000;
  const check = new Date(utcGuess);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  ) {
    return null;
  }
  if (year < 1 || year > 9999) return null;
  return check;
}

/** Renders the zone's UTC offset at `date` as `+HH:MM` / `-HH:MM`. */
function offsetLabel(timeZone: string, date: Date): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const offset = name.replace("GMT", "");
  return offset || "+00:00";
}

/**
 * Renders an instant as wall-clock time in `timeZone` (IANA), with a numeric
 * offset and six-digit microseconds only when they are non-zero. Falls back to
 * `DEFAULT_TIME_ZONE` when no zone is supplied.
 */
export function formatDateTime(
  value: Date | null | undefined,
  timeZone: string = DEFAULT_TIME_ZONE,
): string | null {
  if (!value || Number.isNaN(value.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  const base =
    `${get("year")}-${get("month")}-${get("day")}` +
    `T${get("hour")}:${get("minute")}:${get("second")}`;
  const microseconds = value.getUTCMilliseconds() * 1000;
  const fraction = microseconds ? `.${String(microseconds).padStart(6, "0")}` : "";
  return `${base}${fraction}${offsetLabel(timeZone, value)}`;
}

export function secondsUntil(target: Date | null | undefined, now = new Date()): number {
  if (!target) return 0;
  return Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000));
}

export const DATETIME_FORMAT_ERROR =
  "Datetime has wrong format. Use one of these formats instead: YYYY-MM-DDThh:mm[:ss[.uuuuuu]][+HH:MM|-HH:MM|Z].";
