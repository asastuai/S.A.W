/**
 * SAW fee treasury — the Solana address that receives all collected fees.
 *
 * For v1 (devnet) this is a placeholder generated keypair the team controls.
 * Before mainnet this becomes a Squads multisig or PDA controlled by the SAW
 * governance program.
 *
 * Configure via NEXT_PUBLIC_SAW_TREASURY env var.
 */

import { PublicKey } from "@solana/web3.js";

const RAW = process.env.NEXT_PUBLIC_SAW_TREASURY;

export function getTreasuryAddress(): PublicKey {
  if (!RAW) {
    console.error(
      "[SAW] NEXT_PUBLIC_SAW_TREASURY is not set — refusing to fall back to System Program address. Set the env var to a real treasury address."
    );
    throw new Error("treasury not configured");
  }
  return new PublicKey(RAW);
}

export function getTreasuryAddressString(): string {
  if (!RAW) {
    console.error(
      "[SAW] NEXT_PUBLIC_SAW_TREASURY is not set — refusing to fall back to System Program address. Set the env var to a real treasury address."
    );
    throw new Error("treasury not configured");
  }
  return RAW;
}

export function isTreasuryConfigured(): boolean {
  return Boolean(RAW);
}
