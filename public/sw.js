/* eslint-disable no-undef */
/**
 * DayFlow AI service worker.
 *
 * Scope is deliberately narrow: receive push messages, show notifications, and
 * route clicks. There is no offline caching of application shell or data.
 *
 * That is a decision, not an omission. Caching a time tracker's data offline
 * means serving a stale queue - and a user who closes an activity against a
 * cached view, on a device that has not synced, produces a Moment with a wrong
 * end time and no way to know it. Being honestly unavailable beats being
 * confidently wrong. See docs/04-architecture/23-system-architecture.md.
 */

const NOTIFICATION_ICON = "/icons/icon-192.png";

self.addEventListener("install", () => {
  // Activate immediately rather than waiting for every tab to close. A user who
  // just granted notification permission expects the next reminder to arrive.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "DayFlow AI", body: event.data.text() };
  }

  const options = {
    body: payload.body,
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_ICON,
    // Replaces any earlier notification with the same tag rather than stacking.
    // Six queued reminders about one activity is how a user arrives at revoking
    // permission entirely.
    tag: payload.tag || "dayflow",
    renotify: false,
    requireInteraction: false,
    data: { url: payload.url || "/dashboard", ...(payload.data || {}) },
    actions: payload.actions || [],
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let target = data.url || "/dashboard";

  // The "close it now" action deep links to the Moment with the dialog already
  // open, so acting on a reminder is one tap rather than a hunt.
  if (event.action === "close-moment" && data.momentId) {
    target = `/dashboard?close=${data.momentId}`;
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        // Reuse an existing tab where possible. Opening a fourth DayFlow tab
        // because the user tapped a third reminder is its own kind of annoying.
        for (const client of clientList) {
          if ("focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});

self.addEventListener("pushsubscriptionchange", (event) => {
  // The browser rotated the subscription. Re-register with the new endpoint, or
  // this device silently stops receiving anything.
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription ? event.oldSubscription.options : undefined)
      .then((subscription) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(subscription),
        }),
      )
      .catch(() => {
        // Nothing useful to do here. The client re-subscribes on next load.
      }),
  );
});
