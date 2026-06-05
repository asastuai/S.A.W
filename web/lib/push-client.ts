"use client";

const PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!PUBLIC_KEY
  );
}

/**
 * Subscribe this browser to web push and register it with the server.
 * Best-effort: returns false (never throws) when unsupported, when VAPID
 * isn't configured, when no service worker is registered (e.g. dev), or when
 * the user isn't authenticated. Call after the user grants Notification
 * permission.
 */
export async function enablePush(
  getToken: () => Promise<string | null>
): Promise<boolean> {
  if (!pushSupported()) return false;
  try {
    // Bail (don't hang on serviceWorker.ready) if no SW is registered.
    const existing = await navigator.serviceWorker.getRegistration();
    if (!existing) return false;
    const reg = await navigator.serviceWorker.ready;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // cast: TS 5.7 types a fresh Uint8Array as ArrayBufferLike-backed,
        // which doesn't structurally match BufferSource; it's a valid key.
        applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY!) as BufferSource,
      });
    }

    const token = await getToken();
    if (!token) return false;

    const res = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
