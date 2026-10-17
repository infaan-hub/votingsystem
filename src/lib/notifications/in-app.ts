/**
 * In-app notification channel.
 *
 * Web Push informs a user whose app is closed or in the background; this
 * module backs the complementary in-app side: while a tab is visible the
 * client watches for fresh notifications and surfaces them inside the app
 * (toast + bell refresh) within seconds of the event. Both channels fire for
 * every notification — push is never suppressed while the app is open — so a
 * user is reached whether they are inside the app or not, even when they never
 * granted the OS notification permission.
 *
 * The cursor is kept in localStorage (per browser, per account) so an alert
 * that arrived while the app was closed is still announced in-app when the
 * user comes back, while a brand-new browser never toasts the existing
 * backlog.
 */

export const IN_APP_NOTIFICATION_EVENT = "nexvote:notifications";
const NOTIFICATION_CURSOR_KEY = "nexvote-notif-cursor";

function storageKey(userId: number): string {
  return `${NOTIFICATION_CURSOR_KEY}-u${userId}`;
}

/** Highest notification id this browser has already surfaced, or null. */
export function readNotificationCursor(userId: number): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return null;
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function writeNotificationCursor(userId: number, id: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), String(id));
  } catch {
    /* storage disabled: a reload may repeat an alert */
  }
}

/**
 * Unread rows that arrived after `cursor`, newest first, capped for display.
 * With no stored cursor (first visit in this browser) nothing counts as new.
 * Rows already read on another device are skipped — the bell still lists them.
 */
export function pickFreshNotifications<T extends { id: number; is_read: boolean }>(
  rows: T[],
  cursor: number | null,
  limit: number,
): T[] {
  if (cursor === null) return [];
  return rows.filter((row) => row.id > cursor && !row.is_read).slice(0, limit);
}
