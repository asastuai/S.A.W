"use client";

import { useState } from "react";

/**
 * Compact wallet address display: truncated middle, copy button, optional
 * explorer link. Used in headers, modals, anywhere we show a Solana
 * pubkey to the handler.
 */
export function AddressBadge({
  address,
  cluster = "devnet",
  label,
  showExplorerLink = true,
}: {
  address: string;
  cluster?: "devnet" | "mainnet" | "testnet";
  label?: string;
  showExplorerLink?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const truncated =
    address.length > 12
      ? `${address.slice(0, 4)}…${address.slice(-4)}`
      : address;

  function copy() {
    try {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  }

  const explorerUrl = `https://explorer.solana.com/address/${address}${
    cluster === "devnet" ? "?cluster=devnet" : ""
  }`;

  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      {label && (
        <span className="uppercase tracking-widest text-bone/40">{label}</span>
      )}
      <span className="font-mono text-bone/80">{truncated}</span>
      <button
        onClick={copy}
        title="Copy full address"
        aria-label="Copy address"
        className="text-bone/40 hover:text-gold transition"
      >
        {copied ? "✓" : "⧉"}
      </button>
      {showExplorerLink && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noreferrer"
          title="View in Solana Explorer"
          className="text-bone/40 hover:text-gold transition"
        >
          ↗
        </a>
      )}
    </span>
  );
}
