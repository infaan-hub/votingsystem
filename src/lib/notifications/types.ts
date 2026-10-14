/**
 * Browser-side notification types shared by the client helpers.
 */

export type NotifyOptions = {
  title: string;
  body?: string;
  /** Same-origin path the notification opens on click. */
  url?: string;
  tag?: string;
  category?: string;
  data?: Record<string, unknown>;
  /**
   * Stable key so retried events never create duplicates. The server also
   * derives one per recipient from this value.
   */
  idempotencyKey?: string;
  /** Recipients; only admins may target others. Defaults to self. */
  recipientIds?: number[];
};

export type NotifyResult = {
  success: boolean;
  notificationId?: number;
  pushQueued?: number;
  localDisplay?: "shown" | "skipped" | "unsupported" | "failed";
  reason?: string;
};

export type NotificationSupportStatus =
  | "supported"
  | "permission-required"
  | "permission-denied"
  | "requires-home-screen-install"
  | "unsupported";

export type NotificationSupport = {
  status: NotificationSupportStatus;
  secureContext: boolean;
  serviceWorker: boolean;
  push: boolean;
  notifications: boolean;
  /** Safari on iOS/iPadOS: Web Push works only for Home Screen web apps. */
  isIos: boolean;
  isStandalone: boolean;
  permission: NotificationPermission | "unsupported";
  detail: string;
};

export type NotificationRow = {
  id: number;
  title: string;
  body: string;
  category: string;
  target_url: string;
  tag: string;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
};
