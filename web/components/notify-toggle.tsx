"use client";

import { useEffect, useState } from "react";
import {
  notifyPermission,
  playPing,
  requestNotifyPermission,
} from "@/lib/notify";

/**
 * A small bell that turns agent alerts on. Tapping it both requests OS
 * notification permission AND plays a test chime — the same gesture
 * unlocks the Web Audio context (browsers block audio until a user
 * interacts), so every later opportunity ping is audible.
 */
export function BellToggle() {
  const [state, setState] = useState<
    NotificationPermission | "unsupported" | null
  >(null);

  useEffect(() => {
    setState(notifyPermission());
  }, []);

  if (state === null) return null; // pre-mount, avoid SSR mismatch
  if (state === "unsupported") return null;

  const granted = state === "granted";
  const denied = state === "denied";

  async function onClick() {
    playPing(); // unlock audio + audible confirmation
    const next = await requestNotifyPermission();
    setState(next);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={denied}
      title={
        granted
          ? "Alerts on — sound + a native notification when your agent spots a move"
          : denied
          ? "Notifications blocked in your browser. Sound still plays."
          : "Turn on alerts — sound + a native notification when your agent spots a move"
      }
      aria-label="Toggle agent alerts"
      className={`text-sm leading-none w-5 h-5 inline-flex items-center justify-center rounded-full border transition ${
        granted
          ? "text-gold border-gold/60 hover:bg-gold hover:text-ink"
          : denied
          ? "text-bone/30 border-bone/20 cursor-not-allowed"
          : "text-bone/50 border-bone/30 hover:text-gold hover:border-gold animate-pulse"
      }`}
    >
      {granted ? "🔔" : "🔕"}
    </button>
  );
}
