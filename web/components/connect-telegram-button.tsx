"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

export function ConnectTelegramButton() {
  const { getAccessToken, authenticated } = usePrivy();
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [link, setLink] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function start() {
    if (!authenticated) return;
    setStatus("loading");
    setMessage("");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("not authenticated");
      const res = await fetch("/api/telegram/init-pair", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "failed");
      setLink(data.deepLink);
      setStatus("ready");
      // Auto-open in a new tab — desktop opens TG web/app, mobile deep-links.
      window.open(data.deepLink, "_blank");
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message ?? String(e));
    }
  }

  return (
    <div className="inline-flex items-center gap-2">
      <button
        onClick={start}
        disabled={status === "loading" || !authenticated}
        className="text-xs uppercase tracking-widest border border-ash px-3 py-1.5 text-bone/60 hover:text-gold hover:border-gold transition disabled:opacity-30"
      >
        {status === "loading" ? "opening…" : status === "ready" ? "📱 telegram linked" : "📱 connect telegram"}
      </button>
      {status === "ready" && link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="text-[10px] text-bone/40 hover:text-gold underline"
        >
          re-open
        </a>
      )}
      {status === "error" && (
        <span className="text-[10px] text-rust" title={message}>
          ✗
        </span>
      )}
    </div>
  );
}
