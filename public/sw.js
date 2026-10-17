/* NexVote service worker: Web Push display, safe notification-click routing,
 * and an offline fallback for visited pages. Plain JS because files under
 * public/ are not compiled by Next.js. */

const SHELL_CACHE = "nexvote-shell-v1";

const SAFE_PREFIXES = [
  "/elections",
  "/vote/",
  "/results",
  "/compaigns",
  "/dashboard",
  "/profile",
  "/officer/",
  "/admin/",
  "/notifications",
  "/otp-verification",
];

function isSafeUrl(raw) {
  if (!raw || typeof raw !== "string") return false;
  let url;
  try {
    url = new URL(raw, self.location.origin);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/") return true;
  return SAFE_PREFIXES.some((prefix) =>
    prefix.endsWith("/")
      ? url.pathname.startsWith(prefix)
      : url.pathname === prefix || url.pathname.startsWith(prefix + "/"),
  );
}

// Take over promptly after an update: the offline fallback must not sit in
// "waiting" behind a stale tab.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Offline fallback: navigations are network-first with a cached fallback;
 * hashed build assets are cache-first. API calls and Next.js RSC payloads
 * always go to the network so no stale or cross-account data is served.
 */
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const response = await fetch(request);
          // Only clean HTML is worth caching: an error page must not become
          // the offline experience for this URL.
          const type = response.headers.get("Content-Type") || "";
          if (response.ok && type.includes("text/html")) {
            try {
              await cache.put(request, response.clone());
            } catch {
              /* caching is best-effort */
            }
          }
          return response;
        } catch {
          const cached =
            (await cache.match(request)) ||
            (await cache.match(request, { ignoreSearch: true })) ||
            (await cache.match("/"));
          if (cached) return cached;
          return new Response(
            "<!doctype html><title>Offline</title><p>You are offline. Reconnect and reload this page.</p>",
            { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          try {
            await cache.put(request, response.clone());
          } catch {
            /* caching is best-effort */
          }
        }
        return response;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    try {
      payload = event.data ? { body: event.data.text() } : {};
    } catch {
      payload = {};
    }
  }

  const title =
    typeof payload.title === "string" && payload.title.trim()
      ? payload.title.trim().slice(0, 180)
      : "NexVote";
  const body =
    typeof payload.body === "string" ? payload.body.trim().slice(0, 1000) : "";
  const tag =
    typeof payload.tag === "string" && payload.tag
      ? payload.tag.slice(0, 80)
      : "nexvote";
  const icon =
    typeof payload.icon === "string" && payload.icon ? payload.icon : "/icon.svg";
  const badge = typeof payload.badge === "string" && payload.badge ? payload.badge : "/icon-maskable.svg";
  const url = isSafeUrl(payload.url) ? payload.url : "/";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      icon,
      badge,
      data: { url },
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = event.notification.data && event.notification.data.url;
  const target = isSafeUrl(raw) ? raw : "/";

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* navigation may be rejected on some browsers; focus is enough */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

self.addEventListener("notificationclose", () => {
  /* No-op: read state is owned by the API, never inferred from OS dismissal. */
});
