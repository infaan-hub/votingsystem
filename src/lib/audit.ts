import { prisma } from "@/src/lib/db";

export type AuditInput = {
  actorId?: number | null;
  /** Dotted verb, e.g. `admin.officer.create`, `election.publish`. */
  action: string;
  entityType?: string;
  entityId?: string | number;
  summary?: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
};

/**
 * Keys that must never reach the audit table. Redaction happens before the
 * row is written, so a caller cannot leak a password or ballot by accident.
 */
const SENSITIVE_KEY_RE =
  /password|passwd|token|secret|authorization|receipt|ballot|selection|choice|id_number|identifier_hash/i;

function sanitize(detail: Record<string, unknown> | undefined): string {
  if (!detail) return "{}";
  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 4) return "[truncated]";
    if (Array.isArray(value)) return value.slice(0, 50).map((entry) => walk(entry, depth + 1));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        out[key] = SENSITIVE_KEY_RE.test(key) ? "[redacted]" : walk(entry, depth + 1);
      }
      return out;
    }
    if (typeof value === "string" && value.length > 500) return `${value.slice(0, 500)}…`;
    return value;
  };
  try {
    return JSON.stringify(walk(detail, 0));
  } catch {
    return "{}";
  }
}

/** Best-effort caller IP. Never throws. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim().slice(0, 64);
  return (req.headers.get("x-real-ip") || "").slice(0, 64);
}

/**
 * Append-only audit write. Failures are logged but never bubble: an audit
 * miss must not roll back the business operation that triggered it.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType ?? "",
        entityId: input.entityId === undefined ? "" : String(input.entityId),
        summary: (input.summary ?? "").slice(0, 300),
        detail: sanitize(input.detail),
        ipAddress: (input.ipAddress ?? "").slice(0, 64),
      },
    });
  } catch (error) {
    console.error("audit log write failed:", error);
  }
}
