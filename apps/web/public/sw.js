/*
 * ITQANAK service worker — notifications only.
 *
 * Deliberately does NOT cache pages or assets: the app is served no-store and
 * we never want a stale build. Its only job is to show a system notification
 * when a Web Push message arrives and to open the right page when it is tapped.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/*
 * A fetch handler is required for the app to be installable on Android
 * (a real WebAPK, not just a shortcut). It caches nothing: only top-level
 * navigations are served, straight from the network.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }
  const title = payload.title || "إتقانك";
  const options = {
    body: payload.body || "",
    icon: "/install-icon-192",
    badge: "/install-icon-192",
    dir: "rtl",
    lang: "ar",
    tag: payload.tag || "itqanak",
    renotify: true,
    data: { url: payload.url || "/ar/student" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/ar/student";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin && "focus" in client) {
            client.navigate(targetUrl);
            return client.focus();
          }
        } catch (error) {
          /* ignore malformed client URLs */
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
