import type {
  NotificationRow,
  NotificationSupport,
  NotifyOptions,
  NotifyResult,
  PushSubscriptionPayload,
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
  // iOS/iPadOS: Web Push exists only inside an installed Home Screen web app,
  // and outside one the Push API is not exposed at all. This must run BEFORE
  // the capability test — otherwise iPhone users are told their browser is
  // unsupported instead of being shown the fix (install, then enable).
  if (isIos && !isStandalone) {
    return {
      ...base,
      status: "requires-home-screen-install",
      detail:
        "On iPhone and iPad, NexVote must be installed to your Home Screen: tap the Share button in Safari, choose “Add to Home Screen”, then open NexVote from its icon and turn notifications on there.",
    };
  }
  if (!serviceWorker || !push || !notifications) {
    return {
      ...base,
      status: "unsupported",
      detail: "This browser does not support the Service Worker, Push, or Notification APIs.",
    };
  }
  if (permission === "denied") {
    return {
      ...base,
      status: "permission-denied",
      detail: isIos
        ? "Notifications are blocked for the installed NexVote app. Open Settings > Notifications, allow NexVote, then open the app again."
        : "Notifications are blocked. Allow them in your browser or system settings for this site.",
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
  // updateViaCache: "none" — the SW script itself must bypass the HTTP cache,
  // otherwise a stale sw.js can keep receiving pushes after a deploy.
  return navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" });
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
 * Creates (or reuses) this browser's Push API subscription WITHOUT contacting
 * the server. A sign-in can hand the payload straight to the login request so
 * an account's first device receives its login code on the device asking for
 * it. Returns null whenever the browser cannot subscribe (no permission, iOS
 * without Home Screen install, missing APIs).
 */
export async function createBrowserPushSubscription(): Promise<PushSubscriptionPayload | null> {
  const support = getNotificationSupport();
  if (support.status === "unsupported" || support.status === "requires-home-screen-install") {
    return null;
  }
  if (
    !isBrowser() ||
    !("Notification" in window) ||
    // Only a hard block stops the attempt: some browsers report a stale
    // "default" right after a granted request, and pushManager.subscribe
    // itself fails (caught below) when permission truly is not granted.
    Notification.permission === "denied"
  ) {
    return null;
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
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
    return {
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      expirationTime: json.expirationTime ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Sign-in / onboarding device check. Call from a user-gesture handler (the
 * only place browsers open a permission dialog): asks for notification
 * permission when it has never been decided, then returns this browser's push
 * subscription, creating it when missing. Returns null when the device cannot
 * receive notifications right now.
 */
export async function prepareNotificationDevice(): Promise<PushSubscriptionPayload | null> {
  const support = getNotificationSupport();
  if (support.status === "permission-required" || support.status === "supported") {
    try {
      await requestNotificationPermission();
    } catch {
      // Some browsers reject the request when the gesture context is lost —
      // sign-in must continue without a device subscription.
      return null;
    }
  }
  return createBrowserPushSubscription();
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

  const payload = await createBrowserPushSubscription();
  if (!payload) {
    return { ok: false, reason: "Could not create a push subscription on this device." };
  }

  try {
    const response = await fetch(SUBSCRIBE_PATH, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(payload),
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

/** SHA-256 hex fingerprint, matching the server's GET-list `endpoint_hash`. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Fingerprint of this browser's current endpoint, or null when it has none. */
async function currentEndpointHash(): Promise<string | null> {
  if (!isBrowser() || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.getRegistration(SW_URL);
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return null;
    if (!globalThis.crypto?.subtle) return null;
    return (await sha256Hex(subscription.endpoint)).slice(0, 32);
  } catch {
    return null;
  }
}

export type OwnPushSubscription = {
  id: number;
  endpoint_hash: string;
  user_agent: string;
  created_at: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  is_disabled: boolean;
};

/** The signed-in account's registered devices (endpoints stay hashed server-side). */
export async function fetchOwnPushSubscriptions(token: string): Promise<OwnPushSubscription[]> {
  const response = await fetch(SUBSCRIBE_PATH, {
    headers: authHeaders(token),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Could not load your notification devices.");
  const data = (await response.json()) as unknown;
  return Array.isArray(data) ? (data as OwnPushSubscription[]) : [];
}

/**
 * True when THIS browser's push subscription is registered to the signed-in
 * account — the state in which login codes (OTP) and alerts actually reach
 * this device. A browser subscription still owned by another account (shared
 * device, account switch) reports false so the UI offers to claim it.
 */
export async function hasRegisteredPushSubscription(token: string): Promise<boolean> {
  const hash = await currentEndpointHash();
  if (hash === null) return false;
  try {
    const rows = await fetchOwnPushSubscriptions(token);
    return rows.some((row) => row.endpoint_hash === hash && !row.is_disabled);
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
  const response = await fetch(`${NOTIFICATIONS_PATH}/${id}/read`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error("Could not mark the notification as read.");
}

export async function markAllNotificationsRead(token: string): Promise<void> {
  const response = await fetch(`${NOTIFICATIONS_PATH}/read-all`, {
    method: "POST",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error("Could not mark the notifications as read.");
}

export async function deleteNotification(token: string, id: number): Promise<void> {
  const response = await fetch(`${NOTIFICATIONS_PATH}/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  if (!response.ok) throw new Error("Could not delete the notification.");
}
