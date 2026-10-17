/**
 * Notification target URLs must stay inside this application. Only relative
 * same-origin paths are accepted — protocol-relative (`//evil.com`) and
 * absolute external URLs are rejected to prevent open redirects from the
 * notification-click handler.
 */
export function safeTargetUrl(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === "") return "";
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  // Must start with a single slash and not be protocol-relative or absolute.
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  // Reject backslashes and control characters that some browsers normalize
  // into a different origin.
  if (/[\\\u0000-\u001f]/.test(trimmed)) return null;
  return trimmed;
}
