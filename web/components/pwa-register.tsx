"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once on mount. Silent on unsupported
 * browsers. Closed-tab push comes in a later release; foreground alerts
 * already ship via lib/notify.ts.
 */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js")
      .catch((e) => console.warn("[pwa] sw register failed", e));
  }, []);
  return null;
}
