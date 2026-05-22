// SAW PWA service worker (v1) — install + activate only.
// Caching strategy is intentionally minimal in v1 — Next.js handles asset
// caching well enough at the CDN. Web push registration lands in v1.3
// when we wire VAPID keys + notification permission UX.

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Stub for future push handler:
self.addEventListener("push", (event) => {
  if (!event.data) return;
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title ?? "SAW", {
      body: data.body ?? "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: data.url ? { url: data.url } : undefined,
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/demo";
  event.waitUntil(self.clients.openWindow(url));
});
