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
 * A fetch handler only has to EXIST for the older Android "installable WebAPK"
 * heuristic — it must never call respondWith. The moment this worker answers a
 * navigation (even by re-issuing the identical request) the browser is locked
 * to that promise, so any transient fetch rejection becomes a dead, blank
 * navigation with no native fallback. In a standalone PWA that looks exactly
 * like a button that "does nothing". So this handler intentionally does not
 * intercept anything: every request goes straight to the browser.
 */
self.addEventListener("fetch", () => {});

/*
 * The open chat tab tells the worker which conversation is on screen right now
 * (refreshed on a heartbeat). A `push` for that same conversation is then
 * dropped instead of shown — you do not get pinged for a message you are
 * already looking at, exactly like WhatsApp.
 */
let activeConversation = { id: null, at: 0 };

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "itq-active-conversation") {
    activeConversation = {
      id: typeof data.conversationId === "string" ? data.conversationId : null,
      at: typeof data.at === "number" ? data.at : Date.now(),
    };
  }
});

async function isViewingConversation(conversationId) {
  if (activeConversation.id === conversationId && Date.now() - activeConversation.at < 90000) {
    return true;
  }
  try {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    return windows.some((client) => {
      if (client.visibilityState !== "visible") return false;
      try {
        const url = new URL(client.url);
        return (
          url.searchParams.get("conversation") === conversationId &&
          /\/(student|admin)\/support$/u.test(url.pathname)
        );
      } catch (error) {
        return false;
      }
    });
  } catch (error) {
    return false;
  }
}

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
  const conversationId = typeof payload.conversationId === "string" ? payload.conversationId : "";
  event.waitUntil(
    (async () => {
      if (payload.kind === "MESSAGE_RECEIVED" && conversationId) {
        if (await isViewingConversation(conversationId)) {
          const windows = await self.clients.matchAll({
            type: "window",
            includeUncontrolled: true,
          });
          for (const client of windows) {
            client.postMessage({ type: "itq-message", conversationId });
          }
          return;
        }
      }
      await self.registration.showNotification(title, options);
    })(),
  );
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
