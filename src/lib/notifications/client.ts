import type {
  NotificationRow,
  NotificationSupport,
  NotifyOptions,
  NotifyResult,
} from "@/src/lib/notifications/types";

/**
 * Client Web Push helpers. Every function guards on browser availability so
 * this module is safe to import from client components without touching
 * `window` during server rendering.
 *
 * Local `Notification` display and remote Web Push are different mechanisms:
 * `notify()` persists through the API (which queues push to every subscribed
 * device) and only shows a local notification when the tab is visible, using
 * the same tag as the push payload so the two do not double up.
 */

const SW_URL = "/sw.js";
const SUBSCRIBE_PATH = "/api/notifications/subscribe";
const NOTIFICATIONS_PATH = "/api/notifications";

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json",
  };
}

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof navigator !== "undefined";
}

function detectIos(): boolean {
  if (!isBrowser()) return false;
  const ua = navigator.userAgent || "";
  // iPadOS 13+ reports as Macintosh but exposes touch points.
  const ipad = /iPad/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return /iPhone|iPod/.test(ua) || ipad;
}

/**
 * Capability-based support detection (never browser-name guessing alone).
 */
export function getNotificationSupport(): NotificationSupport {
  if (!isBrowser()) {
    return {
      status: "unsupported",
      secureContext: false,
      serviceWorker: false,
      push: false,
      notifications: false,
      isIos: false,
      isStandalone: false,
      permission: "unsupported",
      detail: "Notifications require a browser.",
    };
  }

  const secureContext = window.isSecureContext;
  const serviceWorker = "serviceWorker" in navigator;
  const push = "PushManager" in window;
  const notifications = "Notification" in window;
  const permission: NotificationPermission | "unsupported" = notifications
    ? Notification.permission
    : "unsupported";
  const isIos = detectIos();
  const isStandalone =
    // iOS Safari exposes navigator.standalone; other browsers use display-mode.
    (navigator as unknown as { standalone?: boolean }).standalone === true ||
    window.matchMedia?.("(display-mode: standalone)").matches === true;

  const base = { secureContext, serviceWorker, push, notifications, isIos, isStandalone, permission };

  if (!secureContext) {
    return {
      ...base,
      status: "unsupported",
      detail: "Notifications require HTTPS (or localhost during development).",
    };
  }
  if (!serviceWorker || !push || !notifications) {
    return {
      ...base,
      status: "unsupported",
      detail: "This browser does not support the Service Worker, Push, or Notification APIs.",
    };
  }
  if (isIos && !isStandalone) {
    return {
      ...base,
      status: "requires-home-screen-install",
      detail:
        "On iPhone and iPad, open the Share menu and choose “Add to Home Screen”, then enable notifications from the installed app.",
    };
  }
  if (permission === "denied") {
    return {
      ...base,
      status: "permission-denied",
      detail: "Notifications are blocked. Allow them in your browser or system settings for this site.",
    };
  }
  if (permission === "granted") {
    return { ...base, status: "supported", detail: "Notifications are enabled for this browser." };
  }
  return {
    ...base,
    status: "permission-required",
    detail: "Choose Enable notifications to allow election alerts on this device.",
  };
}

/** Registers /sw.js once and returns the registration. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!isBrowser() || !("serviceWorker" in navigator)) {
    throw new Error("Service workers are not supported in this browser.");
  }
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

/** Deliberate, user-gesture-only permission request. Never auto-prompted. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isBrowser() || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const output = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function vapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) {
    throw new Error(
      "NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured; Web Push cannot be enabled.",
    );
  }
  return key;
}

/**
 * Full enable flow: permission → service worker → Push subscription →
 * server registration. Call only from a user gesture.
 */
export async function subscribeToPush(token: string): Promise<{ ok: boolean; reason?: string }> {
  const support = getNotificationSupport();
  if (support.status === "unsupported" || support.status === "requires-home-screen-install") {
    return { ok: false, reason: support.detail };
  }
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason:
        permission === "denied"
          ? "Permission was blocked. Enable notifications for this site in your browser settings, then try again."
          : "Permission was not granted.",
    };
  }

  try {
    const registration = await registerServiceWorker();
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey()),
      }));
    const json = subscription.toJSON();
    const response = await fetch(SUBSCRIBE_PATH, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
        expirationTime: json.expirationTime ?? null,
      }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { detail?: string } | null;
      return { ok: false, reason: data?.detail ?? "The server rejected this subscription." };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Could not subscribe this device.",
    };
  }
}

/** Removes the current device subscription from the browser and the server. */
export async function unsubscribeFromPush(token: string): Promise<{ ok: boolean; reason?: string }> {
  if (!isBrowser() || !("serviceWorker" in navigator)) return { ok: false, reason: "Unsupported browser." };
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return { ok: true };
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await fetch(SUBSCRIBE_PATH, {
      method: "DELETE",
      headers: authHeaders(token),
      body: JSON.stringify({ endpoint }),
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "Could not remove this device.",
    };
  }
}

/** True when this exact browser already has an active push subscription. */
export async function hasPushSubscription(): Promise<boolean> {
  if (!isBrowser() || !("serviceWorker" in navigator)) return false;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await registration?.pushManager.getSubscription();
    return Boolean(subscription);
  } catch {
    return false;
  }
}

async function showLocalIfVisible(payload: {
  title: string;
  body?: string;
  tag?: string;
  url?: string;
}): Promise<NotifyResult["localDisplay"]> {
  if (!isBrowser() || !("Notification" in window) || Notification.permission !== "granted") {
    return "unsupported";
  }
  if (document.visibilityState !== "visible") return "skipped";
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const options: NotificationOptions = {
      body: payload.body ?? "",
      tag: payload.tag || "nexvote-local",
      icon: "/icon.svg",
      data: { url: payload.url || "/" },
    };
    if (registration) {
      await registration.showNotification(payload.title, options);
    } else {
      new Notification(payload.title, options);
    }
    return "shown";
  } catch {
    return "failed";
  }
}

/**
 * The reusable notify(): persists the notification through the authenticated
 * API (which queues Web Push to every subscribed device of each recipient)
 * and, when this tab is visible and permission is granted, also shows a local
 * notification with the same tag so the push does not double up.
 *
 * Does NOT request permission — call subscribeToPush() from a user gesture
 * (e.g. the Enable notifications button) first.
 */
export async function notify(token: string, options: NotifyOptions): Promise<NotifyResult> {
  if (!token) return { success: false, reason: "Sign in to send notifications." };
  const title = (options.title ?? "").trim();
  if (!title) return { success: false, reason: "A notification title is required." };

  const tag = options.tag?.trim() || `notify-${Date.now()}`;
  try {
    const response = await fetch(NOTIFICATIONS_PATH, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({
        title,
        body: options.body ?? "",
        target_url: options.url ?? "",
        tag,
        category: options.category ?? "general",
        idempotency_key: options.idempotencyKey ?? "",
        recipient_ids: options.recipientIds ?? [],
      }),
    });
    const data = (await response.json().catch(() => null)) as
      | {
          notification?: NotificationRow | null;
          queued?: number;
          duplicate?: boolean;
          detail?: string;
        }
      | null;
    if (!response.ok) {
      return { success: false, reason: data?.detail ?? "The server rejected this notification." };
    }
    const localDisplay = await showLocalIfVisible({
      title,
      body: options.body,
      tag,
      url: options.url,
    });
    return {
      success: true,
      notificationId: data?.notification?.id,
      pushQueued: data?.queued ?? 0,
      localDisplay,
    };
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Network error while notifying.",
    };
  }
}

export async function fetchNotifications(
  token: string,
  options: { limit?: number; unread?: boolean } = {},
): Promise<NotificationRow[]> {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 50));
  if (options.unread) params.set("unread", "1");
  const response = await fetch(`${NOTIFICATIONS_PATH}?${params.toString()}`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load notifications.");
  return (await response.json()) as NotificationRow[];
}

export async function fetchUnreadCount(token: string): Promise<number> {
  const response = await fetch(`${NOTIFICATIONS_PATH}/unread-count`, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) return 0;
  const data = (await response.json()) as { unread?: number };
  return data.unread ?? 0;
}

export async function markNotificationRead(token: string, id: number): Promise<void> {
  await fetch(`${NOTIFICATIONS_PATH}/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  await fetch(`${NOTIFICATIONS_PATH}/read-all`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function deleteNotification(token: string, id: number): Promise<void> {
  await fetch(`${NOTIFICATIONS_PATH}/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}
