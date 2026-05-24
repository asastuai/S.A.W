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

// B-1 hardening: allowlist the URL we'll navigate to so a compromised
// push payload can't redirect users to a phishing page. Same-origin
// paths + our Telegram bot deep-link are accepted; anything else falls
// back to the canonical /demo route. Push isn't wired in v1.3 yet, so
// this is defense-before-feature.
const URL_ALLOWLIST = [
  "https://saw-gilt.vercel.app",
  "https://t.me",
];

function safeNotificationUrl(raw) {
  if (typeof raw !== "string" || !raw) return "/demo";
  // Relative paths are same-origin by definition — accept.
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw);
    const base = `${u.protocol}//${u.host}`;
    return URL_ALLOWLIST.includes(base) ? raw : "/demo";
  } catch {
    return "/demo";
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = safeNotificationUrl(event.notification.data?.url);
  event.waitUntil(self.clients.openWindow(url));
});
