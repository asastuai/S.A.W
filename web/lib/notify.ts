"use client";

// Dependency-free alert primitives for agent events.
//
// Web Audio for a subtle chime + the browser Notification API for a
// native, OS-level alert. This is the "buzz in your pocket" the vision
// notes promised — built on web primitives that work on desktop and on
// an installed PWA, with no Knock / push-service infra required. When
// server-side dispatch lands (Privy delegated wallets) these same calls
// move behind a service-worker push; the call sites do not change.

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const AC =
        (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * A short rising two-note chime (A5 -> E6). Best-effort: silently no-ops
 * if Web Audio is unavailable or the context is still locked by autoplay
 * policy (call once from a user gesture to unlock it).
 */
export function playPing() {
  const ac = ctx();
  if (!ac) return;
  try {
    if (ac.state === "suspended") void ac.resume();
    const start = ac.currentTime;
    const notes = [880, 1320];
    notes.forEach((freq, i) => {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = start + i * 0.09;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  } catch {
    /* audio is best-effort */
  }
}

export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  if (!notifySupported()) return "unsupported";
  return Notification.permission;
}

/** Ask once for OS notification permission. Must be called from a gesture. */
export async function requestNotifyPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (!notifySupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Fire an OS notification if the handler granted permission. No-op otherwise. */
export function notify(title: string, body?: string) {
  if (!notifySupported() || Notification.permission !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      tag: "saw-agent",
      // Re-alert even if a prior notification with this tag is on screen.
      renotify: true,
    } as NotificationOptions);
    n.onclick = () => {
      try {
        window.focus();
        n.close();
      } catch {
        /* ignore */
      }
    };
  } catch {
    /* notifications are best-effort */
  }
}

/** Sound + OS notification in one call — the "Robinhood alert". */
export function alertEvent(title: string, body?: string) {
  playPing();
  notify(title, body);
}
