"use client";

import { useEffect, useState } from "react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function WalletButton() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <span className="text-xs uppercase tracking-widest text-bone/40 border border-ash px-3 py-2">
        Loading wallet…
      </span>
    );
  }
  return <WalletMultiButton />;
}
