/**
 * Wire shape shared by every endpoint that hands a notification to a client
 * (the list/detail API and the real-time event stream), so the browser can
 * treat both sources identically.
 */

export type NotificationSourceRow = {
  id: number;
  title: string;
  body: string;
  category: string;
  targetUrl: string;
  tag: string;
  createdAt: Date;
  readAt: Date | null;
};

export function serializeNotification(notification: NotificationSourceRow) {
  return {
    id: notification.id,
    title: notification.title,
    body: notification.body,
    category: notification.category,
    target_url: notification.targetUrl,
    tag: notification.tag,
    created_at: notification.createdAt.toISOString(),
    is_read: notification.readAt !== null,
    read_at: notification.readAt?.toISOString() ?? null,
  };
}
