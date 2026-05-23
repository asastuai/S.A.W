import { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import {
  AGENT_WALLET_PROGRAM_ID,
  APPROVAL_QUEUE_PROGRAM_ID,
  POLICY_REGISTRY_PROGRAM_ID,
} from "./program-ids";

export function deriveWalletPda(
  owner: PublicKey,
  salt: Buffer
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("wallet"), owner.toBuffer(), salt],
    AGENT_WALLET_PROGRAM_ID
  );
}

export function derivePolicyPda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("policy"), wallet.toBuffer()],
    POLICY_REGISTRY_PROGRAM_ID
  );
}

export function deriveQueuePda(wallet: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("queue"), wallet.toBuffer()],
    APPROVAL_QUEUE_PROGRAM_ID
  );
}

export function deriveRequestPda(
  wallet: PublicKey,
  id: BN
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("request"), wallet.toBuffer(), id.toArrayLike(Buffer, "le", 8)],
    APPROVAL_QUEUE_PROGRAM_ID
  );
}

/**
 * Generate a 32-byte salt for wallet PDA derivation.
 *
 * SECURITY: must use a CSPRNG. The original implementation used
 * Math.random() which is NOT cryptographically secure and is predictable
 * across calls. While not directly exploitable today (the program
 * requires the owner signature on initialize), low-entropy salts could
 * enable PDA collision attacks or pre-image attacks if the wallet
 * derivation logic ever changes. Always use crypto.getRandomValues
 * (browser) or crypto.randomBytes (Node).
 */
export function randomSalt(): Buffer {
  // Prefer Node's crypto.randomBytes when available; fall back to the
  // Web Crypto API in browsers. Both are CSPRNG-backed.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodeCrypto: any =
    typeof globalThis !== "undefined" &&
    typeof (globalThis as any).process !== "undefined" &&
    typeof require !== "undefined"
      ? (() => {
          try {
            return require("crypto");
          } catch {
            return null;
          }
        })()
      : null;
  if (nodeCrypto?.randomBytes) {
    return nodeCrypto.randomBytes(32) as Buffer;
  }
  const webCrypto =
    typeof globalThis !== "undefined" && (globalThis as any).crypto;
  if (webCrypto?.getRandomValues) {
    const arr = new Uint8Array(32);
    webCrypto.getRandomValues(arr);
    return Buffer.from(arr);
  }
  throw new Error(
    "randomSalt: no CSPRNG available (Node crypto.randomBytes or Web Crypto getRandomValues required)"
  );
}
