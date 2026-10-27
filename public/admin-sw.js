/**
 * EMNA admin service worker: Web Push notifications only (new inquiry, quote accepted / rejected).
 * Registered by Postavke → Obavijesti with scope /admin (components/admin/settings/PushCard.tsx);
 * the messages come from lib/admin/push.ts as JSON { title, body, url, tag }.
 *
 * Deliberately no fetch handler: the admin always loads from the network, nothing is cached.
 */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

/** only our own admin pages may be opened from a notification */
function adminUrl(raw) {
  try {
    const url = new URL(typeof raw === "string" ? raw : "/admin", self.location.origin);
    if (url.origin === self.location.origin && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) return url.href;
  } catch {
    /* fall through */
  }
  return new URL("/admin", self.location.origin).href;
}

/** the number on the home-screen icon = notifications still unread (the admin resets it when opened) */
async function updateBadge() {
  if (!("setAppBadge" in self.navigator)) return;
  try {
    const open = await self.registration.getNotifications();
    if (open.length) await self.navigator.setAppBadge(open.length);
    else await self.navigator.clearAppBadge();
  } catch {
    /* badges are a nicety */
  }
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof data.title === "string" && data.title ? data.title : "EMNA admin";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : undefined;

  event.waitUntil(
    self.registration
      .showNotification(title, {
        body: typeof data.body === "string" ? data.body : "",
        icon: "/admin-icon-192.png",
        lang: "hr",
        tag,
        // the same inquiry or quote again replaces the old notice, but still alerts
        renotify: Boolean(tag),
        data: { url: adminUrl(data.url) },
      })
      .then(updateBadge),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = adminUrl(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).pathname.startsWith("/admin"));
      if (open) {
        try {
          await open.focus();
          // navigate() works only for pages this worker controls (scope /admin, the dashboard included)
          await open.navigate(url);
          return updateBadge();
        } catch {
          /* fall through to a new window */
        }
      }
      await self.clients.openWindow(url);
      return updateBadge();
    })(),
  );
});

self.addEventListener("notificationclose", (event) => event.waitUntil(updateBadge()));
