/* NexVote service worker: Web Push display + safe notification-click routing.
 * Plain JS because files under public/ are not compiled by Next.js. */

const SAFE_PREFIXES = [
  "/",
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
  return SAFE_PREFIXES.some(
    (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix),
  );
}

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
